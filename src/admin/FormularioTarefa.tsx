// ─────────────────────────────────────────────────────────────────────────────
//  Tarefa: tipos, etiquetas e o formulário.
//
//  Mora fora das telas porque duas o abrem: a de Tarefas, onde a tarefa nasce,
//  e o relatório de Gestão, onde ela é aberta a partir do quadro da semana. Um
//  formulário só - dois divergiriam no primeiro campo novo.
//
//  Não importa nada de ProjetosPage em tempo de execução, só tipos: as duas
//  telas importam este arquivo, e um valor vindo de lá fecharia o ciclo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais } from './AdminApp';
import { IconAlert, IconCheck, IconChevronDown, IconUser, IconX } from '../components/icons';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { PRIORIDADES } from '../lib/prioridades';
import type { Projeto, Tarefa } from './ProjetosPage';

// ── Etapas e etiquetas ────────────────────────────────────────────────────────

/** Uma coluna do quadro. Nome, cor e ordem saem de Configurações > Etapas.
 *  `is_entrada` é onde a tarefa nasce e `is_conclusao` é o que conta como
 *  trabalho terminado - o mesmo par que a entrega lê para saber o andamento. */
export interface EtapaTarefa {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  is_entrada: number;
  /** A etapa de conversão: o que conta como feito no percentual da entrega. */
  is_conclusao: number;
  /** Desconsiderada: a tarefa some da conta da entrega, sem sair do quadro. */
  is_excluded: number;
  /** Etapa pontual: a coluna nasce recolhida, mesmo com tarefas. */
  always_collapsed: number;
}

/** Vale enquanto a lista não chegou do servidor, e é a mesma com que o sistema
 *  nasceu - assim o quadro não pisca com outro formato no primeiro quadro. */
export const ETAPAS_PADRAO: EtapaTarefa[] = [
  { id: -1, nome: 'A fazer', cor: '#6E6F69', ordem: 1, is_entrada: 1, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -2, nome: 'Em andamento', cor: '#B58300', ordem: 2, is_entrada: 0, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -3, nome: 'Em revisão', cor: '#7C3AED', ordem: 3, is_entrada: 0, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -4, nome: 'Concluída', cor: '#23A455', ordem: 4, is_entrada: 0, is_conclusao: 1, is_excluded: 0, always_collapsed: 0 },
];

/** As duas perguntas que as visões fazem sobre uma etapa, resolvidas uma vez só.
 *  Uma tarefa numa etapa que foi excluída ainda existe: cai no cinza e não
 *  conta como concluída, que é o mais próximo da verdade. */
export function indexar(etapas: EtapaTarefa[]) {
  const mapa = new Map(etapas.map(e => [e.nome, e]));
  return {
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    fecha: (nome: string) => Number(mapa.get(nome)?.is_conclusao ?? 0) === 1,
    desconsidera: (nome: string) => Number(mapa.get(nome)?.is_excluded ?? 0) === 1,
  };
}

export type Etapario = ReturnType<typeof indexar>;

/** As duas perguntas que as visões fazem sobre uma etiqueta. Etiqueta que saiu
 *  da configuração e ainda está numa tarefa cai no cinza e não trava nada. */
export function indexarEtiquetas(etiquetas: EtiquetaTarefa[]) {
  const mapa = new Map(etiquetas.map(e => [e.nome, e]));
  return {
    lista: etiquetas,
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    trava: (nome: string) => Number(mapa.get(nome)?.bloqueia ?? 0) === 1,
  };
}

export type Etiquetario = ReturnType<typeof indexarEtiquetas>;

/** Uma etiqueta de tarefa, como vem de Configurações > Etapas > Tarefas.
 *  `bloqueia` é a única que muda o comportamento do sistema: enquanto uma tarefa
 *  aberta a carrega, a entrega a que ela pende aparece como bloqueada. */
export interface EtiquetaTarefa {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  bloqueia: number;
  /** Papéis da equipe que enxergam a etiqueta. Vazio é "todo mundo", e só vale
   *  quando a regra está ligada em Configurações. */
  papeis: string[];
}

/** Quais etiquetas oferecer a quem está editando a tarefa.
 *
 *  A regra é sobre o papel de quem edita **naquele projeto**, e não sobre o
 *  papel dele no sistema: a mesma pessoa pode ser QA num projeto e Dev noutro.
 *  Quem não está na equipe - o gestor da casa olhando de fora - continua vendo
 *  tudo, senão a lista viria vazia justo para quem organiza o trabalho.
 *
 *  Isto governa o que a tela oferece, não o que o servidor aceita: etiqueta já
 *  aplicada continua na tarefa e continua aparecendo nas visões. */
export function etiquetasParaOPapel(
  todas: EtiquetaTarefa[], porPapel: boolean, projeto: Projeto | undefined, usuarioId: string | undefined,
): EtiquetaTarefa[] {
  if (!porPapel || !projeto || !usuarioId) return todas;
  const papel = projeto.equipe.find(m => m.id === usuarioId)?.papel;
  if (!papel) return todas;
  return todas.filter(e => e.papeis.length === 0 || e.papeis.includes(papel));
}

// ── Rascunho ──────────────────────────────────────────────────────────────────

export interface Pessoa { id: string; nome: string; email: string; foto_url: string | null }

/** Rascunho de tarefa, antes de virar linha. */
export interface Rascunho {
  id?: number;
  projeto_id: string;
  entrega_id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  responsavel_id: string;
  prazo: string;
  etiquetas: string[];
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ nome, foto, size = 22 }: { nome: string; foto?: string | null; size?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return (
      <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(true)} title={nome}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <span title={nome} style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--yellow)',
      color: 'var(--on-yellow)', fontSize: size * 0.43, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{iniciais(nome)}</span>
  );
}

/** O lugar do avatar quando não há ninguém. Existe para a linha "Sem
 *  responsável" ficar alinhada com as outras: sem ela o rótulo encosta na
 *  borda e a lista parece desalinhada. */
export function AvatarVazio({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--gray4)',
      color: 'var(--gray2)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <IconUser size={Math.round(size * 0.6)} />
    </span>
  );
}

/** Altura da lista de etiquetas: cabe o conjunto inteiro, até um teto. Rolar
 *  para achar a última é atrito num campo que se usa muito. */
const alturaDaLista = (n: number) => Math.min(8 + n * 38, 420);

export function ChipEtiqueta({ etiqueta, cor = '#6E6F69' }: { etiqueta: string; cor?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.03em',
      color: cor, background: `${cor}1F`, padding: '2px 7px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

// ── Seleção de etiquetas ──────────────────────────────────────────────────────

export function SeletorEtiquetas({ valor, opcoes, etq, onChange, desabilitado }: {
  valor: string[];
  opcoes: EtiquetaTarefa[];
  etq: Etiquetario;
  onChange: (v: string[]) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  /** Onde a lista cabe em relação ao campo. Abre para cima quando não há espaço
   *  embaixo, e acompanha a largura do campo. */
  const medir = useCallback(() => {
    const r = triggerRef.current!.getBoundingClientRect();
    const altura = alturaDaLista(opcoes.length);
    const paraCima = window.innerHeight - r.bottom - 8 < altura && r.top > altura;
    return {
      top: paraCima ? r.top - altura - 4 : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 300),
    };
  }, [opcoes.length]);

  // Este dropdown não usa o `useDropdownDismiss` do resto do sistema de
  // propósito. Lá, qualquer rolagem fecha - o que é certo para um seletor que
  // fecha ao escolher. Aqui escolher é para acontecer várias vezes, e marcar uma
  // etiqueta mexe na altura do campo, o que faz o corpo do modal rolar sozinho:
  // com aquela regra, a lista fechava no primeiro clique e o campo parecia
  // aceitar uma etiqueta só. Aqui a rolagem recoloca a lista em vez de fechá-la.
  useEffect(() => {
    if (!aberto) return;
    const dentro = (alvo: Node | null) => !!alvo
      && (triggerRef.current?.contains(alvo) || dropRef.current?.contains(alvo));
    const aoClicar = (e: MouseEvent) => { if (!dentro(e.target as Node)) setAberto(false); };
    const recolocar = (e?: Event) => {
      // Rolagem de dentro da própria lista não move o campo.
      if (e && dropRef.current?.contains(e.target as Node)) return;
      setPos(medir());
    };
    document.addEventListener('mousedown', aoClicar);
    window.addEventListener('scroll', recolocar, true);
    window.addEventListener('resize', recolocar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      window.removeEventListener('scroll', recolocar, true);
      window.removeEventListener('resize', recolocar);
    };
  }, [aberto, medir]);

  // Marcar uma etiqueta muda a altura do campo. Com a lista aberta para cima,
  // ela descolaria do campo a cada escolha se não recolocasse aqui.
  useEffect(() => {
    if (aberto) setPos(medir());
  }, [valor.length, aberto, medir]);

  function abrir() {
    setPos(medir());
    setAberto(a => !a);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="liquidez-trigger" onClick={abrir}
        disabled={desabilitado} aria-expanded={aberto}
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0, minHeight: 42,
          padding: '5px 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          // O mesmo fundo que o `SelectSistema` pinta: sem isto o campo herdava
          // o cinza do gatilho e lia como desabilitado ao lado dos outros.
          background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}>
        {valor.length === 0
          ? <span style={{ color: 'var(--gray2)' }}>Sem etiqueta</span>
          : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {valor.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={etq.cor(e)} />)}
            </span>}
        <span aria-hidden="true" style={{
          display: 'inline-flex', flexShrink: 0, color: 'var(--gray2)',
          transform: aberto ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--transition)',
        }}>
          <IconChevronDown size={13} />
        </span>
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          role="listbox" aria-multiselectable="true"
          style={{ top: pos.top, left: pos.left, width: pos.width,
            maxHeight: alturaDaLista(opcoes.length), zIndex: 10002 }}>
          {opcoes.map(e => {
            const ativo = valor.includes(e.nome);
            const trava = Number(e.bloqueia) === 1;
            return (
              <div key={e.nome} className={`status-select-option${ativo ? ' active' : ''}`}
                role="option" aria-selected={ativo}
                onClick={() => onChange(ativo ? valor.filter(x => x !== e.nome) : [...valor, e.nome])}>
                {/* O chip fica do tamanho do texto: numa coluna esticada ele
                    virava uma tarja da largura da lista. */}
                <span style={{ flexShrink: 0 }}><ChipEtiqueta etiqueta={e.nome} cor={e.cor} /></span>
                {/* O nome sozinho não separa "análise comercial" de "fora de
                    escopo": a nota é o que decide qual das duas usar. */}
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500,
                  color: 'var(--gray2)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>
                  {e.descricao ?? ''}{trava ? ' Trava a entrega.' : ''}
                </span>
                <span aria-hidden="true" style={{
                  display: 'inline-flex', flexShrink: 0,
                  color: 'var(--yellow)', visibility: ativo ? 'visible' : 'hidden',
                }}>
                  <IconCheck size={13} />
                </span>
              </div>
            );
          })}
          {opcoes.length === 0 && (
            <p style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray2)' }}>
              Nenhuma etiqueta configurada. Elas ficam em Configurações, na aba Etapas.
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── O formulário ──────────────────────────────────────────────────────────────

export function FormularioTarefa({ rascunho, projetos, etapas, etiquetas, etiquetaPorPapel, usuarioId, etq, pessoas, salvando, somenteLeitura, onMudar, onFechar, onSalvar }: {
  rascunho: Rascunho;
  projetos: Projeto[];
  etapas: EtapaTarefa[];
  etiquetas: EtiquetaTarefa[];
  etiquetaPorPapel: boolean;
  usuarioId: string | undefined;
  etq: Etiquetario;
  pessoas: Pessoa[];
  salvando: boolean;
  somenteLeitura: boolean;
  onMudar: (r: Rascunho) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => onMudar({ ...rascunho, [k]: v });
  const projeto = projetos.find(p => p.id === rascunho.projeto_id);
  const fundo = useFecharNoFundo(onFechar);
  const trava = rascunho.etiquetas.some(e => etq.trava(e));
  // A lista muda com o projeto escolhido: é lá que a pessoa tem um papel.
  const etiquetasVisiveis = etiquetasParaOPapel(etiquetas, etiquetaPorPapel, projeto, usuarioId);
  const escondidas = etiquetas.length - etiquetasVisiveis.length;

  return createPortal(
    <div className="admin-modal-overlay"
      style={{ zIndex: 10000, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}
        style={{ width: 1040, maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="delete-confirm-title" style={{ marginBottom: 4 }}>
              {rascunho.id ? 'Tarefa' : 'Nova tarefa'}
            </p>
            <p className="delete-confirm-desc" style={{ marginBottom: 0 }}>
              {projeto ? projeto.nome : 'Escolha o projeto abaixo'}
            </p>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Fechar" onClick={onFechar}>
            <IconX size={16} />
          </button>
        </div>

        {/* A margem negativa devolve espaço para o anel de foco dos campos, que
            seria cortado pelo recorte da área rolável. */}
        {/* A margem negativa devolve espaço para o anel de foco dos campos, que
            seria cortado pelo recorte da área rolável. `overflowX: hidden` é o
            par obrigatório do `auto` vertical: sem ele, um rótulo longo de
            seletor empurra a barra horizontal para dentro do modal. */}
        <div style={{ overflowY: 'auto', overflowX: 'hidden', margin: '16px -4px 0', padding: '0 4px',
          display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-input" value={rascunho.titulo} autoFocus disabled={somenteLeitura}
              onChange={e => set('titulo', e.target.value)} placeholder="Levantar requisitos" />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-input" rows={3} value={rascunho.descricao} disabled={somenteLeitura}
              onChange={e => set('descricao', e.target.value)}
              placeholder="O que precisa ser feito" style={{ fontSize: 13 }} />
          </div>

          {/* `minmax(0, 1fr)` e não `1fr`: item de grade não encolhe abaixo do
              próprio conteúdo por padrão, e o rótulo comprido de uma entrega
              esticava a coluna para fora do modal. */}
          <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Projeto *</label>
              <SelectSistema
                valor={rascunho.projeto_id}
                onChange={v => onMudar({ ...rascunho, projeto_id: v, entrega_id: '' })}
                placeholder="Escolher projeto"
                opcoes={projetos.map(p => ({ valor: p.id, label: p.nome }))}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Entrega</label>
              <SelectSistema
                valor={rascunho.entrega_id}
                onChange={v => set('entrega_id', v)}
                opcoes={[
                  { valor: '', label: 'Sem entrega' },
                  ...(projeto?.entregas ?? []).map(e => ({ valor: String(e.id), label: e.titulo })),
                ]}
              />
            </div>
          </div>
          {/* Com o modal largo, os quatro campos curtos cabem numa linha só -
              em duas colunas cada um ficaria com meio modal de largura para
              guardar uma palavra. */}
          <div className="campos-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Status</label>
              <SelectSistema valor={rascunho.status} onChange={v => set('status', v)}
                opcoes={etapas.map(e => ({ valor: e.nome, label: e.nome }))} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Prioridade</label>
              <SelectSistema valor={rascunho.prioridade} onChange={v => set('prioridade', v)}
                opcoes={PRIORIDADES.map(x => ({ valor: x as string, label: x }))} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Responsável</label>
              <SelectSistema
                valor={rascunho.responsavel_id}
                onChange={v => set('responsavel_id', v)}
                opcoes={[
                  { valor: '', label: 'Sem responsável', icone: <AvatarVazio /> },
                  ...pessoas.map(p => ({
                    valor: p.id,
                    label: p.nome,
                    icone: <Avatar nome={p.nome} foto={p.foto_url} size={20} />,
                  })),
                ]}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Prazo</label>
              <DatePicker compact allowPast value={rascunho.prazo} onChange={v => set('prazo', v)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Etiquetas</label>
            <SeletorEtiquetas valor={rascunho.etiquetas} opcoes={etiquetasVisiveis} etq={etq}
              desabilitado={somenteLeitura} onChange={v => set('etiquetas', v)} />
            {escondidas > 0 && (
              <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '6px 0 0' }}>
                {escondidas} etiqueta(s) fora da lista: elas pertencem a outros papéis da equipe
                deste projeto.
              </p>
            )}
            {trava && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                color: 'var(--red)', margin: '8px 0 0' }}>
                <IconAlert size={13} />
                Enquanto esta tarefa estiver aberta, a entrega ligada a ela aparece como bloqueada.
              </p>
            )}
          </div>
        </div>

        <div className="delete-confirm-actions" style={{ marginTop: 16, flexShrink: 0 }}>
          <button type="button" className="delete-confirm-cancel" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button type="button" className="delete-confirm-ok" disabled={salvando}
              style={{ background: 'var(--yellow)', color: 'var(--on-yellow)' }}
              onClick={onSalvar}>
              {salvando ? 'Salvando…' : rascunho.id ? 'Salvar' : 'Criar tarefa'}
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
