// ─────────────────────────────────────────────────────────────────────────────
//  As vitrines de profissionais, do lado de dentro.
//
//  Uma vitrine é a seleção de uma vaga mostrada a um cliente numa página sem
//  login: os escolhidos aparecem lá sem nome e sem contato. Aqui se monta a
//  seleção, se revisa o que vai aparecer de cada um, se manda o link e se vê
//  quem o cliente pediu.
//
//  A revisão é o coração: o que sai é o texto guardado na vitrine, e não a
//  ficha da pessoa. Mexer aqui não mexe no cadastro, e mexer no cadastro não
//  muda o que o cliente já viu.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconCheck, IconEye, IconInbox, IconLink, IconSearch, IconSpinner, IconTrash, IconX,
} from '../components/icons';
import { CampoTexto } from '../components/CampoTexto';
import { SegSwitch } from '../components/SegSwitch';
import { DatePicker } from '../components/DatePicker';
import { Dialogo } from '../components/Dialogo';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useLarguraPainel } from '../lib/painelLateral';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { instante, tempoRelativo } from '../lib/datas';
import { useAuth, useToast } from './AdminApp';
import { useApi } from './OportunidadesPage';

/** Quem pode entrar numa vitrine: a lista unificada da página de talentos. */
export interface PessoaParaVitrine {
  tipo: 'interno' | 'externo';
  id: string;
  nome: string;
  meio: string;
  senioridade: string;
  experiencia: string;
  habilidades: string[];
}

interface Vitrine {
  id: number;
  token: string;
  titulo: string;
  /** 'todos' mostra o banco inteiro; 'selecao', só quem foi escolhido. */
  modo: string;
  empresa: string | null;
  recado: string | null;
  expira_em: string | null;
  revogada_em: string | null;
  criado_em: string;
  criado_por_nome: string;
  perfis: number;
  interesses: number;
  acessos: number;
  ultimo_acesso: string | null;
}

interface PerfilDaVitrine {
  id: number;
  pessoa_tipo: string;
  pessoa_id: string;
  apelido: string;
  resumo: string;
  senioridade: string | null;
  tempo_experiencia: string | null;
  modelo_trabalho: string | null;
  contratacao: string | null;
  ingles: string | null;
  competencias: { nome: string; nota: number }[];
  habilidades: string[];
}

interface Interesse {
  id: number;
  perfil_id: number;
  apelido: string | null;
  quem: string | null;
  mensagem: string | null;
  criado_em: string;
}

/** O endereço que vai para o cliente. */
const enderecoDa = (v: Vitrine) => `${window.location.origin}/v/${v.token}`;

/** Aberta, fechada à mão ou vencida - é o que a lista precisa dizer de relance. */
function estadoDa(v: Vitrine): { texto: string; classe: string } {
  if (v.revogada_em) return { texto: 'Fechada', classe: 'fechada' };
  const hoje = new Date().toISOString().slice(0, 10);
  if (v.expira_em && v.expira_em < hoje) return { texto: 'Vencida', classe: 'fechada' };
  if (v.expira_em) return { texto: `Aberta até ${v.expira_em.split('-').reverse().join('/')}`, classe: 'aberta' };
  return { texto: 'Aberta', classe: 'aberta' };
}

// ── A gaveta que monta a vitrine ─────────────────────────────────────────────

function NovaVitrine({ token, pessoas, onFechar, onCriada }: {
  token: string;
  pessoas: PessoaParaVitrine[];
  onFechar: () => void;
  onCriada: () => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const painel = useLarguraPainel('vitrine-nova');
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const [titulo, setTitulo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [recado, setRecado] = useState('');
  const [validade, setValidade] = useState('');
  const [busca, setBusca] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  /** O banco inteiro é o padrão: é a vitrine que o cliente varre sozinho, e
   *  nela não há o que escolher antes. A seleção continua ali para quando a
   *  conversa é de uma vaga só. */
  const [modo, setModo] = useState<'todos' | 'selecao'>('todos');

  const chave = (p: PessoaParaVitrine) => `${p.tipo}:${p.id}`;
  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q) return pessoas;
    return pessoas.filter(p => [p.nome, p.meio, p.senioridade, ...p.habilidades]
      .join(' ').toLocaleLowerCase('pt-BR').includes(q));
  }, [busca, pessoas]);

  async function criar() {
    if (!titulo.trim() || salvando) return;
    if (modo === 'selecao' && !escolhidos.length) return;
    setSalvando(true);
    const r = await api('', 'POST', {
      action: 'criar_vitrine',
      titulo: titulo.trim(),
      empresa: empresa.trim(),
      recado: recado.trim(),
      expira_em: validade || null,
      modo,
      pessoas: modo === 'selecao'
        ? escolhidos.map(c => ({ tipo: c.split(':')[0], id: c.split(':').slice(1).join(':') }))
        : [],
    }).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      toast('error', 'Não foi possível abrir a vitrine', r?.error ?? 'Tente de novo.');
      return;
    }
    const quantos = Number(r.perfis ?? escolhidos.length);
    toast('success', 'Vitrine aberta',
      `${quantos} ${quantos === 1 ? 'profissional' : 'profissionais'}. Revise antes de mandar o link.`);
    onCriada();
    fechar();
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel largura={painel.largura} arrastando={painel.arrastando}
        setArrastando={painel.setArrastando} porTecla={painel.porTecla} />
      <div className="admin-modal painel-gaveta" style={{ width: `min(${painel.largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">NOVA VITRINE</p>
            <input className="painel-titulo painel-titulo-campo" value={titulo} autoFocus
              placeholder="Banking - Backend e QA"
              onFocus={e => e.currentTarget.select()}
              onChange={e => setTitulo(e.target.value)} />
          </div>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>

        <div className="admin-modal-body vitrine-corpo">
          <div className="vitrine-campos">
            <div className="form-group">
              <label className="form-label">Para qual empresa</label>
              <input className="form-input" value={empresa} placeholder="Nome de quem vai receber o link"
                onChange={e => setEmpresa(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Aberta até</label>
              <DatePicker compact value={validade} onChange={setValidade} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Recado de abertura</label>
            <CampoTexto valor={recado} onMudar={setRecado} linhas={2} alturaMaxima={140}
              placeholder="O que o cliente lê antes dos cartões" />
          </div>

          <p className="admin-section-title" style={{ marginTop: 4 }}>
            Quem entra
            {modo === 'selecao' && escolhidos.length > 0 && (
              <span className="vitrine-conta">{escolhidos.length}</span>
            )}
          </p>
          <SegSwitch valor={modo} onChange={v => setModo(v as 'todos' | 'selecao')}
            opcoes={[
              { valor: 'todos', label: `Todo o banco (${pessoas.length})` },
              { valor: 'selecao', label: 'Escolher alguns' },
            ]} />
          <p className="acessos-dica">
            {modo === 'todos'
              ? 'A empresa vê todo mundo do banco, sem nome e sem contato, e busca por conta dela. Quem entrar no banco depois se traz pela revisão.'
              : 'A empresa vê só quem você marcar aqui.'}
          </p>
          {/* A escolha um a um só existe no modo seleção: no banco inteiro não
              há o que marcar, e a lista ali seria uma pergunta sem resposta. */}
          <div className={`revelar${modo === 'selecao' ? ' aberto' : ''}`}>
            <div>
          <span className="secao-busca-campo">
            <IconSearch size={13} />
            <input value={busca} aria-label="Buscar profissional" placeholder="Buscar por nome, interesse ou habilidade"
              onChange={e => setBusca(e.target.value)} />
            {busca && (
              <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
                <IconX size={12} />
              </button>
            )}
          </span>
          <ul className="vitrine-gente lista-anima" key={visiveis.map(p => chave(p)).join('|')}>
            {visiveis.map(p => {
              const marcado = escolhidos.includes(chave(p));
              return (
                <li key={chave(p)}>
                  <label className="vitrine-gente-linha">
                    <input type="checkbox" className="form-checkbox" checked={marcado}
                      onChange={() => setEscolhidos(e => (marcado
                        ? e.filter(x => x !== chave(p))
                        : [...e, chave(p)]))} />
                    <span className="vitrine-gente-nome">{p.nome}</span>
                    <span className="vitrine-gente-meio">
                      {[p.meio, p.senioridade, p.experiencia].filter(Boolean).join(' · ')}
                    </span>
                  </label>
                </li>
              );
            })}
            {visiveis.length === 0 && <li className="nt-vazio">Ninguém para essa busca.</li>}
          </ul>
            </div>
          </div>
        </div>

        <div className="painel-rodape">
          <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
          <button type="button" className="modal-acao-primaria"
            disabled={!titulo.trim() || (modo === 'selecao' && !escolhidos.length) || salvando}
            onClick={() => void criar()}>
            {salvando ? <><IconSpinner size={13} /> Abrindo</> : 'Abrir vitrine'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── A gaveta que revisa o que o cliente vê ───────────────────────────────────

function RevisarVitrine({ token, vitrine, onFechar, onMudou }: {
  token: string;
  vitrine: Vitrine;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const painel = useLarguraPainel('vitrine-revisar');
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const [perfis, setPerfis] = useState<PerfilDaVitrine[] | null>(null);
  const [interesses, setInteresses] = useState<Interesse[]>([]);
  const [tirando, setTirando] = useState<PerfilDaVitrine | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  /** Quem entrou no banco depois entra na vitrine. Só no modo banco inteiro: é
   *  lá que a promessa é mostrar todo mundo. */
  async function sincronizar() {
    setSincronizando(true);
    const r = await api('', 'POST', { action: 'sincronizar_vitrine', id: vitrine.id }).catch(() => null);
    setSincronizando(false);
    if (!r?.ok) {
      toast('error', 'Não foi possível trazer', r?.error ?? 'Tente de novo.');
      return;
    }
    const n = Number(r.entraram ?? 0);
    toast(n ? 'success' : 'info',
      n ? `${n} ${n === 1 ? 'profissional entrou' : 'profissionais entraram'}` : 'Nada novo no banco',
      n ? 'Revise o texto de cada um antes de o cliente ver.' : 'A vitrine já tem todo mundo.');
    if (n) { await carregar(); onMudou(); }
  }

  const carregar = useCallback(async () => {
    const r = await api(`?action=vitrine&id=${vitrine.id}`);
    setPerfis((r?.perfis ?? []) as PerfilDaVitrine[]);
    setInteresses((r?.interesses ?? []) as Interesse[]);
  }, [api, vitrine.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** O texto grava sozinho depois da pausa na digitação, como o combinado da
   *  Planning: uma ida ao servidor por tecla seria uma por letra. */
  const espera = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const guardarDepois = (id: number, mudanca: Partial<PerfilDaVitrine>) => {
    clearTimeout(espera.current.get(id));
    espera.current.set(id, setTimeout(() => {
      void api('', 'POST', { action: 'salvar_vitrine_perfil', id, ...mudanca })
        .then(r => { if (!r?.ok) toast('error', 'Não foi possível salvar', r?.error ?? 'A conexão caiu.'); })
        .catch(() => toast('error', 'Não foi possível salvar', 'A conexão caiu.'));
    }, 700));
  };
  // Sair da gaveta no meio da digitação não pode perder a última frase.
  useEffect(() => () => {
    for (const t of espera.current.values()) clearTimeout(t);
  }, []);

  /** Grava o que foi revisado. Pinta na hora: quem escreveu já leu o que
   *  escreveu, e esperar o servidor para ver a própria frase é ruído. */
  async function salvar(p: PerfilDaVitrine, mudanca: Partial<PerfilDaVitrine>) {
    const antes = perfis;
    setPerfis(l => (l == null ? l : l.map(x => (x.id === p.id ? { ...x, ...mudanca } : x))));
    const r = await api('', 'POST', { action: 'salvar_vitrine_perfil', id: p.id, ...mudanca })
      .catch(() => null);
    if (!r?.ok) {
      setPerfis(antes);
      toast('error', 'Não foi possível salvar', r?.error ?? 'A conexão caiu.');
    }
  }

  async function remover(p: PerfilDaVitrine) {
    const antes = perfis;
    setPerfis(l => (l == null ? l : l.filter(x => x.id !== p.id)));
    setTirando(null);
    const r = await api('', 'POST', { action: 'remover_vitrine_perfil', id: p.id }).catch(() => null);
    if (!r?.ok) {
      setPerfis(antes);
      toast('error', 'Não foi possível tirar da vitrine', r?.error ?? 'A conexão caiu.');
      return;
    }
    onMudou();
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel largura={painel.largura} arrastando={painel.arrastando}
        setArrastando={painel.setArrastando} porTecla={painel.porTecla} />
      <div className="admin-modal painel-gaveta" style={{ width: `min(${painel.largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">VITRINE</p>
            <p className="painel-titulo">{vitrine.titulo}</p>
          </div>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>

        <div className="admin-modal-body vitrine-corpo">
          <p className="acessos-dica">
            O que está escrito aqui é o que o cliente lê. Tire o que identifica a pessoa: nome de
            empresa vira "banco grande", cidade vira região. O cadastro dela não é tocado.
          </p>

          {interesses.length > 0 && (
            <div className="vitrine-interesses surge">
              <p className="admin-section-title">Interesses recebidos</p>
              <ul>
                {interesses.map(i => (
                  <li key={i.id}>
                    <strong>{i.quem ?? 'Alguém do cliente'}</strong> pediu {i.apelido ?? 'um perfil'}
                    <span className="vitrine-quando">{tempoRelativo(i.criado_em)}</span>
                    {i.mensagem && <p>{i.mensagem}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {perfis == null ? (
            <div className="dux-spinner-row" style={{ padding: 30 }}><span className="dux-spinner sm" /></div>
          ) : perfis.length === 0 ? (
            <p className="nt-vazio">Nenhum profissional nesta vitrine.</p>
          ) : (
            <ul className="vitrine-perfis">
              {perfis.map(p => (
                <li key={p.id} className="vitrine-perfil">
                  <div className="vitrine-perfil-topo">
                    <input className="form-input vitrine-apelido" value={p.apelido}
                      aria-label="Como este profissional aparece"
                      onChange={e => setPerfis(l => (l == null ? l
                        : l.map(x => (x.id === p.id ? { ...x, apelido: e.target.value } : x))))}
                      onBlur={e => void salvar(p, { apelido: e.target.value.trim() || p.apelido })} />
                    <span className="vitrine-perfil-meta">
                      {[p.senioridade, p.tempo_experiencia, p.contratacao].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="acesso-botao" title="Tirar da vitrine"
                      aria-label={`Tirar ${p.apelido} da vitrine`} onClick={() => setTirando(p)}>
                      <IconTrash size={12} />
                    </button>
                  </div>
                  <CampoTexto valor={p.resumo} linhas={3} alturaMaxima={260}
                    placeholder="O que este profissional faz, sem nada que leve até ele"
                    onMudar={texto => {
                      setPerfis(l => (l == null ? l
                        : l.map(x => (x.id === p.id ? { ...x, resumo: texto } : x))));
                      guardarDepois(p.id, { resumo: texto });
                    }} />
                  {p.habilidades.length > 0 && (
                    <p className="vitrine-perfil-hab">{p.habilidades.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="painel-rodape">
          {vitrine.modo === 'todos' && (
            <button type="button" className="modal-acao" disabled={sincronizando}
              title="Traz para a vitrine quem entrou no banco depois que ela foi aberta"
              onClick={() => void sincronizar()}>
              {sincronizando ? <><IconSpinner size={13} /> Trazendo</> : 'Trazer novos do banco'}
            </button>
          )}
          <button type="button" className="modal-acao" onClick={fechar}>Fechar</button>
          <a className="modal-acao-primaria" href={`/v/${vitrine.token}`} target="_blank" rel="noreferrer">
            <IconEye size={13} /> Ver como o cliente vê
          </a>
        </div>
      </div>

      {tirando && (
        <Dialogo titulo={`Tirar ${tirando.apelido} da vitrine?`}
          descricao={<>O cliente deixa de ver este profissional. O cadastro dele continua como está.</>}
          rotuloOk="Tirar" onFechar={() => setTirando(null)} onConfirmar={() => void remover(tirando)} />
      )}
    </div>,
    document.body,
  );
}

// ── A aba ────────────────────────────────────────────────────────────────────

export function VitrinesDeTalentos({ token, pessoas, abrir }: {
  token: string;
  pessoas: PessoaParaVitrine[];
  /** A vitrine que o aviso do inbox manda abrir, com o `nonce` do pedido. */
  abrir?: { id: string; nonce: number };
}) {
  const { pode } = useAuth();
  const { toast } = useToast();
  const api = useApi(token);
  const [lista, setLista] = useState<Vitrine[] | null>(null);
  const [nova, setNova] = useState(false);
  const [revisando, setRevisando] = useState<Vitrine | null>(null);
  const [excluindo, setExcluindo] = useState<Vitrine | null>(null);
  const podeAbrir = pode('talentos:vitrine');

  const carregar = useCallback(async () => {
    const r = await api('?action=vitrines');
    setLista((r?.vitrines ?? []) as Vitrine[]);
  }, [api]);
  useEffect(() => { void carregar(); }, [carregar]);

  // O interesse avisado no inbox abre a gaveta daquela vitrine. Espera a lista
  // chegar: antes dela nao ha o que abrir, e o pedido se perderia.
  const jaAbriu = useRef('');
  useEffect(() => {
    if (!abrir || !lista) return;
    const marca = `${abrir.id}:${abrir.nonce}`;
    if (jaAbriu.current === marca) return;
    const v = lista.find(x => String(x.id) === String(abrir.id));
    if (!v) return;
    jaAbriu.current = marca;
    setRevisando(v);
  }, [abrir?.id, abrir?.nonce, lista]);

  async function copiar(v: Vitrine) {
    try {
      await navigator.clipboard.writeText(enderecoDa(v));
      toast('success', 'Link copiado', v.titulo);
    } catch {
      toast('error', 'O navegador não deixou copiar', enderecoDa(v));
    }
  }

  async function alternarEstado(v: Vitrine) {
    const fechando = !v.revogada_em;
    setLista(l => (l == null ? l : l.map(x => (x.id === v.id
      ? { ...x, revogada_em: fechando ? new Date().toISOString() : null } : x))));
    const r = await api('', 'POST', { action: 'revogar_vitrine', id: v.id, reabrir: !fechando })
      .catch(() => null);
    if (!r?.ok) { void carregar(); toast('error', 'Não foi possível mudar', r?.error ?? 'Tente de novo.'); return; }
    toast('success', fechando ? 'Vitrine fechada' : 'Vitrine reaberta',
      fechando ? 'O link parou de abrir.' : 'O mesmo link volta a abrir.');
  }

  async function excluir(v: Vitrine) {
    setExcluindo(null);
    const antes = lista;
    setLista(l => (l == null ? l : l.filter(x => x.id !== v.id)));
    const r = await api('', 'POST', { action: 'excluir_vitrine', id: v.id }).catch(() => null);
    if (!r?.ok) { setLista(antes); toast('error', 'Não foi possível excluir', r?.error ?? 'Tente de novo.'); }
  }

  return (
    <div className="vitrine-aba">
      <div className="admin-toolbar">
        <span className="admin-toolbar-label">
          A seleção de uma vaga numa página sem login, com os profissionais sem nome e sem contato.
        </span>
        <div className="admin-toolbar-spacer" />
        {podeAbrir && (
          <button type="button" className="btn btn-primary" onClick={() => setNova(true)}>
            + Nova vitrine
          </button>
        )}
      </div>

      {lista == null ? (
        <div className="dux-spinner-row" style={{ padding: 40 }}><span className="dux-spinner sm" /></div>
      ) : lista.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
          <p>Nenhuma vitrine aberta.</p>
          <p style={{ fontSize: 12.5, color: 'var(--gray2)', marginTop: 4 }}>
            Escolha os profissionais de uma vaga e mande o link ao cliente, sem expor quem são.
          </p>
        </div>
      ) : (
        <ul className="vitrine-lista lista-anima" key={lista.map(v => v.id).join('|')}>
          {lista.map(v => {
            const estado = estadoDa(v);
            return (
              <li key={v.id} className="vitrine-item">
                <div className="vitrine-item-texto">
                  <p className="vitrine-item-titulo">
                    {v.titulo}
                    <span className={`vitrine-estado ${estado.classe}`}>{estado.texto}</span>
                    {v.modo === 'todos' && <span className="vitrine-estado banco">Banco inteiro</span>}
                  </p>
                  <p className="vitrine-item-sub">
                    {v.empresa ? `Para ${v.empresa} · ` : ''}
                    {v.perfis} {v.perfis === 1 ? 'profissional' : 'profissionais'}
                    {` · ${v.acessos} ${v.acessos === 1 ? 'abertura' : 'aberturas'}`}
                    {v.interesses > 0 && ` · ${v.interesses} ${v.interesses === 1 ? 'interesse' : 'interesses'}`}
                  </p>
                  <p className="vitrine-item-meta">
                    {instante(v.criado_em)} por {v.criado_por_nome}
                    {v.ultimo_acesso && ` - aberta ${tempoRelativo(v.ultimo_acesso)}`}
                  </p>
                </div>
                <div className="vitrine-item-acoes">
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copiar(v)}>
                    <IconLink size={12} /> Copiar link
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRevisando(v)}>
                    <IconCheck size={12} /> Revisar
                  </button>
                  {podeAbrir && (
                    <>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void alternarEstado(v)}>
                        {v.revogada_em ? 'Reabrir' : 'Fechar'}
                      </button>
                      <button type="button" className="acesso-botao" title="Excluir a vitrine"
                        aria-label={`Excluir ${v.titulo}`} onClick={() => setExcluindo(v)}>
                        <IconTrash size={12} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {nova && (
        <NovaVitrine token={token} pessoas={pessoas} onFechar={() => setNova(false)}
          onCriada={() => void carregar()} />
      )}
      {revisando && (
        <RevisarVitrine token={token} vitrine={revisando} onFechar={() => setRevisando(null)}
          onMudou={() => void carregar()} />
      )}
      {excluindo && (
        <Dialogo titulo={`Excluir "${excluindo.titulo}"?`}
          descricao={<>O link para de abrir e os interesses recebidos vão junto. Não tem desfazer.</>}
          rotuloOk="Excluir" onFechar={() => setExcluindo(null)}
          onConfirmar={() => void excluir(excluindo)} />
      )}
    </div>
  );
}
