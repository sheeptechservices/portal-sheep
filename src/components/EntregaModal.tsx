// ─────────────────────────────────────────────────────────────────────────────
//  A entrega aberta: o que é, como vai e o que ela puxa atrás de si.
//
//  Irmã do modal de reunião, e pelo mesmo motivo: quem clica no chip de uma
//  entrega dentro de uma reunião quer ver a entrega, e não ser levado para
//  outra aba para procurá-la na lista.
//
//  O que ela mostra é o que a linha da entrega mostra, com espaço: etapa,
//  prazo, quem responde, o andamento, a descrição, as tarefas que pendem dela
//  e as reuniões em que foi tratada.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react';
import { createPortal } from 'react-dom';
import { IconExternal, IconX } from './icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { TextoRico } from './TextoRico';
import { ChipReuniao } from './VinculoReuniao';
import { dia } from '../lib/datas';

/** O que este modal precisa saber de uma entrega. Estrutural de propósito: o
 *  `Entrega` da tela de Projetos serve sem conversão, e este arquivo não passa
 *  a depender daquela tela. */
export interface EntregaAberta {
  id: number;
  titulo: string;
  descricao: string | null;
  status: string;
  prazo: string | null;
  marcador: string | null;
  submarcador: string | null;
  links: { label: string; url: string }[];
  progresso: number;
}

/** Uma tarefa da entrega, já resolvida por quem chama: aqui ela é leitura. */
export interface TarefaDaEntrega {
  id: number;
  titulo: string;
  status: string;
  cor: string;
  feita: boolean;
}

/** Uma reunião que tratou desta entrega. */
export interface ReuniaoDaEntrega {
  id: number;
  assunto: string;
  data: string;
  fireflies: boolean;
}

const fmtData = (v: string | null) => dia(v, '');

export function EntregaModal({
  entrega, cor, icone, avatares, tarefas, reunioes, onAbrirReuniao, onAbrirTarefa, onFechar,
}: {
  entrega: EntregaAberta;
  /** A cor da etapa, que pinta a marca e o andamento. */
  cor: string;
  /** A marca da etapa. Vem de fora porque quem chama é quem sabe qual é. */
  icone: React.ReactNode;
  /** As fotos de quem responde, montadas por quem chama - o avatar é da tela. */
  avatares?: React.ReactNode;
  tarefas: TarefaDaEntrega[];
  reunioes: ReuniaoDaEntrega[];
  onAbrirReuniao?: (reuniaoId: number) => void;
  onAbrirTarefa?: (tarefaId: number) => void;
  onFechar: () => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const feitas = tarefas.filter(t => t.feita).length;
  const marca = [entrega.marcador, entrega.submarcador].filter(Boolean).join(' · ');

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10002 }} {...fundo}>
      <div className="modal-central" onClick={e => e.stopPropagation()}>
        <div className="gravacao-topo">
          <p className="gravacao-titulo">
            <span className="gravacao-nome" title={entrega.titulo}>{entrega.titulo}</span>
            <span className="gravacao-meta">
              {entrega.status}
              {entrega.prazo ? ` · ${fmtData(entrega.prazo)}` : ''}
              {marca ? ` · ${marca}` : ''}
            </span>
          </p>
          <button type="button" className="admin-modal-close" onClick={fechar}
            aria-label="Fechar a entrega">
            <IconX size={16} />
          </button>
        </div>

        <div className="gravacao-corpo">
          {/* A etapa e o andamento na mesma faixa: o que a entrega é agora e
              quanto dela já andou. */}
          <div className="entrega-modal-estado">
            <span className="entrega-modal-marco" style={{ color: cor }}>
              {icone}
              <strong>{entrega.status}</strong>
            </span>
            {avatares && <span className="entrega-modal-gente">{avatares}</span>}
            <span className="entrega-modal-progresso">
              <span className="entrega-modal-barra">
                <span style={{ width: `${entrega.progresso}%`, background: cor }} />
              </span>
              <strong>{entrega.progresso}%</strong>
            </span>
          </div>

          {entrega.descricao?.trim() && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Descrição</p>
              <TextoRico texto={entrega.descricao} />
            </div>
          )}

          {entrega.links.length > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Links</p>
              <div className="entrega-modal-links">
                {entrega.links.map((l, i) => (
                  <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                    className="entrega-modal-link">
                    <IconExternal size={12} />
                    {l.label || l.url}
                  </a>
                ))}
              </div>
            </div>
          )}

          {tarefas.length > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">
                Tarefas <span className="gravacao-conta">{feitas} de {tarefas.length}</span>
              </p>
              <div className="entrega-modal-tarefas">
                {tarefas.map(t => (
                  <button key={t.id} type="button" className="entrega-modal-tarefa"
                    disabled={!onAbrirTarefa}
                    title={onAbrirTarefa ? `Abrir "${t.titulo}"` : t.titulo}
                    onClick={() => onAbrirTarefa?.(t.id)}>
                    <span className="entrega-modal-ponto" style={{ background: t.cor }} />
                    <span className={`entrega-modal-tarefa-nome${t.feita ? ' feita' : ''}`}>
                      {t.titulo}
                    </span>
                    <span className="entrega-modal-tarefa-etapa">{t.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {reunioes.length > 0 && (
            <div className="gravacao-bloco">
              <p className="gravacao-secao">Tratada nestas reuniões</p>
              <div className="vinculo-chips">
                {reunioes.map(r => (
                  <ChipReuniao key={r.id}
                    assunto={r.assunto}
                    data={fmtData(r.data)}
                    fireflies={r.fireflies}
                    titulo={`Abrir "${r.assunto}"`}
                    onAbrir={onAbrirReuniao ? () => onAbrirReuniao(r.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
