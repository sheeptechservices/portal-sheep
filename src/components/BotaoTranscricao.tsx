// ─────────────────────────────────────────────────────────────────────────────
//  Baixar a transcrição inteira de uma reunião.
//
//  O portal mostra o que a conversa resumiu - o resumo, os assuntos com
//  minutagem, os combinados. A transcrição completa é outra coisa: são centenas
//  de falas, que ninguém lê na tela e que se quer em arquivo, para procurar uma
//  frase, colar num documento ou mandar para alguém de fora.
//
//  Por isso ela não fica guardada: é buscada no Fireflies no momento do clique
//  e vira arquivo ali mesmo. Guardar o texto todo no banco seria carregá-lo com
//  o que se lê uma vez.
//
//  O botão mora aqui, e não em cada tela, porque ele aparece nos dois lugares
//  onde uma reunião se abre: o modal central e o corpo do chip expandido.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { IconAlert, IconDownload, IconSpinner } from './icons';

/** Uma fala, como o servidor a devolve. */
interface Frase {
  /** Segundos desde o começo da gravação. */
  inicio: number;
  quem: string;
  texto: string;
}

export interface Transcricao {
  titulo: string;
  data: string | null;
  duracao: number | null;
  participantes: string[];
  frases: Frase[];
  error?: string;
}

/** `07:21`, e `1:02:11` quando passa da hora - a mesma leitura do índice de
 *  assuntos da reunião. */
function momento(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  return h > 0
    ? `${h}:${doisDigitos(m)}:${doisDigitos(r)}`
    : `${doisDigitos(m)}:${doisDigitos(r)}`;
}

const dia = (v: string | null) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

/** O arquivo: um cabeçalho curto que situa a conversa, e as falas com o
 *  horário na frente. Texto puro de propósito - ele vai para dentro de um
 *  documento, de um e-mail ou de um campo de busca, e nenhum desses lugares
 *  sabe abrir formato nosso. */
export function textoDaTranscricao(t: Transcricao): string {
  const L: string[] = [t.titulo];
  const ficha = [dia(t.data), t.duracao ? `${t.duracao} min` : ''].filter(Boolean).join(' · ');
  if (ficha) L.push(ficha);
  if (t.participantes.length) L.push(`Participantes: ${t.participantes.join(', ')}`);
  L.push('');
  for (const f of t.frases) L.push(`[${momento(f.inicio)}] ${f.quem}: ${f.texto}`);
  return L.join('\n');
}

/** `Aurora-alinhamento_2026-09-01.txt`. O assunto vai no nome porque o arquivo
 *  costuma acabar numa pasta junto de outros. */
export function nomeDaTranscricao(t: Transcricao): string {
  const base = (t.titulo || 'Reuniao')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-')
    .slice(0, 60) || 'Reuniao';
  return `${base}_${(t.data ?? '').slice(0, 10) || 'sem-data'}.txt`;
}

export function BotaoTranscricao({ firefliesId, buscar, compacto }: {
  /** Sem id não há transcrição: a reunião foi escrita à mão. */
  firefliesId: string;
  buscar: (id: string) => Promise<Transcricao | null>;
  /** No corpo do chip o botão divide a linha com o de assistir, e ali ele é o
   *  secundário; no modal ele está sozinho. */
  compacto?: boolean;
}) {
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    setBaixando(true);
    setErro(null);
    const r = await buscar(firefliesId);
    setBaixando(false);
    if (!r || r.error || !r.frases?.length) {
      setErro(r?.error ?? 'Não foi possível buscar a transcrição.');
      return;
    }
    // Blob e não `data:`: uma reunião de uma hora passa de cem mil caracteres,
    // e o endereço de dados esbarra no teto do navegador.
    const url = URL.createObjectURL(new Blob([textoDaTranscricao(r)], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeDaTranscricao(r);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <>
      <button type="button" className="modal-acao" disabled={baixando}
        style={compacto ? { padding: '6px 12px', fontSize: 12.5 } : undefined}
        title="Baixar a transcrição completa em texto"
        onClick={() => void baixar()}>
        {baixando
          ? <><IconSpinner size={13} /> Buscando…</>
          : <><IconDownload size={13} /> Transcrição</>}
      </button>
      {erro && (
        <span className="ff-vazio ff-erro transcricao-erro surge">
          <IconAlert size={12} /> {erro}
        </span>
      )}
    </>
  );
}
