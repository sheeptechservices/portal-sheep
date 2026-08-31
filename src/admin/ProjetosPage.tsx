import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import { IconAlert, IconInbox, IconTrash, IconX } from '../components/icons';
import FilterDropdown from '../components/FilterDropdown';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';

// ─────────────────────────────────────────────────────────────────────────────
//  Projetos - o cadastro dos projetos da casa e o acompanhamento de cada um.
//
//  Duas abas sobre a mesma lista, porque são duas perguntas diferentes:
//    Geral  → "quais projetos existem?"  cadastro, edição e exclusão.
//    Gestão → "como eles estão indo?"    gestor, prazo e progresso.
//
//  A segunda não é só leitura: o progresso e o status são o que mais muda no
//  dia a dia, então ficam editáveis ali mesmo, sem abrir o formulário inteiro.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_PROJETO = ['Em andamento', 'Pausado', 'Concluído', 'Cancelado'] as const;

/** Cor de cada status. Verde só para concluído: no resto do sistema verde é
 *  desfecho positivo, e "em andamento" não é desfecho nenhum. */
const COR_STATUS: Record<string, string> = {
  'Em andamento': '#B58300',
  'Pausado': '#6E6F69',
  'Concluído': '#23A455',
  'Cancelado': '#D93025',
};

const ETIQUETAS = ['Proposta', 'Contrato', 'Documento', 'Slide', 'Planilha', 'Outro'] as const;

/** Papéis da equipe. Gestor vem primeiro porque é o que a aba de gestão destaca. */
export const PAPEIS_EQUIPE = ['Gestor', 'Dev', 'Designer', 'Analista', 'QA', 'Outro'] as const;

/** Tipos de projeto da casa. Lista fechada de propósito: campo livre viraria
 *  "BI", "bi" e "Business Intelligence" na mesma base, e o filtro não fecharia. */
export const TIPOS_PROJETO = ['BI', 'SaaS', 'Automação', 'Integração', 'App', 'Site', 'Consultoria', 'Outro'] as const;


const COR_ETIQUETA: Record<string, string> = {
  Proposta: '#0EA5E9', Contrato: '#7C3AED', Documento: '#6B7280',
  Slide: '#D97706', Planilha: '#1E8A3E', Outro: '#8A857A',
};

/** Anexo grande vira base64 ainda maior (~33% a mais) e o corpo do POST estoura.
 *  8 MB é o teto confortável para o limite de 20 MB do endpoint. */
const LIMITE_ANEXO = 8 * 1024 * 1024;

interface Pessoa { id: string; nome: string; email: string }
interface Membro extends Pessoa { papel: string }

export interface Arquivo {
  id: number;
  projeto_id: string;
  etiqueta: string;
  nome: string;
  tipo: string;
  tamanho: number;
  criado_em: string;
  criado_por_nome: string | null;
}

export interface Projeto {
  id: string;
  codigo: string | null;
  nome: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  tipo: string | null;
  repositorio: string | null;
  objetivo: string | null;
  status: string;
  data_inicio: string | null;
  previsao_entrega: string | null;
  progresso: number;
  observacoes: string | null;
  equipe: Membro[];
  arquivos: Arquivo[];
  criado_em: string;
}

interface Cliente { id: string; nome: string }

/** Anexo ainda não enviado. Projeto novo só ganha id depois de salvo, então os
 *  arquivos ficam aqui até existir a que anexá-los. */
interface AnexoPendente {
  etiqueta: string; nome: string; tipo: string; tamanho: number; base64: string;
}

const VAZIO = {
  nome: '', cliente_id: '', tipo: '', repositorio: '', objetivo: '', status: 'Em andamento' as string,
  equipe: [] as { usuario_id: string; papel: string }[],
  data_inicio: '', previsao_entrega: '', observacoes: '',
  // Sem controle no formulário: o progresso passa a ser automático. Continua no
  // rascunho porque o update grava a coluna - se saísse daqui, toda edição
  // devolveria 0 ao banco e apagaria o andamento.
  progresso: 0,
};

type Rascunho = typeof VAZIO;

const fmtData = (v: string | null) =>
  v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const fmtTamanho = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Dias até a entrega. Negativo é atraso. */
function diasPara(v: string | null): number | null {
  if (!v) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${v}T00:00:00`).getTime() - hoje.getTime()) / 86400000);
}

/** O gestor sai da própria equipe, não de uma coluna separada: um só lugar
 *  define quem faz o quê no projeto. */
const gestorDe = (p: Projeto) => p.equipe.find(m => m.papel === 'Gestor') ?? null;

function ChipStatus({ status }: { status: string }) {
  const cor = COR_STATUS[status] ?? 'var(--gray)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
      color: cor, background: `${cor}14`, padding: '3px 9px', borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor }} />
      {status}
    </span>
  );
}

function ChipEtiqueta({ etiqueta }: { etiqueta: string }) {
  const cor = COR_ETIQUETA[etiqueta] ?? 'var(--gray)';
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
      color: cor, background: `${cor}16`, padding: '2px 7px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

function Barra({ valor }: { valor: number }) {
  const v = Math.min(100, Math.max(0, valor));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--gray3)', overflow: 'hidden' }}>
        <div style={{
          width: `${v}%`, height: '100%', borderRadius: 3,
          background: 'var(--yellow)', transition: 'width var(--transition)',
        }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', minWidth: 32, textAlign: 'right' }}>
        {v}%
      </span>
    </div>
  );
}

function Avatar({ nome, size = 22 }: { nome: string; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--yellow)',
      color: 'var(--on-yellow)', fontSize: size * 0.43, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{iniciais(nome)}</span>
  );
}

function Gestor({ nome, email }: { nome: string | null; email: string | null }) {
  if (!nome) return <span style={{ color: 'var(--gray2)' }}>Sem gestor</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} title={email ?? undefined}>
      <Avatar nome={nome} />{nome}
    </span>
  );
}

// ── Status como pílula ───────────────────────────────────────────────────────

/** O mesmo controle de etapa que o Funil usa no cabeçalho do card: pílula na
 *  cor do status, com o dropdown num portal para não ser cortado pelo modal. */
function PilulaStatus({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const cor = COR_STATUS[valor] ?? '#aaa';

  function abrir() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 200) });
    setAberto(true);
  }

  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="status-select-trigger"
        style={{ '--sc': cor } as React.CSSProperties}
        onClick={abrir}
      >
        <span className="status-select-dot" style={{ background: cor }} />
        <span>{valor}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {STATUS_PROJETO.map(st => {
            const ativo = st === valor;
            return (
              <div key={st} className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => { onChange(st); setAberto(false); }}>
                <span className="status-select-dot" style={{ background: COR_STATUS[st] }} />
                <span>{st}</span>
                {ativo && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    style={{ marginLeft: 'auto', color: COR_STATUS[st] }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Equipe do projeto ────────────────────────────────────────────────────────

function SecaoEquipe({ pessoas, valor, onChange }: {
  pessoas: Pessoa[];
  valor: { usuario_id: string; papel: string }[];
  onChange: (v: { usuario_id: string; papel: string }[]) => void;
}) {
  const [quem, setQuem] = useState('');
  const [papel, setPapel] = useState<string>('Dev');

  // Quem já está no time sai da lista de escolha: a chave da tabela é
  // (projeto, usuário), então a mesma pessoa não entra duas vezes.
  const disponiveis = pessoas.filter(p => !valor.some(m => m.usuario_id === p.id));

  function adicionar() {
    if (!quem) return;
    onChange([...valor, { usuario_id: quem, papel }]);
    setQuem('');
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <SelectSistema
            valor={quem}
            onChange={setQuem}
            opcoes={[
              { valor: '', label: disponiveis.length ? 'Escolher pessoa' : 'Todos já estão no time' },
              ...disponiveis.map(p => ({ valor: p.id, label: p.nome })),
            ]}
          />
        </span>
        <span style={{ width: 140 }}>
          <SelectSistema
            valor={papel}
            onChange={setPapel}
            opcoes={PAPEIS_EQUIPE.map(p => ({ valor: p as string, label: p }))}
          />
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={adicionar} disabled={!quem}>
          Adicionar
        </button>
      </div>

      {valor.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Ninguém na equipe ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {valor.map(m => {
            const p = pessoas.find(x => x.id === m.usuario_id);
            return (
              <div key={m.usuario_id} style={{
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                border: '1px solid var(--gray3)', borderRadius: 8, padding: '6px 9px',
              }}>
                <Avatar nome={p?.nome ?? '?'} size={22} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', color: 'var(--black)' }}>{p?.nome ?? 'Usuário removido'}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)' }}>{p?.email}</span>
                </span>
                <span style={{ width: 132, flexShrink: 0 }}>
                  <SelectSistema
                    valor={m.papel}
                    onChange={v => onChange(valor.map(x => x.usuario_id === m.usuario_id ? { ...x, papel: v } : x))}
                    opcoes={PAPEIS_EQUIPE.map(x => ({ valor: x as string, label: x }))}
                  />
                </span>
                <button type="button" onClick={() => onChange(valor.filter(x => x.usuario_id !== m.usuario_id))}
                  aria-label={`Remover ${p?.nome ?? 'pessoa'} da equipe`}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)' }}>
                  <IconTrash size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

function FormularioProjeto({
  editando, pessoas, clientes, salvando, onFechar, onSalvar, onBaixarAnexo,
}: {
  editando: Projeto | null;
  pessoas: Pessoa[];
  clientes: Cliente[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (r: Rascunho, anexos: AnexoPendente[], removidos: number[]) => void;
  onBaixarAnexo: (a: Arquivo) => void;
}) {
  const [r, setR] = useState<Rascunho>(() => editando ? {
    nome: editando.nome, cliente_id: editando.cliente_id ?? '',
    tipo: editando.tipo ?? '', repositorio: editando.repositorio ?? '',
    objetivo: editando.objetivo ?? '',
    status: editando.status,
    equipe: editando.equipe.map(m => ({ usuario_id: m.id, papel: m.papel })),
    data_inicio: editando.data_inicio ?? '', previsao_entrega: editando.previsao_entrega ?? '',
    progresso: editando.progresso ?? 0, observacoes: editando.observacoes ?? '',
  } : VAZIO);
  const [novos, setNovos] = useState<AnexoPendente[]>([]);
  const [removidos, setRemovidos] = useState<number[]>([]);
  const [etiqueta, setEtiqueta] = useState<string>('Documento');
  const [erroAnexo, setErroAnexo] = useState('');
  const inputArquivo = useRef<HTMLInputElement>(null);

  // Erro por campo, preenchido só quando a pessoa tenta salvar. O botão fica
  // sempre ativo: bloquear a ação esconde o motivo, e o objetivo aqui é
  // justamente mostrar onde está o problema.
  const [erros, setErros] = useState<Record<string, string>>({});

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => {
    setR(p => ({ ...p, [k]: v }));
    // O erro some assim que o campo é mexido: manter o vermelho enquanto a
    // pessoa corrige é ruído.
    setErros(e => (e[k as string] ? { ...e, [k as string]: '' } : e));
  };
  const jaAnexados = (editando?.arquivos ?? []).filter(a => !removidos.includes(a.id));

  function tentarSalvar() {
    const novosErros: Record<string, string> = {};
    if (!r.nome.trim()) novosErros.nome = 'Informe o nome do projeto.';
    if (!r.cliente_id) novosErros.cliente_id = 'Escolha o cliente.';
    if (!r.tipo) novosErros.tipo = 'Escolha o tipo do projeto.';
    if (!r.data_inicio) novosErros.data_inicio = 'Informe a data de início.';
    if (!r.previsao_entrega) novosErros.previsao_entrega = 'Informe o fim previsto.';
    if (r.equipe.length === 0) novosErros.equipe = 'Adicione ao menos uma pessoa à equipe.';
    if (!r.objetivo.trim()) novosErros.objetivo = 'Descreva o objetivo final.';
    if (jaAnexados.length + novos.length === 0) novosErros.anexos = 'Anexe ao menos um arquivo.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    onSalvar(r, novos, removidos);
  }

  async function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    setErroAnexo('');
    const aceitos: AnexoPendente[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > LIMITE_ANEXO) {
        setErroAnexo(`"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      const base64 = await new Promise<string>(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
        fr.readAsDataURL(f);
      });
      aceitos.push({ etiqueta, nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64 });
    }
    setNovos(p => [...p, ...aceitos]);
    if (aceitos.length) setErros(e => (e.anexos ? { ...e, anexos: '' } : e));
    if (inputArquivo.current) inputArquivo.current.value = '';
  }


  return createPortal(
    <div className="admin-modal-overlay" onClick={onFechar}>
      <div className="admin-modal" style={{ width: 'min(560px, 96vw)' }} onClick={e => e.stopPropagation()}>

        <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {editando ? `Projeto ${editando.codigo ?? ''}`.trim() : 'Novo projeto'}
              </p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                {editando ? editando.nome : 'Criar manualmente'}
              </h3>
            </div>
            <button className="admin-modal-close" aria-label="Fechar" onClick={onFechar}><IconX size={16} /></button>
          </div>
          <div style={{ marginTop: 2 }}>
            <PilulaStatus valor={r.status} onChange={v => set('status', v)} />
          </div>
        </div>

        <div className="admin-modal-body">

          <section>
            <p className="admin-section-title">Identificação</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Nome do projeto *</label>
                <input className={`form-input${erros.nome ? ' error' : ''}`} value={r.nome} autoFocus
                  onChange={e => set('nome', e.target.value)} placeholder="Portal de gestão" />
                {erros.nome && <p className="form-error">{erros.nome}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <SelectSistema
                  valor={r.cliente_id}
                  onChange={v => set('cliente_id', v)}
                  opcoes={[{ valor: '', label: 'Sem cliente' }, ...clientes.map(c => ({ valor: c.id, label: c.nome }))]}
                />
                {erros.cliente_id && <p className="form-error">{erros.cliente_id}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <SelectSistema
                  valor={r.tipo}
                  onChange={v => set('tipo', v)}
                  opcoes={[{ valor: '', label: 'Escolher tipo' }, ...TIPOS_PROJETO.map(t => ({ valor: t as string, label: t }))]}
                />
                {erros.tipo && <p className="form-error">{erros.tipo}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Repositório no GitHub</label>
                <input className="form-input" value={r.repositorio}
                  onChange={e => set('repositorio', e.target.value)}
                  placeholder="https://github.com/sheeptechservices/portal-sheep" />
              </div>
            </div>
          </section>

          <section>
            <p className="admin-section-title">Prazo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Data de início *</label>
                <DatePicker compact allowPast value={r.data_inicio}
                  onChange={v => set('data_inicio', v)} error={erros.data_inicio} />
              </div>
              <div className="form-group">
                <label className="form-label">Fim previsto *</label>
                <DatePicker compact allowPast value={r.previsao_entrega}
                  onChange={v => set('previsao_entrega', v)} error={erros.previsao_entrega} />
              </div>
            </div>
          </section>

          <section>
            <p className="admin-section-title">Equipe *</p>
            <SecaoEquipe pessoas={pessoas} valor={r.equipe} onChange={v => set('equipe', v)} />
            {erros.equipe && <p className="form-error" style={{ marginTop: 6 }}>{erros.equipe}</p>}
          </section>

          <section>
            <p className="admin-section-title">Objetivo e observações</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Objetivo final *</label>
                <textarea className={`form-input${erros.objetivo ? ' error' : ''}`} rows={3} value={r.objetivo}
                  onChange={e => set('objetivo', e.target.value)}
                  placeholder="O que precisa estar entregue para o projeto ser considerado concluído" />
                {erros.objetivo && <p className="form-error">{erros.objetivo}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Observações</label>
                <textarea className="form-input" rows={2} value={r.observacoes}
                  onChange={e => set('observacoes', e.target.value)}
                  placeholder="Riscos, dependências, combinados" />
              </div>
            </div>
          </section>

          <section>
            <p className="admin-section-title">Anexos *</p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
              <span style={{ width: 150 }}>
                <SelectSistema
                  valor={etiqueta}
                  onChange={setEtiqueta}
                  opcoes={ETIQUETAS.map(x => ({ valor: x as string, label: x }))}
                />
              </span>
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => inputArquivo.current?.click()}>
                Escolher arquivos
              </button>
              <input ref={inputArquivo} type="file" multiple hidden
                onChange={e => void escolherArquivos(e.target.files)} />
            </div>
            {erroAnexo && (
              <p style={{ fontSize: 11.5, color: '#B45309', margin: '0 0 8px' }}>{erroAnexo}</p>
            )}

            {jaAnexados.length === 0 && novos.length === 0 ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhum anexo.</p>
                {erros.anexos && <p className="form-error" style={{ marginTop: 6 }}>{erros.anexos}</p>}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {jaAnexados.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    border: '1px solid var(--gray3)', borderRadius: 8, padding: '6px 9px',
                  }}>
                    <ChipEtiqueta etiqueta={a.etiqueta} />
                    <button type="button" onClick={() => onBaixarAnexo(a)}
                      style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--black)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {a.nome}
                    </button>
                    <span style={{ color: 'var(--gray2)', fontSize: 11 }}>{fmtTamanho(a.tamanho)}</span>
                    <button type="button" onClick={() => setRemovidos(p => [...p, a.id])}
                      aria-label={`Remover ${a.nome}`}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)' }}>
                      <IconTrash size={13} />
                    </button>
                  </div>
                ))}
                {novos.map((a, i) => (
                  <div key={`novo-${i}`} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                    border: '1px dashed var(--gray3)', borderRadius: 8, padding: '6px 9px',
                  }}>
                    <ChipEtiqueta etiqueta={a.etiqueta} />
                    <span style={{ flex: 1, minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {a.nome}
                    </span>
                    <span style={{ color: 'var(--gray2)', fontSize: 11 }}>{fmtTamanho(a.tamanho)}</span>
                    <button type="button" onClick={() => setNovos(p => p.filter((_, x) => x !== i))}
                      aria-label={`Remover ${a.nome}`}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)' }}>
                      <IconTrash size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray3)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button type="button" className="modal-acao" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="modal-acao-primaria" onClick={tentarSalvar} disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Criar projeto'}
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

type Aba = 'geral' | 'gestao';

export default function ProjetosPage({ token }: { token: string }) {
  const { pode, onSessionExpired } = useAuth();
  const { toast } = useToast();

  const [aba, setAba] = useState<Aba>('geral');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ editando: Projeto | null } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Projeto | null>(null);
  const [view, setView] = useState<'quadro' | 'lista'>('lista');
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fCliente, setFCliente] = useState<string[]>([]);
  const [fGestor, setFGestor] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[]>([]);

  const podeCriar = pode('projetos:criar');
  const podeEditar = pode('projetos:editar');
  const podeExcluir = pode('projetos:excluir');

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return null; }
    return res.json();
  }, [token, onSessionExpired]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, u] = await Promise.all([
        api('?action=projetos'),
        api('?action=usuarios_notificaveis'),
      ]);
      setProjetos(p?.projetos ?? []);
      setClientes(p?.clientes ?? []);
      setPessoas(u?.usuarios ?? []);
    } catch {
      toast('error', 'Não foi possível carregar', 'A lista de projetos não veio. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [api, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(r: Rascunho, anexos: AnexoPendente[], removidos: number[]) {
    setSalvando(true);
    try {
      const editando = form?.editando ?? null;
      const resposta = editando
        ? await api('', 'POST', { action: 'update_projeto', id: editando.id, ...r })
        : await api('', 'POST', { action: 'create_projeto', ...r });
      if (resposta?.error) { toast('error', 'Não foi possível salvar', resposta.error); return; }

      const projetoId = editando?.id ?? String(resposta?.id ?? '');
      for (const id of removidos) {
        await api('', 'POST', { action: 'delete_projeto_arquivo', id });
      }
      for (const a of anexos) {
        await api('', 'POST', { action: 'add_projeto_arquivo', projeto_id: projetoId, ...a });
      }

      setForm(null);
      toast('success', editando ? 'Projeto atualizado' : 'Projeto criado');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }


  async function baixarAnexo(a: Arquivo) {
    const r = await api(`?action=projeto_arquivo_base64&id=${a.id}`);
    if (!r?.base64) { toast('error', 'Não deu', 'O anexo não veio.'); return; }
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  async function excluir(p: Projeto) {
    setExcluindo(null);
    await api('', 'POST', { action: 'delete_projeto', id: p.id });
    toast('success', 'Projeto excluído');
    await carregar();
  }

  /** Muda só um campo, sem abrir o formulário. Usado na aba de gestão. */
  async function ajustar(p: Projeto, campo: 'status' | 'progresso', valor: string | number) {
    const otimista = projetos.map(x => (x.id === p.id ? { ...x, [campo]: valor } as Projeto : x));
    setProjetos(otimista);
    const alvo = otimista.find(x => x.id === p.id)!;
    await api('', 'POST', {
      action: 'update_projeto', id: p.id, nome: alvo.nome, cliente_id: alvo.cliente_id,
      objetivo: alvo.objetivo, status: alvo.status,
      data_inicio: alvo.data_inicio, previsao_entrega: alvo.previsao_entrega,
      progresso: alvo.progresso, observacoes: alvo.observacoes,
      // `equipe` fica de fora: o update só regrava o time quando o campo vem,
      // e daqui só mudam status e progresso.
    });
  }

  /** Opções vêm do que existe, não de uma lista fixa: filtro que oferece valor
   *  sem resultado é ruído. */
  const opcoes = useMemo(() => {
    const uniq = (vs: (string | null)[]) =>
      [...new Set(vs.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      status: uniq(projetos.map(p => p.status)).map(v => ({ value: v, label: v })),
      cliente: uniq(projetos.map(p => p.cliente_nome)).map(v => ({ value: v, label: v })),
      gestor: uniq(projetos.map(p => gestorDe(p)?.nome ?? null)).map(v => ({ value: v, label: v })),
      tipo: uniq(projetos.map(p => p.tipo)).map(v => ({ value: v, label: v })),
    };
  }, [projetos]);

  const filtrados = useMemo(() => projetos.filter(p =>
    (fStatus.length === 0 || fStatus.includes(p.status)) &&
    (fCliente.length === 0 || (p.cliente_nome && fCliente.includes(p.cliente_nome))) &&
    (fGestor.length === 0 || fGestor.includes(gestorDe(p)?.nome ?? '')) &&
    (fTipo.length === 0 || (p.tipo && fTipo.includes(p.tipo)))
  ), [projetos, fStatus, fCliente, fGestor, fTipo]);

  const temFiltro = fStatus.length + fCliente.length + fGestor.length + fTipo.length > 0;
  const limparFiltros = () => { setFStatus([]); setFCliente([]); setFGestor([]); setFTipo([]); };

  // O resumo conta o que está em tela: com filtro aplicado, número que ignora
  // o filtro vira contradição visível.
  const resumo = useMemo(() => ({
    total: filtrados.length,
    andamento: filtrados.filter(p => p.status === 'Em andamento').length,
    concluidos: filtrados.filter(p => p.status === 'Concluído').length,
    atrasados: filtrados.filter(p => {
      const d = diasPara(p.previsao_entrega);
      return d !== null && d < 0 && p.status !== 'Concluído' && p.status !== 'Cancelado';
    }).length,
  }), [filtrados]);

  if (!pode('projetos:ver')) {
    return (
      <div className="admin-content-wrap">
        <div className="perfil-vazio">
          <IconAlert size={16} />
          <p className="perfil-vazio-titulo">Sem acesso</p>
          <p className="perfil-vazio-desc">Seu perfil não enxerga os projetos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content-wrap">
      <div className="config-tabs">
        <button className={`config-tab${aba === 'geral' ? ' active' : ''}`} onClick={() => setAba('geral')}>Geral</button>
        <button className={`config-tab${aba === 'gestao' ? ' active' : ''}`} onClick={() => setAba('gestao')}>Gestão</button>
      </div>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Projetos</h1>
          <p className="admin-page-desc">
            {aba === 'geral'
              ? 'Cadastro dos projetos da casa'
              : 'Como cada projeto está indo: gestor, prazo e progresso'}
          </p>
        </div>
        {aba === 'geral' && podeCriar && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
            onClick={() => setForm({ editando: null })}>
            + Novo projeto
          </button>
        )}
      </div>

      {!carregando && projetos.length > 0 && (
        <div className="admin-toolbar">
          <span className="admin-toolbar-label">Filtrar</span>
          <FilterDropdown label="Status" values={fStatus} options={opcoes.status} onChange={setFStatus} />
          <FilterDropdown label="Cliente" values={fCliente} options={opcoes.cliente} onChange={setFCliente} />
          <FilterDropdown label="Gestor" values={fGestor} options={opcoes.gestor} onChange={setFGestor} />
          <FilterDropdown label="Tipo" values={fTipo} options={opcoes.tipo} onChange={setFTipo} />
          {temFiltro && (
            <button
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={limparFiltros}
            >
              Limpar
            </button>
          )}
          <div className="admin-toolbar-spacer" />
          {aba === 'geral' && (
            <div className="view-toggle">
              <div className="view-toggle-pill" style={{ left: view === 'quadro' ? 3 : 35 }} />
              <button className={view === 'quadro' ? 'active' : ''} onClick={() => setView('quadro')} title="Quadro">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" /></svg>
              </button>
              <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} title="Lista">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          )}
        </div>
      )}

      {carregando ? (
        <div className="dux-spinner-row" style={{ padding: '48px 0' }}><span className="dux-spinner" /></div>
      ) : filtrados.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>{temFiltro ? 'Nenhum projeto para esse filtro' : 'Nenhum projeto encontrado'}</p>
          {!temFiltro && podeCriar && (
            <p style={{ fontSize: 12.5, color: 'var(--gray2)', marginTop: 4 }}>
              Cadastre o primeiro em "Novo projeto".
            </p>
          )}
        </div>
      ) : aba === 'geral' && view === 'quadro' ? (
        <div className="kanban-board">
          {STATUS_PROJETO.map(st => {
            const daColuna = filtrados.filter(p => p.status === st);
            const cor = COR_STATUS[st];
            return (
              <div key={st} className="kanban-column">
                <div className="kanban-column-header">
                  <div className="kanban-column-title">
                    <span className="kanban-dot" style={{ background: cor }} />
                    {st}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)' }}>
                    {daColuna.length}
                  </span>
                </div>
                <div className="kanban-column-body">
                  {daColuna.map(p => (
                    <div key={p.id} className="kanban-card"
                      onClick={() => podeEditar && setForm({ editando: p })}
                      style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--black)', margin: 0 }}>{p.nome}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '2px 0 0' }}>
                        {p.codigo}{p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                      </p>
                      <div style={{ marginTop: 10 }}><Barra valor={p.progresso} /></div>
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.equipe.slice(0, 4).map(m => (
                          <span key={m.id} title={`${m.nome} - ${m.papel}`}>
                            <Avatar nome={m.nome} size={20} />
                          </span>
                        ))}
                        {p.equipe.length > 4 && (
                          <span style={{ fontSize: 11, color: 'var(--gray2)' }}>+{p.equipe.length - 4}</span>
                        )}
                        {p.arquivos.length > 0 && (
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gray2)' }}>
                            {p.arquivos.length} anexo{p.arquivos.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : aba === 'geral' ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th><th>Projeto</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Anexos</th>
                <th style={{ textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id}
                  onClick={() => podeEditar && setForm({ editando: p })}
                  tabIndex={podeEditar ? 0 : undefined}
                  onKeyDown={e => {
                    // Linha clicavel tambem precisa abrir pelo teclado.
                    if (podeEditar && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setForm({ editando: p });
                    }
                  }}
                  style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                  <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--gray)', whiteSpace: 'nowrap' }}>
                    {p.codigo || '-'}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--black)' }}>{p.nome}</div>
                    {p.objetivo && (
                      <div style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 2 }}>
                        {p.objetivo.length > 70 ? `${p.objetivo.slice(0, 70)}…` : p.objetivo}
                      </div>
                    )}
                  </td>
                  <td>{p.cliente_nome || '-'}</td>
                  <td style={{ color: 'var(--gray)' }}>{p.tipo || '-'}</td>
                  <td>
                    {podeEditar ? (
                      // O controle vive dentro de uma linha clicavel: o clique e o
                      // Enter param aqui, senao abririam o modal de edicao junto.
                      <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <PilulaStatus valor={p.status} onChange={v => void ajustar(p, 'status', v)} />
                      </span>
                    ) : <ChipStatus status={p.status} />}
                  </td>
                  <td style={{ color: 'var(--gray2)' }}>{p.arquivos.length || '-'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {podeExcluir && (
                      <button className="admin-toolbar-btn" title="Excluir projeto"
                        onClick={e => { e.stopPropagation(); setExcluindo(p); }}>
                        <IconTrash size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="admin-stats">
            {([
              ['Total', resumo.total, 'projetos cadastrados', 'var(--yellow)'],
              ['Em andamento', resumo.andamento, 'com trabalho ativo', '#0066CC'],
              ['Concluídos', resumo.concluidos, 'entregues', '#1E8A3E'],
              ['Atrasados', resumo.atrasados, 'passaram da previsão', '#D93025'],
            ] as const).map(([label, valor, desc, cor], i) => (
              <div key={label} className="admin-stat-card-v2"
                style={{ '--accent-color': cor, animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
                <p className="stat-v2-label">{label}</p>
                <p className="stat-v2-value">{valor}</p>
                <p className="stat-v2-desc">{desc}</p>
              </div>
            ))}
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Projeto</th><th>Gestor</th><th>Equipe</th><th>Entrega</th>
                  <th>Status</th><th style={{ minWidth: 160 }}>Progresso</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const dias = diasPara(p.previsao_entrega);
                  const atrasado = dias !== null && dias < 0
                    && p.status !== 'Concluído' && p.status !== 'Cancelado';
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--black)' }}>{p.nome}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 2 }}>
                          {p.codigo}{p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                        </div>
                      </td>
                      <td><Gestor nome={gestorDe(p)?.nome ?? null} email={gestorDe(p)?.email ?? null} /></td>
                      <td>
                        {p.equipe.filter(m => m.papel !== 'Gestor').length === 0
                          ? <span style={{ color: 'var(--gray2)' }}>-</span>
                          : (
                            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                              {p.equipe.filter(m => m.papel !== 'Gestor').slice(0, 4).map(m => (
                                <span key={m.id} title={`${m.nome} - ${m.papel}`}>
                                  <Avatar nome={m.nome} size={20} />
                                </span>
                              ))}
                              {p.equipe.filter(m => m.papel !== 'Gestor').length > 4 && (
                                <span style={{ fontSize: 11, color: 'var(--gray2)' }}>
                                  +{p.equipe.filter(m => m.papel !== 'Gestor').length - 4}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtData(p.previsao_entrega)}
                        {atrasado && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#B45309' }}>
                            {Math.abs(dias!)}d de atraso
                          </span>
                        )}
                      </td>
                      <td>
                        {podeEditar ? (
                          <SelectSistema
                            valor={p.status}
                            onChange={v => void ajustar(p, 'status', v)}
                            opcoes={STATUS_PROJETO.map(s => ({ valor: s as string, label: s }))}
                            minWidth={150}
                          />
                        ) : <ChipStatus status={p.status} />}
                      </td>
                      <td>
                        {podeEditar ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="range" min={0} max={100} step={5} value={p.progresso}
                              onChange={e => void ajustar(p, 'progresso', Number(e.target.value))}
                              style={{ flex: 1, minWidth: 90, accentColor: 'var(--yellow)' }}
                              aria-label={`Progresso de ${p.nome}`} />
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', minWidth: 32, textAlign: 'right' }}>
                              {p.progresso}%
                            </span>
                          </div>
                        ) : <Barra valor={p.progresso} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {form && (
        <FormularioProjeto
          editando={form.editando}
          pessoas={pessoas}
          clientes={clientes}
          salvando={salvando}
          onFechar={() => setForm(null)}
          onSalvar={salvar}
          onBaixarAnexo={a => void baixarAnexo(a)}
        />
      )}

      {excluindo && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExcluindo(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir projeto</p>
            <p className="delete-confirm-desc">
              Tem certeza que deseja excluir "<strong>{excluindo.nome}</strong>"?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setExcluindo(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={() => void excluir(excluindo)}>Excluir</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
