// ─────────────────────────────────────────────────────────────────────────────
//  A reunião aberta: gravação, índice e o que o Fireflies resumiu.
//
//  Mora aqui, e não na tela de Projetos, porque três lugares abrem a mesma
//  coisa: a aba de reuniões do projeto, o chip dentro da entrega e o chip
//  dentro da tarefa. Quem clica num chip quer ver a conversa - não quer ser
//  levado para outra aba e ter de procurar a reunião ali dentro.
//
//  O endereço do vídeo é buscado quando o modal abre, e não guardado: a URL da
//  CDN do Fireflies vem assinada e expira em poucos dias.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconX } from './icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { dia } from '../lib/datas';

/** O que este modal precisa saber de uma reunião. Estrutural de propósito: o
 *  `Reuniao` da tela de Projetos serve sem conversão, e este arquivo não passa
 *  a depender daquela tela. */
export interface ReuniaoAberta {
  assunto: string;
  data: string;
  notas: string;
  link?: string | null;
  /** Id no Fireflies. Sem ele não há gravação: é registro feito à mão. */
  fireflies_id?: string | null;
  /** O que veio do Fireflies, em JSON. */
  dados?: string | null;
}

/** O detalhe que o Fireflies mandou junto com a reunião. */
export interface DadosReuniao {
  duracao?: number | null;
  participantes?: string[];
  gist?: string | null;
  curto?: string | null;
  topicos?: string | null;
  notas?: string | null;
  palavras?: string[];
  acoes?: string | null;
  organizador?: string | null;
  reuniao_url?: string | null;
}

export function lerDados(bruto: string | null | undefined): DadosReuniao | null {
  if (!bruto) return null;
  try {
    const d = JSON.parse(bruto);
    return d && typeof d === 'object' ? d as DadosReuniao : null;
  } catch { return null; }
}

/** Um bloco da conversa, com o momento em que ele começa. */
export interface TopicoReuniao {
  titulo: string;
  /** Segundos desde o início da gravação. */
  inicio: number;
  rotulo: string;
  linhas: string[];
}

export const emSegundos = (mmss: string): number => {
  const p = mmss.split(':').map(n => Number(n));
  if (p.some(n => !Number.isFinite(n))) return 0;
  // "07:21" e "1:02:11" - o Fireflies usa os dois conforme a duração.
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

/** Transforma o `shorthand_bullet` do Fireflies na linha do tempo.
 *
 *  O formato de lá é `EMOJI **Título** (01:48 - 02:00)` seguido das linhas de
 *  descrição. O emoji é descartado: dentro do produto ele não entra, e aqui
 *  seria decoração vinda de fora. */
export function lerTopicos(texto: string | null | undefined): TopicoReuniao[] {
  if (!texto) return [];
  const topicos: TopicoReuniao[] = [];
  for (const linha of texto.split('\n')) {
    const cabeca = linha.match(/\*\*(.+?)\*\*\s*\((\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\)/);
    if (cabeca) {
      topicos.push({
        titulo: cabeca[1].trim(),
        inicio: emSegundos(cabeca[2]),
        rotulo: cabeca[2],
        linhas: [],
      });
      continue;
    }
    const corpo = linha.trim();
    if (corpo && topicos.length > 0) topicos[topicos.length - 1].linhas.push(corpo);
  }
  return topicos;
}

/** Os itens de ação, que vêm agrupados por pessoa em `**Nome**`. */
export interface AcaoReuniao {
  quem: string;
  itens: { texto: string; rotulo: string | null; inicio: number }[];
}

export function lerAcoes(texto: string | null | undefined): AcaoReuniao[] {
  if (!texto) return [];
  const grupos: AcaoReuniao[] = [];
  for (const linha of texto.split('\n')) {
    const nome = linha.trim().match(/^\*\*(.+?)\*\*$/);
    if (nome) { grupos.push({ quem: nome[1].trim(), itens: [] }); continue; }
    const corpo = linha.trim();
    if (!corpo || grupos.length === 0) continue;
    const quando = corpo.match(/\((\d{1,2}:\d{2}(?::\d{2})?)\)\s*$/);
    grupos[grupos.length - 1].itens.push({
      texto: quando ? corpo.slice(0, quando.index).trim() : corpo,
      rotulo: quando ? quando[1] : null,
      inicio: quando ? emSegundos(quando[1]) : 0,
    });
  }
  return grupos.filter(g => g.itens.length > 0);
}

/** O texto do Fireflies vem em markdown, e o que ele usa é o negrito: sem
 *  tratar, a nota aparece com `**` cru no meio da frase. Não é um interpretador
 *  de markdown - é o mínimo que o conteúdo pede, e o resto passa como texto. */
export function ComNegrito({ texto }: { texto: string }) {
  const partes = texto.split('**');
  return (
    <>
      {partes.map((p, i) => (
        // Índice ímpar é o que estava entre os dois asteriscos.
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      ))}
    </>
  );
}

const fmtData = (v: string | null) => dia(v, '');

/**
 * A reunião inteira num modal central: o vídeo em cima, o índice com a
 * minutagem e os resumos do Fireflies embaixo.
 *
 * Clicar num assunto - ou no horário de um combinado - move o vídeo para
 * aquele instante: é o mesmo `currentTime` que a barra do player usa.
 */
export function ReuniaoModal({ reuniao, buscarGravacao, onFechar }: {
  reuniao: ReuniaoAberta;
  /** Devolve as mídias assinadas do Fireflies. */
  buscarGravacao: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onFechar: () => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const player = useRef<HTMLVideoElement>(null);
  const [midia, setMidia] = useState<{ video: string | null; audio: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(0);

  const dados = lerDados(reuniao.dados);
  const topicos = lerTopicos(dados?.topicos);
  const acoes = lerAcoes(dados?.acoes);
  const resumo = (dados?.notas ?? dados?.curto ?? dados?.gist ?? reuniao.notas ?? '').trim();

  useEffect(() => {
    // Registro feito à mão não tem gravação para buscar; o modal vale pela
    // nota e pelo que mais estiver ali.
    if (!reuniao.fireflies_id) return;
    let vivo = true;
    buscarGravacao(reuniao.fireflies_id)
      .then(d => {
        if (!vivo) return;
        if (d?.error) setErro(d.error);
        else setMidia({ video: d.video ?? null, audio: d.audio ?? null });
      })
      .catch(() => { if (vivo) setErro('Não foi possível buscar a gravação.'); });
    return () => { vivo = false; };
  }, [reuniao.fireflies_id]);

  const irPara = (segundos: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = segundos;
    void el.play().catch(() => { /* o navegador pode exigir gesto; a barra move igual */ });
  };

  // O tópico em curso é o último que já começou.
  const emCurso = topicos.reduce((atual, t, i) => (t.inicio <= agora ? i : atual), -1);
  const temPlayer = !!midia?.video || !!midia?.audio;

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10002 }} {...fundo}>
      <div className="modal-central" onClick={e => e.stopPropagation()}>
        {/* Título, data e atalho na mesma linha: o vídeo é o conteúdo, e o
            cabeçalho não pode comer altura de tela por causa de duas linhas. */}
        <div className="gravacao-topo">
          <p className="gravacao-titulo">
            <span className="gravacao-nome" title={reuniao.assunto}>{reuniao.assunto}</span>
            <span className="gravacao-meta">
              {fmtData(reuniao.data)}
              {dados?.duracao ? ` · ${dados.duracao} min` : ''}
              {reuniao.link ? ' · ' : ''}
              {reuniao.link && (
                <a href={reuniao.link} target="_blank" rel="noopener noreferrer">
                  ver no Fireflies
                </a>
              )}
            </span>
          </p>
          <button type="button" className="admin-modal-close" onClick={fechar}
            aria-label="Fechar a reunião">
            <IconX size={16} />
          </button>
        </div>

        <div className="gravacao-corpo">
          {!reuniao.fireflies_id ? null : erro ? (
            <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
          ) : !midia ? (
            <div className="dux-spinner-row" style={{ padding: '48px' }}>
              <span className="dux-spinner" />
            </div>
          ) : midia.video ? (
            <video ref={player} className="gravacao-video" src={midia.video} controls
              onTimeUpdate={e => setAgora((e.target as HTMLVideoElement).currentTime)} />
          ) : (
            <div className="gravacao-so-audio">
              <p>Esta reunião só tem áudio.</p>
              {/* O `video` toca áudio também; assim a linha do tempo continua
                  valendo, com o mesmo `currentTime`. */}
              <video ref={player} className="gravacao-audio" src={midia.audio ?? undefined} controls
                onTimeUpdate={e => setAgora((e.target as HTMLVideoElement).currentTime)} />
            </div>
          )}

          {resumo && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Resumo</p>
              <p className="gravacao-resumo"><ComNegrito texto={resumo} /></p>
            </div>
          )}

          {topicos.length > 0 && (
            <div className="gravacao-linha-tempo">
              <p className="gravacao-secao">Assuntos</p>
              {topicos.map((t, i) => (
                <button key={`${t.inicio}-${i}`} type="button"
                  className={`gravacao-topico${i === emCurso ? ' agora' : ''}`}
                  // Sem player não há para onde ir: o índice vira leitura.
                  disabled={!temPlayer}
                  onClick={() => irPara(t.inicio)}>
                  <span className="gravacao-tempo">{t.rotulo}</span>
                  <span className="gravacao-topico-texto">
                    <strong>{t.titulo}</strong>
                    {t.linhas.length > 0 && <span><ComNegrito texto={t.linhas.join(' ')} /></span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {acoes.length > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Combinados</p>
              {acoes.map(g => (
                <div key={g.quem} className="reuniao-acao-grupo">
                  <p className="reuniao-quem">{g.quem}</p>
                  <ul>
                    {g.itens.map((it, i) => (
                      <li key={i}>
                        <ComNegrito texto={it.texto} />
                        {it.rotulo && (
                          temPlayer ? (
                            <button type="button" className="gravacao-marca"
                              title="Ir para este ponto da gravação"
                              onClick={() => irPara(it.inicio)}>{it.rotulo}</button>
                          ) : <span className="reuniao-tempo">{it.rotulo}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {(dados?.palavras?.length ?? 0) > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Palavras-chave</p>
              <div className="reuniao-palavras">
                {dados!.palavras!.map(p => <span key={p} className="reuniao-palavra">{p}</span>)}
              </div>
            </div>
          )}

          {(dados?.participantes?.length ?? 0) > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Quem participou</p>
              <p className="reuniao-gente">{dados!.participantes!.join(' · ')}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
