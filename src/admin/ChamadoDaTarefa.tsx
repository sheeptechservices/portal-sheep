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
import { useEffect, useState } from 'react';
import {
  IconArrowRight, IconChamado, IconDoc, IconEdit, IconExternal, IconImage, IconLink, IconUndo,
} from '../components/icons';
import { TextoRico } from '../components/TextoRico';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { instante } from '../lib/datas';
import { ICONE_PRIORIDADE } from '../lib/prioridades';

interface AnexoDoChamado { id: number; nome: string; tipo: string; tamanho: number }
interface Reabertura {
  seq: number; autor: string; texto: string; links: string[]; criado_em: string; anexos: AnexoDoChamado[];
}
type CampoAjustavel = 'titulo' | 'descricao' | 'solicitante' | 'urgencia';
const CAMPOS: CampoAjustavel[] = ['titulo', 'solicitante', 'urgencia', 'descricao'];
const NOME_DO_CAMPO: Record<CampoAjustavel, string> = {
  titulo: 'Título', descricao: 'Descrição', solicitante: 'Quem pede', urgencia: 'Urgência',
};
/** Uma correção do cliente: nulo é o campo que ficou como estava. */
interface Ajuste extends Record<CampoAjustavel, string | null> { seq: number; autor: string; criado_em: string }
interface Chamado {
  numero: number; titulo: string; solicitante: string; email: string | null; urgencia: string;
  links: string[]; criado_em: string; reaberturas: Reabertura[]; ajustes?: Ajuste[];
}

/** Cada correção com o que valia antes dela, para o "de → para". A descrição
 *  original não vem: a da tarefa já a traz, e a correção mostra a nova
 *  inteira. Sai da mais nova para a mais antiga, como as reaberturas. */
function passosDosAjustes(c: Chamado) {
  let v: Record<CampoAjustavel, string> = { titulo: c.titulo, descricao: '', solicitante: c.solicitante, urgencia: c.urgencia };
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
                <strong>{a.autor}</strong>
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
                          <span className="chm-ajuste-de">{de[k]}</span>
                          <span className="chm-ajuste-seta" aria-label="para"><IconArrowRight size={11} /></span>
                          <span className="chm-ajuste-para">{a[k]}</span>
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
