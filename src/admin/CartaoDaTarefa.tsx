// ─────────────────────────────────────────────────────────────────────────────
//  O card de tarefa, um só para todo quadro.
//
//  A tela de Tarefas, a Planning, a aba Tarefas da ficha do projeto e o quadro
//  dentro de uma entrega mostram a mesma coisa: uma tarefa numa coluna de
//  etapa. Cada um montava o próprio card, e a mesma tarefa aparecia com três
//  caras: a prioridade num canto ou no outro, a lixeira no pé ou pairando, o
//  prazo com ou sem ícone. Aqui fica a peça única, e cada quadro só diz o que
//  muda nele: o contexto da linha de cima (os projetos na tela de Tarefas, a
//  entrega dentro de um projeto) e as ações que oferece.
//
//  O arraste, o clique e a seleção continuam com quem monta o quadro: são dele
//  as regras de quem pode mover e para onde.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties, DragEvent, MouseEvent, ReactNode } from 'react';
import { ICONE_COMPLEXIDADE } from '../lib/complexidades';
import { ICONE_PRIORIDADE, PRIORIDADE_PADRAO } from '../lib/prioridades';
import { dia as fmtData } from '../lib/datas';
import { IconCalendario } from '../components/icons';
import { DonosDaTarefa, type PessoaConhecida } from '../components/DonosDaTarefa';
import { SinaisDaTarefa } from '../components/SinaisDaTarefa';
import { ChipEtiqueta } from './FormularioTarefa';
import { nomeCurto } from './AdminApp';

/** Dias até o prazo. Negativo é atraso. */
function diasPara(iso: string | null): number | null {
  if (!iso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoje.getTime()) / 86400000);
}

/** Prazo em texto, vermelho quando venceu e a tarefa não terminou. */
export function Prazo({ iso, concluida }: { iso: string | null; concluida: boolean }) {
  if (!iso) return null;
  const dias = diasPara(iso);
  const atrasado = dias !== null && dias < 0 && !concluida;
  return (
    <span
      title={atrasado ? `${Math.abs(dias)} dia(s) de atraso` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap',
        color: atrasado ? 'var(--red)' : 'var(--gray2)', fontWeight: atrasado ? 700 : 500,
      }}>
      <IconCalendario size={12} />
      {fmtData(iso)}
    </span>
  );
}

/** A complexidade na linha: o caminho em degraus, na cor do nível, e a palavra.
 *  Some quando ninguém dimensionou a tarefa - um "sem complexidade" em cada card
 *  seria uma coluna de nada. */
export function Complexidade({ valor }: { valor?: string | null }) {
  const Icone = ICONE_COMPLEXIDADE[String(valor ?? '')];
  if (!Icone) return null;
  return (
    <span className="chip-complexidade" title={`Complexidade: ${valor}`}>
      <Icone size={13} />
      {valor}
    </span>
  );
}

export function Prioridade({ valor }: { valor?: string | null }) {
  const nivel = valor || PRIORIDADE_PADRAO;
  const Icone = ICONE_PRIORIDADE[nivel];
  if (!Icone) return null;
  return (
    <span title={`Prioridade: ${nivel}`} style={{ display: 'inline-flex', color: 'var(--gray)' }}>
      <Icone size={14} />
    </span>
  );
}

/** O que o card precisa da tarefa. Os dois quadros têm tipos próprios de
 *  tarefa, e os dois cabem aqui. */
export interface TarefaDoCartao {
  id: number;
  titulo: string;
  prioridade?: string | null;
  complexidade?: string | null;
  prazo: string | null;
  etiquetas?: string[];
  responsaveis?: string[];
  comentarios?: number;
  anexos?: number;
}

export function CartaoDaTarefa({
  t, contexto, pessoas, corDaEtiqueta, concluida, prazoSemCobranca, marcada, aberta, acoes,
  podeArrastar, onDragStart, onDragEnd, onMouseDown, onClick, style,
}: {
  t: TarefaDoCartao;
  /** A letra miúda ao lado da chave: de onde a tarefa é. Os projetos na tela de
   *  Tarefas, a entrega dentro de um projeto. Ausente, a linha fica só com a
   *  prioridade e a chave. */
  contexto?: string | null;
  pessoas: PessoaConhecida[];
  corDaEtiqueta?: (etiqueta: string) => string | undefined;
  /** Em etapa que fecha: o título risca e o prazo não cobra. */
  concluida: boolean;
  /** Etapa desconsiderada: a tarefa saiu da conta, e o prazo não cobra. */
  prazoSemCobranca?: boolean;
  marcada?: boolean;
  /** A tarefa aberta na ficha: o card acende. */
  aberta?: boolean;
  /** Os botões que pairam no canto com o ponteiro em cima (marcar, duplicar,
   *  excluir). Cada quadro oferece os seus. */
  acoes?: ReactNode;
  podeArrastar: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
  /** O que o arraste aplica: a vaga que se abre e o apagado do lote. */
  style?: CSSProperties;
}) {
  const donos = t.responsaveis ?? [];
  const etiquetas = t.etiquetas ?? [];
  return (
    <div
      className={`kanban-card tarefa-cartao${marcada ? ' selecionado' : ''}${aberta ? ' aberta' : ''}${concluida ? ' concluida' : ''}`}
      data-flip={t.id}
      draggable={podeArrastar}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={style}>
      {/* A linha de cima: a prioridade em ícone, a chave e de onde ela é. */}
      <div className="tarefa-cartao-topo">
        <Prioridade valor={t.prioridade} />
        <span className="tarefa-cartao-chave">#{t.id}</span>
        {contexto && <span className="tarefa-cartao-projeto" title={contexto}>{contexto}</span>}
      </div>
      {/* Aparecem com o ponteiro no card, por cima do canto. Sempre visíveis
          seriam uma lixeira por cartão numa coluna cheia. */}
      {acoes && <span className="kanban-card-acoes">{acoes}</span>}
      <p className="tarefa-cartao-titulo">{t.titulo}</p>
      {etiquetas.length > 0 && (
        <div className="tarefa-cartao-etiquetas">
          {etiquetas.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={corDaEtiqueta?.(e)} />)}
        </div>
      )}
      {/* O pé: quem faz, com o nome quando é uma pessoa só, e o que a tarefa
          carrega. O prazo fica no canto, e quebra para a linha de baixo em vez
          de vazar quando não cabe. */}
      <div className="tarefa-cartao-rodape">
        <DonosDaTarefa ids={donos} pessoas={pessoas} size={20} />
        {donos.length === 1 && (
          <span className="tarefa-cartao-dono">
            {nomeCurto(pessoas.find(x => x.id === donos[0])?.nome ?? '')}
          </span>
        )}
        <Complexidade valor={t.complexidade} />
        <SinaisDaTarefa t={t} />
        <span className="tarefa-cartao-prazo">
          <Prazo iso={t.prazo} concluida={concluida || !!prazoSemCobranca} />
        </span>
      </div>
    </div>
  );
}
