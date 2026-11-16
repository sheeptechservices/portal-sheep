// ─────────────────────────────────────────────────────────────────────────────
//  O chamado do cliente, na ficha da tarefa.
//
//  A tarefa que nasceu de um chamado do painel do cliente mostra, acima da
//  descrição, de onde ela veio: quem pediu, o contato, a urgência que o cliente
//  marcou e os links que ele mandou. Quando o cliente reabre, cada reabertura
//  entra aqui organizada - quem pediu de volta, quando, o que escreveu, os
//  links e os anexos daquela vez -, da mais nova para a mais antiga. Antes isso
//  existia só como um comentário corrido na conversa, misturado com o resto.
//
//  Tarefa que não veio de chamado não mostra nada: o bloco nem nasce.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import {
  IconArrowRight, IconBalao, IconChamado, IconChevronRight, IconDoc, IconEdit, IconEnviar, IconExternal, IconImage, IconLink,
  IconSpinner, IconTrash, IconUndo,
} from '../components/icons';
import { CampoTexto } from '../components/CampoTexto';
import { ConfirmarExclusao } from '../components/Dialogo';
import { useToast } from '../lib/toast';
import { useAuth } from './AdminApp';
import { TextoRico } from '../components/TextoRico';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { instante } from '../lib/datas';
import { ICONE_PRIORIDADE } from '../lib/prioridades';
import { ROTULO_DO_TIPO } from '../lib/tiposDoRelato';

interface AnexoDoChamado { id: number; nome: string; tipo: string; tamanho: number }
interface Reabertura {
  seq: number; autor: string; texto: string; links: string[]; criado_em: string; anexos: AnexoDoChamado[];
}
type CampoAjustavel = 'titulo' | 'descricao' | 'solicitante' | 'urgencia' | 'tipo';
const CAMPOS: CampoAjustavel[] = ['titulo', 'tipo', 'solicitante', 'urgencia', 'descricao'];
const NOME_DO_CAMPO: Record<CampoAjustavel, string> = {
  titulo: 'Título', descricao: 'Descrição', solicitante: 'Quem pede', urgencia: 'Urgência', tipo: 'Tipo',
};
/** Uma correção do cliente: nulo é o campo que ficou como estava. */
interface Ajuste extends Record<CampoAjustavel, string | null> { seq: number; autor: string; criado_em: string }
/** O que o time escreveu para o cliente. `id` negativo é o que ainda vai para
 *  o servidor; `minha` diz se quem lê pode apagar. */
interface Resposta { id: number; texto: string; autor: string; criado_em: string; minha: boolean }

interface Chamado {
  numero: number; titulo: string; solicitante: string; email: string | null; urgencia: string;
  respostas?: Resposta[];
  /** 'bug' ou 'melhoria', o que o cliente marcou. Nulo no chamado antigo. */
  tipo?: string | null;
  links: string[]; criado_em: string; reaberturas: Reabertura[]; ajustes?: Ajuste[];
}

/** O tipo pelo nome, e não pelo valor guardado. */
const nomeDoTipo = (v: string) => ROTULO_DO_TIPO[v]?.label ?? 'Sem tipo';

/** Cada correção com o que valia antes dela, para o "de → para". A descrição
 *  original não vem: a da tarefa já a traz, e a correção mostra a nova
 *  inteira. Sai da mais nova para a mais antiga, como as reaberturas. */
function passosDosAjustes(c: Chamado) {
  let v: Record<CampoAjustavel, string> = {
    titulo: c.titulo, descricao: '', solicitante: c.solicitante, urgencia: c.urgencia, tipo: c.tipo ?? '',
  };
  const passos = (c.ajustes ?? []).map(a => {
    const de = v;
    v = { ...v };
    for (const k of CAMPOS) if (a[k] != null) v[k] = a[k]!;
    return { ajuste: a, de };
  });
  return passos.reverse();
}

/** O endereço como se lê: o domínio e o começo do caminho. */
function rotuloDoLink(url: string): string {
  try {
    const u = new URL(url);
    const curto = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
    return curto.length > 48 ? `${curto.slice(0, 47)}…` : curto;
  } catch { return url; }
}

function Links({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <ul className="chamado-tarefa-links">
      {links.map(l => (
        <li key={l}>
          <a href={l} target="_blank" rel="noopener noreferrer nofollow" title={l}>
            <IconLink size={12} /> <span>{rotuloDoLink(l)}</span> <IconExternal size={11} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** O começo da resposta numa linha, para a resposta recolhida: sem as marcas
 *  de negrito, itálico, sublinhado e lista, e com as quebras viradas espaço. */
function previaDoTexto(texto: string): string {
  return texto
    .replace(/\*\*|__|\*/g, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A conversa com o cliente, dentro do bloco do chamado. O que se escreve aqui
 * aparece no painel de chamados dele, dentro do chamado - e é a única coisa
 * que sai da ficha para fora: o comentário da tarefa continua interno. Por
 * isso o campo mora aqui, longe da conversa do time, e o botão diz para onde
 * o texto vai.
 *
 * O campo é o CampoTexto da casa (negrito, itálico, sublinhado, lista), e a
 * resposta aparece na hora: vai ao servidor por baixo e volta atrás se ele
 * recusar.
 */
function RespostasAoCliente({ tarefaId, api, respostas, onMudar }: {
  tarefaId: number;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  respostas: Resposta[];
  onMudar: (r: Resposta[]) => void;
}) {
  const { usuario } = useAuth();
  const { toast } = useToast();
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState('');
  const [apagando, setApagando] = useState<Resposta | null>(null);
  /** As respostas abertas. Nascem recolhidas - uma resposta longa ocupava a
   *  ficha inteira -, e a que acabou de ser enviada já vem aberta. */
  const [abertas, setAbertas] = useState<Set<number>>(() => new Set());
  const alternar = (id: number) => setAbertas(a => {
    const n = new Set(a);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const caixa = useRef<HTMLDivElement | null>(null);
  // O lado de dentro do `.revelar` fica montado; o foco vai quando ele abre.
  useEffect(() => {
    if (escrevendo) window.setTimeout(() => caixa.current?.focus(), 60);
  }, [escrevendo]);

  async function enviar() {
    const limpo = texto.trim();
    if (limpo.length < 2) return;
    const provisoria: Resposta = {
      id: -Date.now(), texto: limpo, autor: usuario?.nome ?? 'Você', criado_em: new Date().toISOString(), minha: true,
    };
    const antes = respostas;
    onMudar([...antes, provisoria]);
    setAbertas(a => new Set(a).add(provisoria.id));
    setTexto('');
    setEscrevendo(false);
    const r = await api('', 'POST', { action: 'responder_chamado_cliente', tarefa_id: tarefaId, texto: limpo })
      .catch(() => null);
    if (!r || r.error) {
      onMudar(antes);
      setTexto(limpo);
      setEscrevendo(true);
      toast('error', 'A resposta não foi enviada', r?.error ?? 'O servidor não respondeu. Tente de novo.');
      return;
    }
    onMudar([...antes, { ...provisoria, id: Number(r.id), criado_em: String(r.criado_em ?? provisoria.criado_em) }]);
    // A aberta troca de chave junto com o id: a provisória vira a definitiva.
    setAbertas(a => { const n = new Set(a); n.delete(provisoria.id); n.add(Number(r.id)); return n; });
  }

  async function apagar(alvo: Resposta) {
    setApagando(null);
    const antes = respostas;
    onMudar(antes.filter(x => x.id !== alvo.id));
    const r = await api('', 'POST', { action: 'apagar_resposta_chamado_cliente', id: alvo.id }).catch(() => null);
    if (!r || r.error) {
      onMudar(antes);
      toast('error', 'A resposta não foi apagada', r?.error ?? 'O servidor não respondeu. Tente de novo.');
    }
  }

  return (
    <div className="chamado-tarefa-respostas">
      <p className="chamado-tarefa-respostas-titulo">
        <IconBalao size={12} /> Respostas ao cliente
        <span>aparecem no painel de chamados dele</span>
      </p>

      {respostas.length > 0 && (
        <ol className="chamado-tarefa-reaberturas">
          {respostas.map(r => {
            const aberta = abertas.has(r.id);
            return (
              <li key={r.id} className={`chamado-tarefa-reabertura resposta${r.id < 0 ? ' enviando' : ''}`}>
                {/* A linha do alto abre e recolhe. A lixeira mora fora dela:
                    botão dentro de botão não existe. */}
                <div className="chamado-tarefa-resposta-topo">
                  <button type="button" className="chamado-tarefa-resposta-alternar" aria-expanded={aberta}
                    title={aberta ? 'Recolher a resposta' : 'Abrir a resposta'}
                    onClick={() => alternar(r.id)}>
                    <span className={`entrega-seta${aberta ? ' aberta' : ''}`}><IconChevronRight size={12} /></span>
                    <strong>{r.autor}</strong>
                    <span className="chamado-tarefa-resposta-quando">{instante(r.criado_em)}</span>
                    {/* Recolhida, o começo do texto: dá para saber qual é
                        sem abrir. Aberta, o texto inteiro mora embaixo. */}
                    <span className={`chamado-tarefa-resposta-previa${aberta ? ' some' : ''}`} aria-hidden={aberta}>
                      {previaDoTexto(r.texto)}
                    </span>
                    {r.id < 0 && <IconSpinner size={11} />}
                  </button>
                  {r.minha && r.id > 0 && (
                    <button type="button" className="chamado-tarefa-resposta-apagar"
                      title="Apagar esta resposta" aria-label="Apagar esta resposta"
                      onClick={() => setApagando(r)}>
                      <IconTrash size={12} />
                    </button>
                  )}
                </div>
                {/* O texto fica montado o tempo todo: é dele que a abertura
                    tira a altura. */}
                <div className={`revelar${aberta ? ' aberto' : ''}`}>
                  <div>
                    <TextoRico texto={r.texto} className="chamado-tarefa-texto chamado-tarefa-resposta-texto" />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* O botão vira o campo. O campo fica montado o tempo todo: é o que dá
          à abertura de onde tirar a altura. */}
      {!escrevendo && (
        <button type="button" className="secao-add chamado-tarefa-responder troca" onClick={() => setEscrevendo(true)}>
          <IconBalao size={13} /> Responder ao cliente
        </button>
      )}
      <div className={`revelar${escrevendo ? ' aberto' : ''}`}>
        <div>
          <div className="chamado-tarefa-compor">
            <CampoTexto valor={texto} onMudar={setTexto} linhas={3} alturaMaxima={240} caixaRef={caixa}
              ariaLabel="Resposta para o cliente"
              placeholder="O que o cliente vai ler no painel de chamados. Ctrl+B negrito, Ctrl+I itálico, - para lista." />
            <div className="chamado-tarefa-compor-acoes">
              <button type="button" className="delete-confirm-cancel" onClick={() => setEscrevendo(false)}>Cancelar</button>
              <button type="button" className="btn btn-primary" disabled={texto.trim().length < 2}
                onClick={() => void enviar()}>
                <IconEnviar size={13} /> Enviar ao cliente
              </button>
            </div>
          </div>
        </div>
      </div>

      {apagando && (
        <ConfirmarExclusao titulo={apagando.texto.slice(0, 80)} oQue="resposta ao cliente"
          zIndex={10200}
          onCancelar={() => setApagando(null)}
          onConfirmar={() => void apagar(apagando)} />
      )}
    </div>
  );
}

export function ChamadoDaTarefa({ tarefaId, api }: {
  tarefaId: number;
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
}) {
  const [chamado, setChamado] = useState<Chamado | null>(null);
  const [vendo, setVendo] = useState<{ reabertura: Reabertura; indice: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    void api(`?action=chamado_da_tarefa&id=${tarefaId}`).then(r => {
      if (vivo && r && !r.error) setChamado(r.chamado ?? null);
    });
    return () => { vivo = false; };
  }, [tarefaId, api]);

  if (!chamado) return null;
  const Urgencia = ICONE_PRIORIDADE[chamado.urgencia];
  const Tipo = chamado.tipo ? ROTULO_DO_TIPO[chamado.tipo] : undefined;
  const carregar = async (a: AnexoDoChamado) => {
    const r = await api(`?action=chamado_anexo_base64&id=${a.id}&tarefa=${tarefaId}`);
    return r && !r.error ? { tipo: String(r.tipo), base64: String(r.base64) } : null;
  };

  return (
    <section className="chamado-tarefa surge">
      <div className="chamado-tarefa-topo">
        <span className="chamado-tarefa-selo"><IconChamado size={13} /> Chamado nº {chamado.numero} do cliente</span>
        {chamado.reaberturas.length > 0 && (
          <span className="reportes-reaberto">
            <IconUndo size={10} /> Reaberto{chamado.reaberturas.length > 1 ? ` ${chamado.reaberturas.length}x` : ''}
          </span>
        )}
      </div>
      <p className="chamado-tarefa-meta">
        Aberto por <strong>{chamado.solicitante}</strong>
        {chamado.email && <> (<a href={`mailto:${chamado.email}`}>{chamado.email}</a>)</>}
        {' | '}{instante(chamado.criado_em)}
        {' | '}<span className="chamado-tarefa-urgencia">{Urgencia && <Urgencia size={12} />} {chamado.urgencia}</span>
        {Tipo && (
          <>{' | '}<span className="chamado-tarefa-urgencia">
            <span style={{ display: 'inline-flex', color: Tipo.cor }}><Tipo.Icone size={12} /></span> {Tipo.label}
          </span></>
        )}
      </p>
      <Links links={chamado.links} />

      {/* As correções que o cliente mandou depois de abrir: só o que mudou em
          cada uma. Os campos da tarefa não mudam sozinhos - título e
          prioridade são do time -, então é aqui que se vê o que o cliente
          corrigiu. */}
      {(chamado.ajustes?.length ?? 0) > 0 && (
        <ol className="chamado-tarefa-reaberturas">
          {passosDosAjustes(chamado).map(({ ajuste: a, de }) => (
            <li key={`ajuste-${a.seq}`} className="chamado-tarefa-reabertura ajuste">
              <p className="chamado-tarefa-reabertura-topo">
                <span className="chamado-tarefa-reabertura-num"><IconEdit size={10} /> Ajuste {a.seq}</span>
                <span>{instante(a.criado_em)}</span>
              </p>
              <dl className="chm-ajuste">
                {CAMPOS.filter(k => a[k] != null).map(k => (
                  <div key={k} className={`chm-ajuste-campo${k === 'descricao' ? ' longo' : ''}`}>
                    <dt>{NOME_DO_CAMPO[k]}</dt>
                    <dd>
                      {k === 'descricao' ? (
                        <TextoRico texto={a.descricao!} className="chamado-tarefa-texto" />
                      ) : (
                        <>
                          <span className="chm-ajuste-de">{k === 'tipo' ? nomeDoTipo(de[k]) : de[k]}</span>
                          <span className="chm-ajuste-seta" aria-label="para"><IconArrowRight size={11} /></span>
                          <span className="chm-ajuste-para">{k === 'tipo' ? nomeDoTipo(a[k]!) : a[k]}</span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      )}

      <RespostasAoCliente tarefaId={tarefaId} api={api}
        respostas={chamado.respostas ?? []}
        onMudar={respostas => setChamado(c => c && { ...c, respostas })} />

      {chamado.reaberturas.length > 0 && (
        <ol className="chamado-tarefa-reaberturas">
          {chamado.reaberturas.map(r => (
            <li key={r.seq} className="chamado-tarefa-reabertura">
              <p className="chamado-tarefa-reabertura-topo">
                <span className="chamado-tarefa-reabertura-num"><IconUndo size={10} /> Reabertura {r.seq}</span>
                <strong>{r.autor}</strong>
                <span>{instante(r.criado_em)}</span>
              </p>
              <TextoRico texto={r.texto} className="chamado-tarefa-texto" />
              <Links links={r.links} />
              {r.anexos.length > 0 && (
                <ul className="reportes-anexos">
                  {r.anexos.map((a, i) => (
                    <li key={a.id}>
                      <button type="button" className="reportes-anexo" onClick={() => setVendo({ reabertura: r, indice: i })}>
                        {a.tipo === 'application/pdf' ? <IconDoc size={12} /> : <IconImage size={12} />}
                        <span>{a.nome}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      {vendo && (() => {
        const a = vendo.reabertura.anexos[vendo.indice];
        if (!a) return null;
        const total = vendo.reabertura.anexos.length;
        return (
          <PreviaArquivo
            arquivo={{ nome: a.nome, chave: a.id }}
            onCarregar={() => carregar(a)}
            onBaixar={() => {
              void carregar(a).then(d => {
                if (!d) return;
                const link = document.createElement('a');
                link.href = `data:${d.tipo};base64,${d.base64}`;
                link.download = a.nome;
                link.click();
              });
            }}
            onFechar={() => setVendo(null)}
            navegacao={total > 1 ? {
              posicao: vendo.indice + 1,
              total,
              onAnterior: () => setVendo(v => v && { ...v, indice: (v.indice - 1 + total) % total }),
              onProximo: () => setVendo(v => v && { ...v, indice: (v.indice + 1) % total }),
            } : undefined}
          />
        );
      })()}
    </section>
  );
}
