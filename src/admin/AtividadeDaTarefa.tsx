// ─────────────────────────────────────────────────────────────────────────────
//  Atividade da tarefa: o diário e a conversa.
//
//  Duas coisas diferentes, e por isso duas abas. O diário é escrito pelo
//  sistema, não se responde e não se apaga - é o que aconteceu. A conversa é
//  escrita por gente, tem thread, marcação e anexo. Misturar as duas numa lista
//  só faz a conversa se perder no meio de vinte "mudou o prazo".
//
//  Vive fora das telas porque o formulário de tarefa é compartilhado entre a
//  tela de Tarefas e o relatório de Gestão, e ele é quem monta isto aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconAlert, IconChevronRight, IconClip, IconDownload, IconTrash, IconX,
} from '../components/icons';
import { Avatar, type Pessoa } from './FormularioTarefa';

/** Uma linha do diário, como o servidor a devolve. */
interface Evento {
  id: number;
  usuario_id: string | null;
  usuario_nome: string;
  acao: string;
  campo: string | null;
  de: string | null;
  para: string | null;
  criado_em: string;
}

interface AnexoDoComentario {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
}

interface Comentario {
  id: number;
  pai_id: number | null;
  usuario_id: string | null;
  usuario_nome: string;
  foto_url: string | null;
  texto: string;
  criado_em: string;
  editado_em: string | null;
  mencoes: { usuario_id: string; nome: string | null }[];
  anexos: AnexoDoComentario[];
}

/** Anexo ainda no navegador, esperando o envio do comentário. */
interface AnexoPendente {
  nome: string;
  tipo: string;
  tamanho: number;
  base64: string;
}

const LIMITE_ANEXO = 8 * 1024 * 1024;

const fmtTamanho = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** "há 5 min", "ontem", "12/03". Perto do fato o relativo é mais legível; longe
 *  dele o relativo vira charada e a data resolve. */
function quando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const seg = Math.round((Date.now() - d.getTime()) / 1000);
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** Rótulo de cada campo no diário. */
const NOME_DO_CAMPO: Record<string, string> = {
  titulo: 'o título',
  descricao: 'a descrição',
  status: 'a etapa',
  prioridade: 'a prioridade',
  responsavel: 'o responsável',
  prazo: 'o prazo',
  entrega: 'a entrega',
  etiquetas: 'as etiquetas',
};

/** A frase de um evento, montada a partir do que mudou. */
function frase(e: Evento): { texto: string; de: string | null; para: string | null } {
  if (e.acao === 'criou') return { texto: 'criou a tarefa', de: null, para: null };
  if (e.acao === 'concluiu') return { texto: 'concluiu a tarefa', de: null, para: null };
  if (e.acao === 'reabriu') return { texto: 'reabriu a tarefa', de: null, para: null };
  const campo = NOME_DO_CAMPO[e.campo ?? ''] ?? e.campo ?? 'um campo';
  // Sem valores gravados (a descrição é assim) a frase para no verbo: dizer
  // "de vazio para vazio" seria pior que não dizer nada.
  if (!e.de && !e.para) return { texto: `editou ${campo}`, de: null, para: null };
  return { texto: `alterou ${campo}`, de: e.de, para: e.para };
}

/** Texto com marcações, dividido em pedaços para o chip ser desenhado.
 *  O formato gravado é `@[Nome](id)`: guarda o nome do momento e o id para a
 *  ligação, sem depender de o nome continuar igual daqui a um ano. */
const MARCA = /@\[([^\]]+)\]\(([^)]+)\)/g;

function pedacos(texto: string): { tipo: 'texto' | 'marca'; valor: string; id?: string }[] {
  const saida: { tipo: 'texto' | 'marca'; valor: string; id?: string }[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCA)) {
    if (m.index > ultimo) saida.push({ tipo: 'texto', valor: texto.slice(ultimo, m.index) });
    saida.push({ tipo: 'marca', valor: m[1], id: m[2] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) saida.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return saida;
}

/** Os ids marcados dentro do texto, para o servidor gravar a ligação. */
function idsMarcados(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCA)].map(m => m[2]))];
}

function TextoDoComentario({ texto }: { texto: string }) {
  return (
    <p className="ativ-texto">
      {pedacos(texto).map((p, i) => (
        p.tipo === 'marca'
          ? <span key={i} className="ativ-marca">@{p.valor}</span>
          : <span key={i}>{p.valor}</span>
      ))}
    </p>
  );
}

/** Caixa de escrita, com marcação por `@` e anexos. */
function Escrever({ pessoas, autoFoco, rotuloEnvio, enviando, onEnviar, onCancelar }: {
  pessoas: Pessoa[];
  autoFoco?: boolean;
  rotuloEnvio: string;
  enviando: boolean;
  onEnviar: (texto: string, anexos: AnexoPendente[]) => void;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  /** Busca aberta pelo `@`: o trecho digitado depois dele e onde ele começa. */
  const [busca, setBusca] = useState<{ termo: string; inicio: number } | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /** Procura um `@` em aberto imediatamente antes do cursor. Só vale se ele
   *  começar palavra: um e-mail digitado no meio da frase não abre a lista. */
  function verMarcacao(valor: string, cursor: number) {
    const antes = valor.slice(0, cursor);
    const m = /(^|\s)@([^\s@]*)$/.exec(antes);
    if (!m) { setBusca(null); return; }
    setBusca({ termo: m[2], inicio: cursor - m[2].length - 1 });
  }

  const candidatos = busca
    ? pessoas.filter(p => p.nome.toLocaleLowerCase('pt-BR')
        .includes(busca.termo.toLocaleLowerCase('pt-BR'))).slice(0, 6)
    : [];

  function marcar(p: Pessoa) {
    if (!busca) return;
    const el = campo.current;
    const cursor = el?.selectionStart ?? texto.length;
    const novo = `${texto.slice(0, busca.inicio)}@[${p.nome}](${p.id}) ${texto.slice(cursor)}`;
    setTexto(novo);
    setBusca(null);
    // Devolve o foco e põe o cursor depois da marcação recém-inserida.
    requestAnimationFrame(() => {
      const pos = busca.inicio + `@[${p.nome}](${p.id}) `.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  async function escolherArquivos(lista: FileList | null) {
    setErro(null);
    const novos: AnexoPendente[] = [];
    for (const f of Array.from(lista ?? [])) {
      if (f.size > LIMITE_ANEXO) {
        setErro(`"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      const base64 = await new Promise<string>(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
        fr.readAsDataURL(f);
      });
      novos.push({ nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64 });
    }
    setAnexos(a => [...a, ...novos]);
    if (arquivo.current) arquivo.current.value = '';
  }

  function enviar() {
    const limpo = texto.trim();
    if (!limpo && anexos.length === 0) return;
    onEnviar(limpo, anexos);
    setTexto('');
    setAnexos([]);
    setErro(null);
  }

  return (
    <div className="ativ-escrever">
      <div className="ativ-campo-caixa">
        <textarea
          ref={campo}
          className="form-input ativ-campo"
          rows={2}
          value={texto}
          autoFocus={autoFoco}
          placeholder="Escreva um comentário. Use @ para marcar alguém."
          onChange={e => { setTexto(e.target.value); verMarcacao(e.target.value, e.target.selectionStart); }}
          onKeyDown={e => {
            if (e.key === 'Escape' && busca) { e.preventDefault(); setBusca(null); return; }
            // Enter envia, Shift+Enter quebra linha: é o que a mão já espera de
            // uma caixa de comentário.
            if (e.key === 'Enter' && !e.shiftKey && !busca) { e.preventDefault(); enviar(); }
          }}
          onBlur={() => setTimeout(() => setBusca(null), 120)}
        />
        {busca && candidatos.length > 0 && (
          <ul className="ativ-mencoes" role="listbox">
            {candidatos.map(p => (
              <li key={p.id}>
                <button type="button" onMouseDown={e => { e.preventDefault(); marcar(p); }}>
                  <Avatar nome={p.nome} foto={p.foto_url} size={20} />
                  <span>{p.nome}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {anexos.length > 0 && (
        <ul className="ativ-anexos">
          {anexos.map((a, i) => (
            <li key={i}>
              <IconClip size={12} />
              <span className="ativ-anexo-nome">{a.nome}</span>
              <span className="ativ-anexo-peso">{fmtTamanho(a.tamanho)}</span>
              <button type="button" aria-label={`Tirar ${a.nome}`}
                onClick={() => setAnexos(x => x.filter((_, k) => k !== i))}>
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="ativ-erro"><IconAlert size={12} />{erro}</p>}

      <div className="ativ-acoes">
        <input ref={arquivo} type="file" multiple hidden
          onChange={e => void escolherArquivos(e.target.files)} />
        <button type="button" className="ativ-botao-fraco" onClick={() => arquivo.current?.click()}>
          <IconClip size={13} />
          Anexar
        </button>
        <span style={{ flex: 1 }} />
        {onCancelar && (
          <button type="button" className="ativ-botao-fraco" onClick={onCancelar}>Cancelar</button>
        )}
        <button type="button" className="ativ-botao" disabled={enviando || (!texto.trim() && !anexos.length)}
          onClick={enviar}>
          {enviando ? 'Enviando…' : rotuloEnvio}
        </button>
      </div>
    </div>
  );
}

function Comentario({ c, respostas, pessoas, usuarioId, podeComentar, enviando,
  respondendo, onResponder, onEnviarResposta, onExcluir, onBaixar }: {
  c: Comentario;
  respostas: Comentario[];
  pessoas: Pessoa[];
  usuarioId: string | undefined;
  podeComentar: boolean;
  enviando: boolean;
  respondendo: boolean;
  onResponder: (id: number | null) => void;
  onEnviarResposta: (texto: string, anexos: AnexoPendente[]) => void;
  onExcluir: (c: Comentario) => void;
  onBaixar: (a: AnexoDoComentario) => void;
}) {
  const meu = !!usuarioId && c.usuario_id === usuarioId;
  /** Respostas à vista. Nascem fechadas. */
  const [abertas, setAbertas] = useState(false);

  const bloco = (x: Comentario, resposta: boolean) => (
    <div key={x.id} className={`ativ-comentario${resposta ? ' resposta' : ''}`}>
      <Avatar nome={x.usuario_nome} foto={x.foto_url} size={resposta ? 22 : 26} />
      <div className="ativ-corpo">
        <p className="ativ-cabeca">
          <strong>{x.usuario_nome}</strong>
          <span title={fmtDataHora(x.criado_em)}>{quando(x.criado_em)}</span>
          {(!!usuarioId && x.usuario_id === usuarioId) && (
            <button type="button" className="ativ-apagar" title="Apagar comentário"
              aria-label="Apagar comentário" onClick={() => onExcluir(x)}>
              <IconTrash size={12} />
            </button>
          )}
        </p>
        {x.texto && <TextoDoComentario texto={x.texto} />}
        {x.anexos.length > 0 && (
          <ul className="ativ-anexos">
            {x.anexos.map(a => (
              <li key={a.id}>
                <IconClip size={12} />
                <span className="ativ-anexo-nome">{a.nome}</span>
                <span className="ativ-anexo-peso">{fmtTamanho(a.tamanho)}</span>
                <button type="button" aria-label={`Baixar ${a.nome}`} onClick={() => onBaixar(a)}>
                  <IconDownload size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="ativ-thread">
      {bloco(c, false)}

      {/* As respostas nascem recolhidas: uma conversa com quatro comentários e
          quinze respostas vira uma parede, e o que se procura é o comentário,
          não cada volta dele. Abre uma vez e fica aberta - é o `.revelar` da
          casa, que precisa do conteúdo montado para a altura ter de onde
          crescer. */}
      {respostas.length > 0 && (
        <>
          <button type="button" className="ativ-link ativ-abrir-respostas"
            aria-expanded={abertas} onClick={() => setAbertas(v => !v)}>
            <span className={`entrega-seta${abertas ? ' aberta' : ''}`}>
              <IconChevronRight size={11} />
            </span>
            {abertas
              ? 'Ocultar respostas'
              : `${respostas.length} resposta${respostas.length > 1 ? 's' : ''}`}
          </button>
          <div className={`revelar${abertas ? ' aberto' : ''}`}>
            <div>
              {respostas.map(r => bloco(r, true))}
            </div>
          </div>
        </>
      )}
      {podeComentar && (
        respondendo
          ? (
            <div className="ativ-responder">
              <Escrever pessoas={pessoas} autoFoco rotuloEnvio="Responder" enviando={enviando}
                onEnviar={onEnviarResposta} onCancelar={() => onResponder(null)} />
            </div>
          )
          : (
            <button type="button" className="ativ-link" onClick={() => onResponder(c.id)}>
              Responder
            </button>
          )
      )}
      {meu && null}
    </div>
  );
}

export function AtividadeDaTarefa({ tarefaId, pessoas, usuarioId, podeComentar, api }: {
  tarefaId: number;
  pessoas: Pessoa[];
  usuarioId: string | undefined;
  podeComentar: boolean;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
}) {
  const [aba, setAba] = useState<'conversa' | 'diario'>('conversa');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState<number | null>(null);
  /** O que o servidor recusou, com o texto de volta para não se perder. */
  const [falhou, setFalhou] = useState<{ texto: string; erro: string } | null>(null);

  const carregar = useCallback(async () => {
    const r = await api(`?action=tarefa_atividade&id=${tarefaId}`);
    setEventos(r?.eventos ?? []);
    setComentarios(r?.comentarios ?? []);
    setCarregando(false);
  }, [api, tarefaId]);

  useEffect(() => { setCarregando(true); void carregar(); }, [carregar]);

  async function enviar(texto: string, anexos: AnexoPendente[], paiId: number | null) {
    // O balão sobe no gesto. Antes eram duas idas ao servidor antes de aparecer
    // qualquer coisa - gravar e depois reler a conversa inteira -, e o que se
    // escreveu ficava sumido nesse meio tempo.
    const eu = pessoas.find(p => p.id === usuarioId);
    const provisorio: Comentario = {
      // Id negativo: não colide com nenhum do servidor, e some quando a
      // conversa é relida com o id de verdade.
      id: -Date.now(),
      pai_id: paiId,
      usuario_id: usuarioId ?? null,
      usuario_nome: eu?.nome ?? 'Você',
      foto_url: eu?.foto_url ?? null,
      texto,
      criado_em: new Date().toISOString(),
      editado_em: null,
      mencoes: [],
      anexos: anexos.map((a, i) => ({
        id: -Date.now() - i, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
      })),
    };
    setComentarios(cs => [...cs, provisorio]);
    setRespondendo(null);
    setFalhou(null);

    const r = await api('', 'POST', {
      action: 'add_tarefa_comentario',
      tarefa_id: tarefaId, pai_id: paiId, texto,
      mencoes: idsMarcados(texto), anexos,
    });
    if (r?.error) {
      // Tira o balão e devolve o texto: quem escreveu não perde o que escreveu
      // porque o servidor recusou.
      setComentarios(cs => cs.filter(c => c.id !== provisorio.id));
      setFalhou({ texto, erro: String(r.error) });
      return;
    }
    // Troca o provisório pelo gravado: id de verdade, menções conferidas e
    // anexos com o id com que serão baixados.
    void carregar();
  }

  async function excluir(c: Comentario) {
    // Some da tela na hora: apagar a própria fala é decisão de quem escreveu, e
    // esperar a volta do servidor para ver o efeito é atrito à toa.
    setComentarios(cs => cs.filter(x => x.id !== c.id && x.pai_id !== c.id));
    const r = await api('', 'POST', { action: 'excluir_tarefa_comentario', id: c.id });
    if (r?.error) await carregar();
  }

  async function baixar(a: AnexoDoComentario) {
    const r = await api(`?action=tarefa_comentario_anexo_base64&id=${a.id}`);
    if (!r?.base64) return;
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  const conversas = comentarios.filter(c => c.pai_id == null);
  const respostasDe = (id: number) => comentarios.filter(c => c.pai_id === id);

  return (
    <div className="ativ">
      <div className="ativ-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'conversa'}
          className={aba === 'conversa' ? 'ativa' : undefined}
          onClick={() => setAba('conversa')}>
          Comentários
          {comentarios.length > 0 && <span className="ativ-conta">{comentarios.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={aba === 'diario'}
          className={aba === 'diario' ? 'ativa' : undefined}
          onClick={() => setAba('diario')}>
          Atividade
          {eventos.length > 0 && <span className="ativ-conta">{eventos.length}</span>}
        </button>
      </div>

      {/* A chave é a aba: trocá-la remonta o conteúdo, e é a remontagem que faz
          a entrada tocar. É o mesmo `.aba-painel` das abas do painel de
          projeto - trocar de aba num quadro só não é lido, é notado. */}
      <div className="aba-painel" key={aba}>
      {carregando ? (
        <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
      ) : aba === 'conversa' ? (
        // A conversa vem antes do campo, e o campo fecha a coluna: quem chega
        // lê o que foi dito e escreve embaixo, que é a ordem de qualquer
        // conversa. Com o campo em cima, o último comentário ficava longe de
        // onde se responde.
        <>
          {conversas.length === 0
            ? <p className="ativ-vazio">Nenhum comentário ainda.</p>
            : conversas.map(c => (
              <Comentario
                key={c.id}
                c={c}
                respostas={respostasDe(c.id)}
                pessoas={pessoas}
                usuarioId={usuarioId}
                podeComentar={podeComentar}
                enviando={enviando}
                respondendo={respondendo === c.id}
                onResponder={setRespondendo}
                onEnviarResposta={(t, a) => void enviar(t, a, c.id)}
                onExcluir={c2 => void excluir(c2)}
                onBaixar={a => void baixar(a)}
              />
            ))}
          {podeComentar && (
            <div className="ativ-escrever-pe">
              {falhou && (
                <p className="ativ-falha surge">
                  <IconAlert size={13} />
                  <span>
                    {falhou.erro}
                    <em>{falhou.texto}</em>
                  </span>
                </p>
              )}
              <Escrever pessoas={pessoas} rotuloEnvio="Comentar" enviando={enviando}
                onEnviar={(t, a) => void enviar(t, a, null)} />
            </div>
          )}
        </>
      ) : eventos.length === 0 ? (
        <p className="ativ-vazio">Nada registrado ainda.</p>
      ) : (
        <ul className="ativ-diario">
          {eventos.map(e => {
            const f = frase(e);
            return (
              <li key={e.id}>
                <span className="ativ-ponto" aria-hidden="true" />
                <span className="ativ-diario-texto">
                  <strong>{e.usuario_nome}</strong> {f.texto}
                  {f.para && (
                    <>
                      {f.de ? <> de <em>{f.de}</em></> : null}
                      {' '}para <em>{f.para}</em>
                    </>
                  )}
                  {!f.para && f.de && <> (era <em>{f.de}</em>)</>}
                </span>
                <span className="ativ-diario-quando" title={fmtDataHora(e.criado_em)}>
                  {quando(e.criado_em)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </div>
  );
}
