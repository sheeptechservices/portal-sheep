import { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo, lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { ContaAnimada } from '../components/ContaAnimada';
import { corDoProjeto } from '../components/DicaDoProjeto';
import { IconAcessos, IconAlert, IconArrowRight, IconBalao, IconCheck, IconChevronRight, IconX, IconDashboard, IconGoogle, IconSair, IconSearch, IconSpinner } from '../components/icons';
import { lojaSubpagina, useSubpaginaAtual } from '../lib/subpagina';
import {
  criarPode, podeAbrirPagina, podeGerenciarUsuarios, podeVerUsuarios, PERMISSAO_DA_PAGINA,
  rotuloPapel, type Permissoes, type Pode,
} from './papeis';
import { createPortal } from 'react-dom';
import { CampoSenha } from '../components/CampoSenha';
import { MARCAS } from '../lib/marcas';
import { SkeletonPagina } from '../components/Skeleton';
import { GOOGLE_CLIENT_ID, GOOGLE_DOMINIO, carregarGis } from '../lib/google';
// Cada página é carregada sob demanda (code-splitting) - só entra no bundle quando aberta
const DashboardPage = lazy(() => import('./DashboardPage'));
const OportunidadesPage = lazy(() => import('./OportunidadesPage'));
const ProjetosPage = lazy(() => import('./ProjetosPage'));
const TarefasPage = lazy(() => import('./TarefasPage'));
const ConfiguracoesPage = lazy(() => import('./ConfiguracoesPage'));
const FerramentasPage = lazy(() => import('./FerramentasPage'));
const GeradorContratos = lazy(() => import('./GeradorContratos'));
const GeradorPropostas = lazy(() => import('./GeradorPropostas'));
const CofreSenhas = lazy(() => import('./CofreSenhas'));
const TalentosPage = lazy(() => import('./TalentosPage'));
const PerfilPage = lazy(() => import('./PerfilPage'));
const ConectarMcp = lazy(() => import('./ConectarMcp'));
const UsuariosPage = lazy(() => import('./UsuariosPage'));
const QuickSearch = lazy(() => import('./QuickSearch'));
import type { QuickTarget } from './QuickSearch';
import { DESTINOS, TOOL_PAGES, TOOL_LABELS, type Page } from './destinos';
import { CartaoReportar, type Relato } from '../components/CartaoReportar';
import { Inbox, type DestinoDaReuniao, type ItemDoInbox } from '../components/Inbox';
import type { Pessoa } from './FormularioTarefa';
import type { ReporteNaLista } from '../components/ListaReportes';
import { iniciarOndas } from '../lib/ondas';
import { ToastContext, type ToastItem } from '../lib/toast';
import { TrilhaContext, type DegrauTrilha } from '../lib/trilha';
import { useTrocaDeNivel } from '../lib/useTrocaDeNivel';
import { useLuzDoPonteiro } from '../lib/useLuzDoPonteiro';

// ── Toast system ─────────────────────────────────────────────────────────────
// O contrato e o gancho moram em `lib/toast`; aqui fica quem monta o provedor e
// desenha os balões. Reexportado para as páginas continuarem pedindo o gancho
// de onde sempre pediram.
import { ProvedorAtividades } from '../components/ProvedorAtividades';
export { useToast } from '../lib/toast';

// ── Auth context ──────────────────────────────────────────────────────────────
/** Quem está logado. Nulo quando a sessão veio da senha compartilhada. */
export interface UsuarioSessao {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  papel: string;
  /** Só vem, e só como `true`, para quem tem o MCP ligado. */
  mcp?: true;
}
interface AuthCtx {
  onSessionExpired: () => void;
  usuario: UsuarioSessao | null;
  /** Teste de permissão da sessão. Ver `criarPode` - responde `true` enquanto o
   *  `me` não voltou, para o menu não piscar cheio e esvaziar. */
  pode: Pode;
}
/** Exportado pelo mesmo motivo do `ToastContext`: página montada fora da casca
 *  - numa bancada, num teste - precisa de quem responda pelo `pode`, e sem o
 *  contexto à mão a única saída seria montar o portal inteiro com sessão. */
export const AuthContext = createContext<AuthCtx>({
  onSessionExpired: () => {},
  usuario: null,
  pode: criarPode(null),
});
export function useAuth() { return useContext(AuthContext); }

/** Primeiro nome + inicial do sobrenome: o que cabe no cabeçalho. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] ?? '';
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

/** Iniciais para o avatar quando o Google não deu foto. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** O selo de cada tipo de aviso. A cor vem da folha (`.toast-success` etc.),
 *  pelos tokens: verde, vermelho e o limão da marca para o informativo. */
const TOAST_ICONE: Record<ToastItem['type'], typeof IconCheck> = {
  success: IconCheck,
  error: IconAlert,
  info: IconBalao,
};

/** Quanto o aviso fica na tela. A barra do pé conta o mesmo tempo. */
const TOAST_DURACAO = 4000;

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icone = TOAST_ICONE[item.type];

  function leave() {
    setExiting(true);
    setTimeout(() => onDismiss(item.id), 320);
  }

  // Com o ponteiro em cima o aviso espera; saindo, o tempo recomeça inteiro -
  // e a barra do pé volta cheia junto, para contar a mesma coisa.
  useEffect(() => {
    if (hovered) { if (timerRef.current) clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(leave, TOAST_DURACAO);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hovered]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`toast-balao toast-${item.type}${exiting ? ' saindo' : ''}${hovered ? ' parado' : ''}`}
      role={item.type === 'error' ? 'alert' : 'status'}
      style={{ ['--toast-duracao' as string]: `${TOAST_DURACAO}ms` }}
    >
      <span className="toast-ico" aria-hidden="true"><Icone size={14} /></span>
      <div className="toast-texto">
        <p className="toast-title">{item.title}</p>
        {item.message && <p className="toast-message">{item.message}</p>}
      </div>
      <button type="button" className="toast-close" onClick={leave} aria-label="Fechar aviso">
        <IconX size={12} />
      </button>
      <span className="toast-tempo" aria-hidden="true" />
    </div>
  );
}

function ToastContainer({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return createPortal(
    <div className="toast-cais">
      {items.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <Toast item={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>,
    document.body
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────
// O catálogo de páginas e ferramentas vive em ./destinos - é dele que saem o
// breadcrumb do hub de Ferramentas e os destinos navegáveis da busca rápida.

/** `perm` existe para o item que ainda não tem página. O Dashboard é assim: a
 *  chave já está no catálogo e já é marcável por papel, mas a tela não nasceu -
 *  e sem `page` o filtro por `podeAbrirPagina` deixava ele passar para todo
 *  mundo, inclusive para quem teve o acesso desmarcado. */
type NavLeaf = { page?: Page; perm?: string; label: string; icon: JSX.Element; disabled?: boolean;
  /** As subpaginas que o item abre no menu, como no mockup: as abas da tela
   *  (`id` e o valor da aba) ou, com `pagina`, telas proprias (as ferramentas). */
  subs?: SubDoMenu[];
  /** Mora como subpagina deste item; so aparece solta no menu quando a pessoa
   *  nao alcanca o item pai (senao ficaria sem caminho ate ela). */
  dentroDe?: Page };
type SubDoMenu = { id: string; label: string; perm?: string; pagina?: Page };

/** Quão fundo a página está. As do menu ficam todas no mesmo andar - trocar
 *  entre elas é trocar de assunto, não descer -, e Ferramentas abre dois
 *  degraus abaixo: o hub e a ferramenta. É essa distância que a animação lê
 *  para saber se a página entra pela direita, pela esquerda ou sem sair do
 *  lugar. */
function profundidadeDaPagina(p: Page): number {
  if (p === 'ferramentas') return 1;
  return TOOL_PAGES.includes(p) ? 2 : 0;
}
const NAV_SECTIONS: { section: string; items: NavLeaf[] }[] = [
  {
    section: 'GERAL',
    items: [
      {
        page: 'dashboard',
        label: 'Dashboard',
        perm: 'dashboard:ver',
        icon: <IconDashboard size={15} />,
      },
      {
        page: 'oportunidades',
        label: 'Funil',
        subs: [
          { id: 'quadro', label: 'Quadro' },
          { id: 'lista', label: 'Lista' },
          { id: 'fechados', label: 'Fechados' },
          { id: 'perdidos', label: 'Perdidos' },
        ],
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        page: 'projetos',
        label: 'Projetos',
        subs: [
          { id: 'geral', label: 'Geral', perm: 'projetos:geral' },
          { id: 'planning', label: 'Planning', perm: 'projetos:planning' },
        ],
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l1.8 2.2h8A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 13h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        ),
      },
      {
        page: 'tarefas',
        label: 'Tarefas',
        subs: [
          { id: 'quadro', label: 'Quadro' },
          { id: 'lista', label: 'Lista' },
          { id: 'tabela', label: 'Tabela' },
        ],
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      {
        page: 'ferramentas',
        label: 'Ferramentas',
        subs: TOOL_PAGES.map(t => ({ id: t, label: TOOL_LABELS[t] ?? t, pagina: t })),
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        page: 'configuracoes',
        label: 'Configurações',
        subs: [
          { id: 'etapas', label: 'Etapas', perm: 'configuracoes:etapas' },
          { id: 'integracoes', label: 'Integrações', perm: 'configuracoes:integracoes' },
          { id: 'desenho', label: 'Desenho' },
          { id: 'usuarios', label: 'Usuários', pagina: 'usuarios' },
        ],
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        page: 'usuarios',
        label: 'Usuários',
        dentroDe: 'configuracoes',
        icon: <IconAcessos size={15} />,
      },
    ],
  },
];

/** As subpaginas de um item do menu, abrindo por baixo dele com o fio na
 *  esquerda. Ficam montadas o tempo todo: o `.revelar` so anima a altura, e
 *  montar na abertura faria o bloco crescer de nada para nada. */
function SubpaginasDoMenu({ pagina, subs, aberto, paginaAtual, onIr }: {
  pagina: Page;
  subs: SubDoMenu[];
  aberto: boolean;
  paginaAtual: Page;
  onIr: (s: SubDoMenu) => void;
}) {
  const gravada = useSubpaginaAtual(pagina);
  // Sem escolha ainda, a tela abre na primeira aba que a pessoa alcanca.
  const abaAtual = gravada ?? subs[0]?.id;
  return (
    <div className={`revelar nav-sub-revelar${aberto ? ' aberto' : ''}`} aria-hidden={!aberto}>
      <div>
        <div className="nav-sub">
          {subs.map(sub => {
            const ativa = sub.pagina ? paginaAtual === sub.pagina : (paginaAtual === pagina && abaAtual === sub.id);
            return (
              <button key={sub.id} type="button" tabIndex={aberto ? 0 : -1}
                className={`nav-sub-item${ativa ? ' ativo' : ''}`}
                aria-current={ativa ? 'page' : undefined}
                onClick={() => onIr(sub)}>
                <span className="nav-sub-rotulo">{sub.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Atalho da busca rápida - ⌘K no Mac, Ctrl+K no resto.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const QS_HINT = IS_MAC ? '⌘K' : 'Ctrl K';

// ── Topbar ────────────────────────────────────────────────────────────────────
function Topbar({ onToggle, onLogout, onQuickSearch, usuario, onAbrirPerfil, inbox, coluna, mostrarMarca, mostrarMenu, onIrInicio }: {
  onToggle: () => void;
  /** A logo do topo leva ao Dashboard. */
  onIrInicio: () => void;
  /** O botao de menu so aparece quando o menu nao esta a vista: preso e aberto,
   *  quem recolhe e a seta no alto do proprio menu. */
  mostrarMenu: boolean; onLogout: () => void; onQuickSearch: () => void; usuario: UsuarioSessao | null;
  onAbrirPerfil: () => void;
  /** Onde o topo mora na grade: sobre a coluna de conteudo quando o menu esta
   *  preso (o menu desce ate o topo da janela), a largura toda quando solto. */
  coluna: string;
  /** A marca so aparece no topo quando o menu nao a mostra: menu preso e
   *  aberto ja leva a marca no alto dele. */
  mostrarMarca: boolean;
  /** O inbox vem montado de cima: quem sabe falar com o servidor e a casca, e
   *  o topo so escolhe onde ele fica. */
  inbox: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [semFoto, setSemFoto] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [menuOpen]);

  return (
    <header className="app-topo" style={{
      gridColumn: coluna,
      gridRow: 1,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      position: 'sticky',
      top: 0,
      zIndex: 300,
      height: '100%',
      flexShrink: 0,
    }}>
      {/* Esquerda: o menu e, quando o menu nao a mostra, a marca. */}
      {(mostrarMenu || mostrarMarca) && (
      <div className="surge" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {mostrarMenu && (
        <button
          type="button"
          className="topo-icone"
          onClick={onToggle}
          title="Alternar menu"
          aria-label="Alternar menu"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="2" y1="12" x2="14" y2="12"/>
          </svg>
        </button>
        )}

        {/* A logo da casa: preta no claro, branca no escuro (ver .brand-logo). */}
        {mostrarMarca && (
          <button type="button" className="topo-marca surge" onClick={onIrInicio}
            title="Ir para o Dashboard" aria-label="Sheep Technology - ir para o Dashboard">
            <img src="/logo-sheep.png" alt="" aria-hidden="true" className="brand-logo"
              style={{ height: 30, width: 'auto', flexShrink: 0, display: 'block' }} />
          </button>
        )}
      </div>
      )}

    </header>
  );
}

/** Recusa de página. Mesma linguagem do estado vazio do Perfil. */
function SemAcesso() {
  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Sem acesso</h1>
          <p className="admin-page-desc">Esta página não faz parte do seu perfil</p>
        </div>
      </div>
      <div className="perfil-cartao perfil-vazio">
        <IconAlert size={18} />
        <div>
          <p className="perfil-vazio-titulo">Você não tem acesso a esta página</p>
          <p className="perfil-vazio-texto">
            O que cada perfil alcança é definido em Configurações, pelo administrador do sistema.
            Se você precisa desta página para trabalhar, peça a liberação a ele.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
/** A largura do menu, a mesma do mockup: e ela que a coluna da grade abre. */
const LARGURA_DO_MENU = 224;
/** Quantos projetos a secao do menu mostra antes do "Ver todos". */
const PROJETOS_NO_MENU = 6;
/** O pouco que o menu precisa saber de um projeto. */
interface ProjetoDoMenu { id: string; nome: string; cliente: string | null }

/** O trilho de icones: o menu recolhido, que abre com o ponteiro. */
const LARGURA_DO_TRILHO = 72;
const CHAVE_MENU_FIXO = 'dux_menu_fixo';
function lerMenuFixo(): boolean {
  try { return localStorage.getItem(CHAVE_MENU_FIXO) === '1'; } catch { return false; }
}
function gravarMenuFixo(fixo: boolean) {
  try { localStorage.setItem(CHAVE_MENU_FIXO, fixo ? '1' : '0'); } catch { /* janela privada */ }
}

/** Navegação do celular: barra fixa no rodapé, ao alcance do polegar.
 *
 *  Leva no máximo quatro destinos e um "Mais", que abre a mesma sidebar - com
 *  cinco itens de largura igual, a barra ainda dá alvo confortável, e o resto
 *  do menu continua a um toque. Só aparece abaixo de 768px, por CSS: decidir
 *  isso em JavaScript faria a barra piscar a cada giro do aparelho. */
function NavInferior({ page, setPage, onMais }: {
  page: Page;
  setPage: (p: Page) => void;
  onMais: () => void;
}) {
  const { pode, usuario } = useAuth();
  const veUsuarios = podeVerUsuarios(usuario);

  // A ordem é a da sidebar, filtrada pelo que a pessoa alcança: sem isso a
  // barra ofereceria uma tela que devolve "sem acesso".
  const candidatos = NAV_SECTIONS
    .flatMap(g => g.items)
    .filter(i => i.page && !i.disabled && podeAbrirPagina(pode, i.page, veUsuarios));

  const principais = candidatos.slice(0, 4);
  const sobra = candidatos.length > principais.length;

  if (principais.length === 0) return null;

  return (
    <nav className="nav-inferior" aria-label="Navegação principal">
      {principais.map(i => (
        <button
          key={i.page}
          type="button"
          className={`nav-inferior-item${page === i.page ? ' ativo' : ''}`}
          aria-current={page === i.page ? 'page' : undefined}
          onClick={() => setPage(i.page as Page)}
        >
          {i.icon}
          <span>{i.label}</span>
        </button>
      ))}
      {sobra && (
        <button type="button" className="nav-inferior-item" onClick={onMais}
          aria-label="Mais telas">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
          </svg>
          <span>Mais</span>
        </button>
      )}
    </nav>
  );
}

function Sidebar({
  page, setPage, open, pinned, onClose, onLogout, onAlternarFixo,
  projetosDoMenu, onAbrirProjeto, contagens, portas, onAbrirPerfil, onQuickSearch,
}: {
  /** A busca rapida mora no alto do menu: o topo da pagina fica livre. */
  onQuickSearch: () => void;
  /** As notificacoes: a porta que morava no topo. */
  portas: ReactNode;
  /** O cartao de quem esta usando leva ao Perfil. */
  onAbrirPerfil: () => void;
  /** Quantos itens cada tela tem em aberto, para a bolinha ao lado do nome. */
  contagens: Partial<Record<Page, number>>;
  /** Os projetos em andamento, para a secao PROJETOS do menu. */
  projetosDoMenu: ProjetoDoMenu[];
  onAbrirProjeto: (id: string) => void;
  /** Preso: alterna entre o trilho de icones e o menu fixado aberto. */
  onAlternarFixo: () => void;
  page: Page; setPage: (p: Page) => void; open: boolean; pinned: boolean; onClose: () => void;
  /** Sair mora no cartao de quem esta usando, no pe do menu. */
  onLogout: () => void;
}) {
  // Só o que depende de estar preso ou solto, e de estar aberto ou fechado: a
  // aparência - folha, fio da borda e sombra - mora na folha de estilo, com o
  // resto do material da casa.
  // Preso, o menu ocupa a coluna da grade: o trilho de icones (72px) ou, fixado
  // aberto, a largura inteira. No trilho o painel de dentro cresce por cima da
  // pagina com o ponteiro - quem cresce e ele, e nao a coluna, para a pagina
  // nao andar de lado a cada passada do mouse.
  const sidebarStyle: React.CSSProperties = pinned
    ? {
        gridColumn: 1,
        gridRow: '1 / -1',
        position: 'relative',
        width: '100%',
        minWidth: 0,
        height: '100%',
        overflow: 'visible',
        zIndex: 320,
      }
    : {
        overflow: 'hidden',
        width: LARGURA_DO_MENU,
        flexShrink: 0,
        position: 'fixed',
        left: 0,
        top: 64,
        height: 'calc(100vh - 64px)',
        zIndex: 300,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      };

  // Conteúdo com largura fixa: enquanto a coluna encolhe, o texto é recortado
  // pelo <aside> (overflow:hidden) em vez de requebrar de linha.
  const trilho = pinned && !open;
  const innerStyle: React.CSSProperties = trilho ? {} : {
    width: LARGURA_DO_MENU,
    minWidth: LARGURA_DO_MENU,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  };

  // Menu de quem está olhando: página que a pessoa não alcança não aparece, e
  // uma seção que fique sem item nenhum não deixa o título órfão. Esconder é
  // cortesia - a trava é o servidor, em cada ação.
  const { pode, usuario } = useAuth();
  // Quem abre a tela de Usuários: o master abre, para ler.
  const veUsuarios = podeVerUsuarios(usuario);
  const alcanca = (i: NavLeaf) =>
    (!i.page || podeAbrirPagina(pode, i.page, veUsuarios)) && (!i.perm || pode(i.perm));
  const alcancaPagina = (p: Page) => NAV_SECTIONS.some(g => g.items.some(i => i.page === p && alcanca(i)));
  const secoes = NAV_SECTIONS
    .map(g => ({
      ...g,
      // Usuarios mora dentro de Configuracoes; solto, so para quem nao abre
      // Configuracoes.
      items: g.items.filter(i => alcanca(i) && !(i.dentroDe && alcancaPagina(i.dentroDe))),
    }))
    .filter(g => g.items.length > 0);

  // As subpaginas abrem com o ponteiro parado sobre a pagina e fecham quando
  // ele sai do grupo (titulo e lista). A espera de entrada separa o "parei
  // aqui" da passada a caminho de outro item; a de saida deixa atravessar o
  // vao ate a lista sem ela fechar. Pelo teclado, o foco faz o mesmo papel, e
  // no toque (sem ponteiro) a seta abre e fecha.
  const [pairando, setPairando] = useState<string | null>(null);
  const esperaAbrir = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esperaFechar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limparEsperas = () => {
    if (esperaAbrir.current) clearTimeout(esperaAbrir.current);
    if (esperaFechar.current) clearTimeout(esperaFechar.current);
    esperaAbrir.current = esperaFechar.current = null;
  };
  useEffect(() => limparEsperas, []);
  const entrarNoGrupo = (p: string) => {
    limparEsperas();
    if (pairando === p) return;
    esperaAbrir.current = setTimeout(() => setPairando(p), 260);
  };
  const sairDoGrupo = (p: string) => {
    limparEsperas();
    esperaFechar.current = setTimeout(() => setPairando(atual => (atual === p ? null : atual)), 220);
  };
  const subsVisiveis = (item: NavLeaf): SubDoMenu[] => (item.subs ?? []).filter(s =>
    (!s.perm || pode(s.perm)) && (!s.pagina || podeAbrirPagina(pode, s.pagina, veUsuarios)));

  const renderLeaf = (item: NavLeaf) => {
    // O item pai fica aceso tambem nas subpaginas que sao telas proprias.
    const active = !!item.page && (page === item.page
      || (item.subs ?? []).some(sb => sb.pagina === page));
    const disabled = !!item.disabled;
    const subs = disabled || !item.page ? [] : subsVisiveis(item);
    const aberto = subs.length > 0 && pairando === item.page;
    const botao = (
      <button
        key={item.label}
        type="button"
        className={`nav-leaf${active ? ' ativo' : ''}`}
        disabled={disabled}
        title={disabled ? 'Em breve' : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          if (disabled || !item.page) return;
          setPage(item.page);
          if (!pinned) onClose();
        }}
      >
        <span className="nav-leaf-ico">{item.icon}</span>
        <span className="nav-leaf-texto">{item.label}</span>
        {disabled && <span className="nav-leaf-breve">em breve</span>}
        {/* Quantos itens a tela tem em aberto. A `key` e o numero: quando ele
            muda, a bolinha remonta e da o pulinho de "mudou". */}
        {!disabled && item.page && (contagens[item.page] ?? 0) > 0 && (
          <span key={contagens[item.page]} className="nav-leaf-conta"><ContaAnimada valor={contagens[item.page]!} /></span>
        )}
      </button>
    );
    if (!subs.length) return botao;
    return (
      <div key={item.label} className={`nav-com-sub${aberto ? ' aberto' : ''}`}
        onMouseEnter={() => entrarNoGrupo(item.page!)}
        onMouseLeave={() => sairDoGrupo(item.page!)}
        onFocus={() => { limparEsperas(); setPairando(item.page!); }}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) sairDoGrupo(item.page!); }}>
        {botao}
        <button type="button" className="nav-sub-seta" tabIndex={-1}
          onClick={() => { limparEsperas(); setPairando(aberto ? null : item.page!); }}
          aria-expanded={aberto} aria-label={`${aberto ? 'Recolher' : 'Abrir'} as páginas de ${item.label}`}>
          <span className={`entrega-seta${aberto ? ' aberta' : ''}`}><IconChevronRight size={13} /></span>
        </button>
        <SubpaginasDoMenu pagina={item.page!} subs={subs} aberto={aberto} paginaAtual={page}
          onIr={sub => {
            if (sub.pagina) setPage(sub.pagina);
            else { lojaSubpagina.definir(item.page!, sub.id); setPage(item.page!); }
            if (!pinned) onClose();
          }} />
      </div>
    );
  };

  return (
    <aside className={`app-menu${pinned ? '' : ' solto'}${open ? ' aberto' : ''}${trilho ? ' menu-trilho' : ''}`}
      style={sidebarStyle}>
      <div className="app-menu-painel" style={innerStyle}>
      {/* A marca no alto do menu, na altura do topo da pagina. So no menu
          preso: solto, ele nasce abaixo do topo, que ja mostra a marca. */}
      {/* O selo da casa no alto do menu: a ovelha num circulo e o nome por
          extenso, espacado. Preso, a seta ao lado recolhe o menu. */}
      <div className="menu-marca">
        {/* A logo da casa. No trilho so o carneiro cabe; aberto, entra a
            assinatura inteira por cima dele, na mesma altura. */}
        {/* A logo leva ao Dashboard, como em todo site: e a porta de casa. */}
        <button type="button" className="menu-marca-logos" title="Ir para o Dashboard"
          aria-label="Sheep Technology - ir para o Dashboard"
          onClick={() => { setPage('dashboard'); if (!pinned) onClose(); }}>
          <img src="/logo.png" alt="" aria-hidden="true" className="brand-logo menu-marca-simbolo" />
          <img src="/logo-sheep.png" alt="" aria-hidden="true" className="brand-logo menu-marca-assinatura" />
        </button>
        {pinned && (
          <button type="button" className="menu-recolher" onClick={onAlternarFixo}
            title={open ? 'Recolher o menu' : 'Manter o menu aberto'}
            aria-label={open ? 'Recolher o menu' : 'Manter o menu aberto'}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={open ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
            </svg>
          </button>
        )}
      </div>
      {/* A busca rapida, logo abaixo da marca: no trilho so a lupa, aberto o
          campo inteiro com o atalho. Ela abre a mesma busca do Ctrl+K. */}
      <div className="menu-busca-linha">
        <button type="button" className="nav-leaf menu-busca"
          onClick={() => { onQuickSearch(); if (!pinned) onClose(); }}
          title={`Busca rápida (${QS_HINT})`} aria-label="Buscar pessoas, projetos ou tarefas">
          <span className="nav-leaf-ico"><IconSearch size={15} /></span>
          <span className="nav-leaf-texto">Buscar</span>
          <span className="nav-leaf-conta menu-busca-atalho">{QS_HINT}</span>
        </button>
      </div>
      {/* A navegação rola; o rodapé de Aparência fica preso embaixo. */}
      <div className="menu-navegacao">
      {secoes.map((group, i) => (
        <div key={group.section || 'topo'} className="menu-grupo">
          {/* O primeiro grupo e o menu principal, sem rotulo, como no mockup; os
              seguintes levam o rotulo em caixa alta. */}
          {i > 0 && group.section && <p className="app-menu-secao">{group.section}</p>}

          {group.items.map(item => renderLeaf(item))}
          {/* O que chega para a pessoa - os avisos - entra logo depois da
              navegacao principal. */}
          {i === 0 && portas}
        </div>
      ))}
      {/* Os projetos em andamento, cada um com a inicial num selo da cor dele:
          o atalho para a ficha, sem passar pela lista. So para quem abre a tela
          de Projetos. */}
      {podeAbrirPagina(pode, 'projetos', veUsuarios) && projetosDoMenu.length > 0 && (
        <div className="menu-grupo menu-projetos">
          <p className="app-menu-secao">PROJETOS</p>
          {projetosDoMenu.slice(0, PROJETOS_NO_MENU).map((p, i) => (
            <button key={p.id} type="button" className={`nav-leaf menu-projeto cor-projeto-${corDoProjeto(p.id)}`}
              title={p.cliente ? `${p.nome} | ${p.cliente}` : p.nome}
              onClick={() => { onAbrirProjeto(p.id); if (!pinned) onClose(); }}>
              <span className="nav-leaf-ico menu-projeto-selo">{p.nome.trim().charAt(0).toUpperCase()}</span>
              <span className="nav-leaf-texto">{p.nome}</span>
            </button>
          ))}
          {projetosDoMenu.length > PROJETOS_NO_MENU && (
            <button type="button" className="nav-leaf menu-projetos-todos"
              onClick={() => { setPage('projetos'); if (!pinned) onClose(); }}>
              <span className="nav-leaf-ico menu-projeto-selo">+{projetosDoMenu.length - PROJETOS_NO_MENU}</span>
              <span className="nav-leaf-texto">Ver todos</span>
            </button>
          )}
        </div>
      )}
      </div>

      <div className="app-menu-rodape">
        <button type="button" className="menu-usuario-perfil" onClick={() => { onAbrirPerfil(); if (!pinned) onClose(); }}
          title="Abrir o seu perfil" aria-label="Abrir o seu perfil">
        <span className="menu-usuario-avatar" aria-hidden="true">
          {usuario?.foto_url
            ? <img src={usuario.foto_url} alt="" referrerPolicy="no-referrer" />
            : <span>{usuario ? iniciais(usuario.nome) : 'D'}</span>}
        </span>
        <span className="menu-usuario-texto">
          <span className="menu-usuario-nome">{usuario ? usuario.nome : 'Acesso compartilhado'}</span>
          <span className="menu-usuario-papel">{usuario ? rotuloPapel(usuario.papel) : 'Entrada por senha'}</span>
        </span>
        </button>
        {/* No computador a troca de tema mora no topo; aqui ela so aparece no
            celular, onde o topo nao tem lugar para ela. */}
        <button type="button" className="menu-sair" onClick={onLogout}
          title="Sair" aria-label="Sair da conta">
          <IconSair size={16} />
        </button>
      </div>
      </div>
    </aside>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
const SESSION_KEY = 'dux_admin_token';

// ── Entrar com o Google ───────────────────────────────────────────────────────
// Sem client_id configurado o bloco inteiro some, para não sobrar um botão morto
// na tela. O resto da configuração e os dois fluxos do GIS estão em lib/google.

/**
 * Botão de entrada. Usa o fluxo de código (`accounts.oauth2`), e não o ID token
 * puro, porque só ele devolve access token ao servidor - e sem access token a
 * People API não entrega a foto do perfil. Com este fluxo a foto é gravada na
 * própria primeira entrada, sem segundo clique (o botão do Perfil continua ali
 * para quem quiser trocar a foto depois).
 *
 * `select_account: true` pede a escolha da conta, e só ela. Sem isso o Google
 * reaproveita em silêncio a conta que já estiver aberta no navegador, e quem tem
 * uma conta pessoal logada bate num "Acesso bloqueado: o app só pode ser usado
 * dentro da organização" sem nenhum caminho para trocar - a tela de erro do
 * Google não oferece o seletor. Escolher a conta é um clique a mais e é o único
 * jeito de a pessoa dizer com qual entra.
 *
 * O campo é esse mesmo, e não `prompt`: `prompt` pertence ao cliente de *token*
 * (`initTokenClient`), e o cliente de *código* o descarta sem reclamar. Foi o
 * que aconteceu aqui - o seletor nunca chegou a aparecer, e a entrada continuou
 * indo direto para a conta aberta no navegador, como se a linha não existisse.
 *
 * Note que não se pede consentimento a cada entrada: a tela de autorização
 * continua aparecendo só quando é necessária, na prática no primeiro acesso.
 * Foi ela - e não o seletor de conta - que fez a foto sair do login numa versão
 * antiga.
 *
 * O desenho é botão nosso, e agora de verdade: o fluxo de código não tem
 * `renderButton`, então não há iframe do Google por cima para receber o clique.
 * `requestCode()` é chamado direto no gesto, o que também mantém o popup fora
 * do bloqueio do navegador.
 *
 * Enquanto a sessão não volta, o botão vira o nosso aviso de "Entrando…": a
 * troca leva segundos e, sem sinal, a pessoa clica de novo.
 */
function BotaoGoogle({ onCodigo, entrando }: { onCodigo: (c: string) => void; entrando: boolean }) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'indisponivel'>('carregando');
  const cliente = useRef<{ requestCode(): void } | null>(null);
  // O callback do Google é registrado uma vez; a ref mantém a versão atual sem
  // precisar reinicializar a biblioteca a cada render.
  const cb = useRef(onCodigo);
  cb.current = onCodigo;

  useEffect(() => {
    let vivo = true;
    carregarGis()
      .then(() => {
        if (!vivo || !window.google) return;
        cliente.current = window.google.accounts.oauth2.initCodeClient({
          client_id: GOOGLE_CLIENT_ID!,
          // `email` e `openid` porque o servidor confere identidade pelo ID token
          // que a troca devolve; `profile` porque é ele que libera a foto na
          // People API. Mesmo conjunto que a ação de foto do Perfil usa.
          scope: 'openid email profile',
          ux_mode: 'popup',
          // Sempre perguntar COM QUAL conta, nunca reaproveitar a que estiver
          // aberta: numa máquina com conta pessoal logada, o app - que é
          // interno da organização - responde 403 sem oferecer troca.
          select_account: true,
          callback: r => { if (r.code) cb.current(r.code); },
          // Fechar o popup é desistência, não erro: o botão volta ao normal.
          error_callback: () => {},
        });
        setEstado('pronto');
      })
      .catch(() => { if (vivo) setEstado('indisponivel'); });
    return () => { vivo = false; };
  }, []);

  if (estado === 'indisponivel') {
    return (
      <p className="login-aviso" role="alert">
        <IconAlert size={13} /> Não foi possível carregar a entrada do Google. Verifique a conexão
        e recarregue a página.
      </p>
    );
  }
  const ocupado = estado !== 'pronto';
  return (
    <div className={`login-google${ocupado ? ' ocupado' : ''}${entrando ? ' entrando' : ''}`}>
      {/* Botão da casa, e desta vez ele é o alvo do clique de verdade. O fluxo de
          código não desenha botão próprio - quem abre o popup é `requestCode()`,
          chamado direto no clique. Isso também evita o bloqueio de pop-up: a
          chamada nasce colada ao gesto, sem `await` no meio. */}
      <button
        type="button"
        className="login-google-botao"
        onClick={() => cliente.current?.requestCode()}
        disabled={ocupado || entrando}
      >
        {entrando
          ? <><IconSpinner size={14} /> Entrando…</>
          : ocupado
            ? <><IconSpinner size={13} /> Carregando o Google…</>
            : <><IconGoogle size={16} /> Fazer login com o Google</>}
      </button>
    </div>
  );
}

// Duas portas, e as duas com dono.
//
// A conta Google é a da casa. A senha *compartilhada* foi removida em
// 28/08/2026 - era uma porta anônima num sistema cuja auditoria pressupõe
// identidade, e o valor dela era adivinhável. O que existe ao lado dela hoje é
// outra coisa: e-mail e senha por pessoa, só de quem foi convidado no painel de
// Usuários, para o cliente ou parceiro que não tem conta Google nenhuma. Cada
// entrada continua assinada por alguém.
function LoginScreen({ onLogin, saindo }: { onLogin: (token: string) => void; saindo: boolean }) {
  const [error, setError] = useState('');
  /** Por qual porta a entrada está correndo. Um booleano só punha "Entrando…"
   *  nos dois botões ao mesmo tempo - e quem clicou num deles ficava sem saber
   *  qual dos dois estava respondendo. */
  const [entrando, setEntrando] = useState<null | 'google' | 'senha'>(null);
  /** A porta alternativa fica fechada até alguém pedir: quem é da casa não
   *  precisa dela, e um formulário de senha aberto convida a tentar. */
  const [comSenha, setComSenha] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const campoEmail = useRef<HTMLInputElement>(null);
  // O foco vai para o e-mail quando a área abre - e não na montagem, que
  // acontece com a tela, muito antes de alguém pedir a outra porta.
  useEffect(() => { if (comSenha) campoEmail.current?.focus(); }, [comSenha]);
  // Dispara a negativa do card e se apaga sozinho, para a animação poder rodar
  // de novo quando a próxima tentativa também falhar.
  const [nega, setNega] = useState(false);

  /**
   * Troca o código de autorização do Google por uma sessão nossa.
   *
   * É o fluxo de código, e não o ID token puro, porque só ele devolve access
   * token ao servidor - e é com ele que a foto do perfil sai da People API e é
   * gravada já na primeira entrada, sem segundo clique em lugar nenhum.
   */
  async function entrarComGoogle(code: string) {
    setError('');
    setEntrando('google');
    try {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login-google', code }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem(SESSION_KEY, token);
        onLogin(token);
      } else {
        const data = await res.json().catch(() => ({}));
        recusar(data.error ?? 'Esta conta Google não tem acesso.');
      }
    } catch {
      recusar('Erro de conexão. Tente novamente.');
    } finally {
      setEntrando(null);
    }
  }

  /** A outra porta: e-mail e senha, para o convidado sem conta Google. */
  async function entrarComSenha(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha || entrando) return;
    setError('');
    setEntrando('senha');
    try {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login-senha', email: email.trim(), senha }),
      });
      if (res.ok) {
        const { token } = await res.json();
        localStorage.setItem(SESSION_KEY, token);
        onLogin(token);
      } else {
        const data = await res.json().catch(() => ({}));
        recusar(data.error ?? 'E-mail ou senha incorretos.');
        setSenha('');
      }
    } catch {
      recusar('Erro de conexão. Tente novamente.');
    } finally {
      setEntrando(null);
    }
  }

  function recusar(msg: string) {
    setError(msg);
    setNega(true);
    setTimeout(() => setNega(false), 400);
  }

  return (
    <div className={`login-tela${saindo ? ' tela-sai' : ''}`}>
      <div className="login-coluna">
        <div className="login-bloco">

          {/* Assinatura: o lockup já traz símbolo e nome desenhados juntos, então
              não há texto ao lado - escrever "Sheep Technology" de novo aqui
              duplicaria o que a própria imagem diz. */}
          <div className="login-lockup">
            <img src="/logo-lockup.png" alt="Sheep Technology" className="login-lockup-marca" />
          </div>

          <h1 className="login-titulo">Entrar no portal</h1>
          {/* Só o nome, sem o TLD: `GOOGLE_DOMINIO` segue sendo o domínio
              inteiro para quem precisar dele, mas na frase o `.com` competia
              com o ponto final e confundia onde o endereço terminava. */}
          <p className="login-chamada">Utilize a sua conta @{GOOGLE_DOMINIO.split('.')[0]}</p>

          {GOOGLE_CLIENT_ID ? (
            <div className={nega ? 'login-nega' : undefined}>
              <BotaoGoogle onCodigo={entrarComGoogle} entrando={entrando === 'google'} />

              {/* A segunda porta, recolhida. O bloco fica montado o tempo todo:
                  é o que deixa abrir e fechar com animação em vez de aparecer
                  de estalo. */}
              <button type="button" className="login-outra-porta"
                aria-expanded={comSenha}
                onClick={() => { setComSenha(v => !v); setError(''); }}>
                {comSenha ? 'Voltar para o Google' : 'Entrar com e-mail e senha'}
              </button>
              <div className={`revelar${comSenha ? ' aberto' : ''}`}>
                <div>
                  <form className="login-senha" onSubmit={entrarComSenha}>
                    <input ref={campoEmail} className="form-input" type="email" value={email}
                      placeholder="E-mail" autoComplete="username"
                      onChange={e => setEmail(e.target.value)} />
                    <CampoSenha valor={senha} onMudar={setSenha}
                      placeholder="Senha" autoComplete="current-password" />
                    <button type="submit" className="login-senha-botao"
                      disabled={!!entrando || !email.trim() || !senha}>
                      {entrando === 'senha'
                        ? <><IconSpinner size={13} /> Entrando…</>
                        : 'Entrar'}
                    </button>
                  </form>
                </div>
              </div>

              {error && <p className="login-erro" role="alert">{error}</p>}
            </div>
          ) : (
            // Sem client_id não existe entrada nenhuma. A tela precisa dizer isso
            // em vez de ficar vazia, porque é o sintoma de env var faltando num
            // deploy - e não há senha para cair de volta.
            <p className="login-aviso" role="alert">
              <IconAlert size={13} /> A entrada com o Google não está configurada neste ambiente.
              Avise o time de tecnologia: falta a variável do client OAuth.
            </p>
          )}

          <MarcasDoGrupo />
        </div>
      </div>

      <LoginArte />
    </div>
  );
}

/** Carrossel dos clientes, no pé da coluna de acesso. As logos e suas
 *  alturas ópticas vêm de `lib/marcas`, compartilhadas com o portal. */

function MarcasDoGrupo() {
  return (
    <div className="login-marcas">
      <span className="login-marcas-rotulo">Nossos clientes</span>
      <div className="login-marcas-janela">
        {/* A fita é duplicada: a animação corre até -50% e emenda sem salto. */}
        <div className="login-marcas-fita">
          {[0, 1].map(volta => MARCAS.map(m => (
            m.cor && m.proporcao ? (
              // Marca de uma cor só entra por máscara: cinza em repouso, como as
              // outras, e a cor da marca no hover - que é o que a fita promete.
              <span
                key={`${volta}-${m.nome}`}
                className="login-marca-tingida"
                role={volta === 0 ? 'img' : undefined}
                aria-label={volta === 0 ? m.nome : undefined}
                aria-hidden={volta === 1 || undefined}
                data-copia={volta === 1 ? '' : undefined}
                style={{
                  height: m.altura, width: Math.round(m.altura * m.proporcao),
                  '--marca': `url(${m.src})`, '--marca-cor': m.cor,
                  '--marca-cor-escura': m.corEscura,
                } as React.CSSProperties}
              />
            ) : (
            <img
              key={`${volta}-${m.nome}`}
              src={m.src}
              alt={volta === 0 ? m.nome : ''}
              aria-hidden={volta === 1 || undefined}
              data-copia={volta === 1 ? '' : undefined}
              data-hover={m.fundoEscuro ? 'preto' : undefined}
              data-detalhe={m.detalhe ? '' : undefined}
              style={{ height: m.altura }}
            />
            )
          )))}
        </div>
      </div>
    </div>
  );
}

/**
 * Espera antes de tentar montar as ondas de novo, por falhas seguidas (ms). A
 * última se repete para sempre: a tela nunca desiste de vez do WebGL, só passa
 * a insistir devagar. Enquanto o canvas está fora do ar quem segura o
 * movimento é o degradê animado do CSS, então o palco nunca fica parado.
 */
const ONDAS_ESPERAS = [1500, 5000, 20000, 60000];

/**
 * O fundo do sistema: as mesmas ondas da tela de entrada, atrás da janela de
 * vidro. Elas aparecem nítidas na moldura em volta da janela e difusas através
 * dela, que é o que dá luz ao vidro sem pintar o fundo de uma cor só.
 *
 * Tela cheia custa caro, então a versão é mais leve que a do login: menos
 * camadas, 30 quadros por segundo e densidade de pixel 1 - por trás do vidro
 * borrado, a diferença não aparece. Para quando a aba some, e cai para os
 * focos em CSS da casca se o WebGL não subir ou se perder.
 */
function FundoDeOndas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reduzido] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [caiu, setCaiu] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el || reduzido || caiu) return;
    let ondas: ReturnType<typeof iniciarOndas> = null;
    let vigia = 0;
    const desligar = () => {
      window.clearInterval(vigia);
      vigia = 0;
      ondas?.parar();
      ondas = null;
    };
    const rever = () => {
      if (!document.hidden && !ondas) {
        ondas = iniciarOndas(el, { camadas: 5, fps: 30, dprMax: 1 });
        if (!ondas) { setCaiu(true); return; }
        vigia = window.setInterval(() => {
          if (ondas?.morto()) { desligar(); setCaiu(true); }
        }, 4000);
      } else if (document.hidden && ondas) {
        desligar();
      }
    };
    rever();
    document.addEventListener('visibilitychange', rever);
    return () => { document.removeEventListener('visibilitychange', rever); desligar(); };
  }, [reduzido, caiu]);

  if (reduzido || caiu) return null;
  return <canvas ref={canvas} className="casca-ondas" aria-hidden="true" />;
}

/** Painel direito: ondas animadas, o discurso no alto e o rodapé em vidro. */
function LoginArte() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reduzido] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Trocar a chave remonta o <canvas>: é o equivalente em React ao "recria o
  // canvas" do template, que o clonava no DOM, e é a única forma de conseguir
  // um contexto novo depois de um perdido. `ativo` diz se o elemento está no ar.
  const [tentativa, setTentativa] = useState(0);
  const [ativo, setAtivo] = useState(true);
  const falhas = useRef(0);

  useEffect(() => {
    // Movimento reduzido: fica só o degradê, sem laço de animação.
    if (reduzido || !ativo) return;
    const el = canvas.current;
    if (!el) return;

    const ondas = iniciarOndas(el);
    if (!ondas) { falhas.current++; setAtivo(false); return; }

    // Vigia do template: contexto perdido ou quadros travados tiram o canvas do
    // ar, e o efeito de baixo se encarrega de trazê-lo de volta. Um laço que
    // sobreviveu ao tique zera a penalidade - a próxima queda, que pode vir
    // horas depois, merece a tentativa rápida de novo.
    const vigia = setInterval(() => {
      if (document.hidden) return;
      if (!ondas.morto()) { falhas.current = 0; return; }
      falhas.current++;
      setAtivo(false);
    }, 2500);

    return () => { clearInterval(vigia); ondas.parar(); };
  }, [reduzido, ativo, tentativa]);

  useEffect(() => {
    if (reduzido || ativo) return;
    const espera = ONDAS_ESPERAS[Math.min(falhas.current - 1, ONDAS_ESPERAS.length - 1)] ?? ONDAS_ESPERAS[0];
    const voltar = () => { setTentativa(n => n + 1); setAtivo(true); };
    const relogio = setTimeout(voltar, espera);
    // A aba voltando a aparecer é o momento mais provável de o navegador
    // devolver a GPU: o contexto costuma ser perdido justamente enquanto a
    // página fica em segundo plano.
    const aoMostrar = () => { if (!document.hidden) voltar(); };
    document.addEventListener('visibilitychange', aoMostrar);
    return () => { clearTimeout(relogio); document.removeEventListener('visibilitychange', aoMostrar); };
  }, [reduzido, ativo]);

  return (
    <div className="login-palco">
      <div className="login-palco-caixa">
        {/* Fora do ar quando o WebGL não sobe: um canvas com contexto perdido é
            desenhado pelo Chrome como ícone de imagem quebrada. */}
        {!reduzido && ativo && <canvas key={tentativa} ref={canvas} className="login-ondas" aria-hidden="true" />}
        <div className="login-palco-veu" aria-hidden="true" />

        <div className="login-palco-topo">
          <span className="login-palco-risco" aria-hidden="true" />
          <p className="login-palco-frase">Fluidez em cada demanda, precisão em cada entrega.</p>
          <p className="login-palco-marca">Sheep Technology · Tecnologia</p>
        </div>

        <div className="login-palco-pe">
          <div className="login-palco-vidro">
            <p>© 2026 Sheep Technology. Todos os direitos reservados.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main shell ────────────────────────────────────────────────────────────────
function MainApp({ token, onLogout, saindo }: { token: string; onLogout: () => void; saindo: boolean }) {
  // A tela abre no Dashboard: a primeira pergunta de quem chega é como está a
  // casa, e não o que fazer agora - para isso existem os quadros, a um clique.
  const [page, setPage] = useState<Page>('dashboard');
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /** O degrau que a ferramenta aberta publica - ver `lib/trilha`. */
  const [degrau, setDegrau] = useState<DegrauTrilha | null>(null);
  const definirDegrau = useCallback((d: DegrauTrilha | null) => setDegrau(d), []);
  // O conteúdo segue o nível que está na tela, e não o pedido: enquanto a
  // saída roda, quem sai continua montado. O menu não espera - o item clicado
  // acende na hora.
  const nivel = useTrocaDeNivel(page, profundidadeDaPagina);
  const paginaNaTela = nivel.mostrado;
  const [quickOpen, setQuickOpen] = useState(false);
  useLuzDoPonteiro();
  // Card a abrir na página destino. O nonce força o efeito a rodar de novo quando
  // o mesmo card é escolhido duas vezes; a página zera o pedido ao consumi-lo, para
  // não reabrir o detalhe quando o usuário voltar à página pelo menu.
  /** A ficha que uma tela precisa abrir. `aba` e `reuniao` só existem no
   *  caminho do inbox: vincular uma reunião leva à ficha do projeto já na aba
   *  certa, com ela aberta. `aba: 'planning'` leva à Planning, na folha do
   *  projeto e na `semana` pedida. */
  // Os projetos em andamento para o menu. Carrega na entrada e de novo quando a
  // aba volta a ser olhada: um projeto criado ou encerrado por outra pessoa
  // aparece (ou sai) sem precisar recarregar a pagina.
  const [projetosDoMenu, setProjetosDoMenu] = useState<ProjetoDoMenu[]>([]);
  // As contagens ao lado do nome de cada tela: oportunidades sem desfecho no
  // Funil, projetos em andamento, tarefas abertas e as pessoas do portal.
  const [contagens, setContagens] = useState<Partial<Record<Page, number>>>({});
  const contar = useCallback(() => {
    const ler = (acao: string) => fetch(`/api/admin-data?action=${acao}`, { headers: { 'x-admin-session': token } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
    void Promise.all([ler('projetos'), ler('tarefa_status_configs'), ler('painel_comercial&meses=1'),
      ler('usuarios_notificaveis')])
      .then(([proj, etapas, comercial, usuarios]) => {
        const novas: Partial<Record<Page, number>> = {};
        if (proj?.projetos) {
          type P = { id: string; nome: string; cliente_nome: string | null; status: string;
            tarefas?: { id: number; status: string }[] };
          const lista = proj.projetos as P[];
          const ativos = lista.filter(p => p.status === 'Em andamento');
          setProjetosDoMenu(ativos
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
            .map(p => ({ id: p.id, nome: p.nome, cliente: p.cliente_nome })));
          novas.projetos = ativos.length;
          // Aberta e a que nao chegou na etapa de conclusao nem esta numa etapa
          // desconsiderada - a mesma conta da tela de Tarefas.
          const fora = new Set(((etapas?.statuses ?? []) as { nome: string; is_conclusao: number; is_excluded: number }[])
            .filter(e => Number(e.is_conclusao) === 1 || Number(e.is_excluded) === 1).map(e => e.nome));
          const unicas = new Map<number, string>();
          for (const p of lista) for (const t of p.tarefas ?? []) unicas.set(t.id, t.status);
          novas.tarefas = [...unicas.values()].filter(st => !fora.has(st)).length;
        }
        if (comercial?.emAberto) novas.oportunidades = Number(comercial.emAberto.quantas) || 0;
        if (Array.isArray(usuarios?.usuarios)) novas.usuarios = usuarios.usuarios.length;
        setContagens(novas);
      });
  }, [token]);
  // Conta na entrada, a cada troca de tela (o que se fez numa tela muda o
  // numero dela) e quando a aba volta a ser olhada.
  useEffect(() => { contar(); }, [contar, page]);
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') contar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [contar]);

  const [openCard, setOpenCard] = useState<
    {
      page: Page; id: string; nonce: number; aba?: 'reunioes' | 'planning'; reuniao?: number;
      semana?: string;
    } | null
  >(null);

  /** Manda o relato para o administrador do sistema. O cartão do menu cuida do
   *  próprio estado; daqui sai só a ida ao servidor. */
  const reportar = useCallback(async (relato: Relato) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'reportar', ...relato }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível enviar.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);

  /** A fila de relatos, e o print de um deles. Duas idas separadas de propósito:
   *  o print é o que pesa, e ele não viaja junto da lista. */
  const lerAdmin = useCallback(async (busca: string) => {
    const r = await fetch(`/api/admin-data?${busca}`, { headers: { 'x-admin-session': token } });
    return await r.json().catch(() => null);
  }, [token]);
  /**
   * Quem está esperando a ficha de projeto abrir.
   *
   * Vincular uma reunião pelo inbox leva à ficha dela, e entre o clique e a
   * ficha há uma ida ao servidor: a caixa de vincular fica na tela, girando,
   * até a página avisar que abriu. Sem isto ela fechava no clique e a pessoa
   * ficava alguns segundos olhando a tela de onde tinha saído.
   */
  const esperandoFicha = useRef<(() => void) | null>(null);
  const avisarFichaAberta = useCallback(() => {
    esperandoFicha.current?.();
    esperandoFicha.current = null;
  }, []);

  /** A fila de chamados abre pelo cartão do menu; o inbox pede que ela abra,
   *  e diz qual chamado deve estar expandido quando ela abrir. O `nonce` faz o
   *  mesmo chamado reabrir se alguém clicar no aviso duas vezes. */
  const [filaDeChamados, setFilaDeChamados] =
    useState<{ nonce: number; chamado?: number } | null>(null);

  const listarInbox = useCallback(async (leve?: boolean) => {
    try {
      return await lerAdmin(`action=inbox${leve ? '&leve=1' : ''}`) ?? { error: 'Não foi possível carregar os avisos.' };
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [lerAdmin]);

  const marcarInboxLido = useCallback(async (chaves: string[]) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'marcar_inbox_lido', chaves }),
      });
      return await r.json().catch(() => null);
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);

  /** Tira avisos da gaveta. É o único caminho que faz um aviso sumir. */
  const limparInbox = useCallback(async (chaves: string[]) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'limpar_inbox', chaves }),
      });
      return await r.json().catch(() => null);
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);

  /**
   * Atrela a reunião do Fireflies ao projeto escolhido na caixa do inbox. É a
   * mesma ação que a ficha do projeto usa - o caminho é um só.
   *
   * Vinculada, a tela vai à ficha daquele projeto, na aba de Reuniões, com a
   * reunião recém-criada aberta. Sem isso, o aviso sumia do inbox e nada
   * aparecia: a reunião existia no banco e a página de Projetos, montada antes,
   * continuava com a lista de antes - era preciso recarregar para vê-la.
   */
  const vincularReuniaoDoInbox = useCallback(async (firefliesId: string, destino: DestinoDaReuniao) => {
    // A reunião de venda vai para o card da oportunidade, pela ação do funil
    // (a permissão é a de editar oportunidade, e não a de projeto). Vinculada,
    // a tela abre o card dela: a reunião aparece ali, junto das outras.
    if (destino.tipo === 'oportunidade') {
      try {
        const r = await fetch('/api/admin-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
          body: JSON.stringify({
            action: 'anexar_reuniao_fireflies_oportunidade',
            oportunidade_id: destino.id, fireflies_ids: [firefliesId],
          }),
        });
        const resposta = await r.json().catch(() => null);
        if (!resposta || resposta.error) return resposta ?? { error: 'Não foi possível vincular.' };
        setPage('oportunidades');
        setOpenCard({ page: 'oportunidades', id: destino.id, nonce: Date.now() });
        return resposta;
      } catch {
        return { error: 'Erro de conexão. Tente de novo.' };
      }
    }
    const projetoId = destino.id;
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({
          action: 'anexar_reuniao_fireflies', projeto_id: projetoId, fireflies_ids: [firefliesId],
        }),
      });
      const resposta = await r.json().catch(() => null);
      if (resposta?.error) return resposta;
      // O id da reunião que acabou de nascer, que é o que a ficha precisa para
      // abrir aquela e não outra.
      const nova = Number(resposta?.reunioes?.[0]?.id) || undefined;
      setPage('projetos');
      setOpenCard(prev => ({
        page: 'projetos', id: projetoId, nonce: (prev?.nonce ?? 0) + 1,
        aba: 'reunioes', reuniao: nova,
      }));
      // Espera a ficha abrir para devolver: é o que mantém a caixa na tela,
      // girando, em vez de fechar e deixar um vão. O teto de 8s é rede: se a
      // ficha não abrir - projeto que sumiu, leitura que falhou -, ninguém
      // fica preso numa caixa que não fecha.
      await new Promise<void>(resolve => {
        esperandoFicha.current = resolve;
        setTimeout(() => {
          if (esperandoFicha.current === resolve) {
            esperandoFicha.current = null;
            resolve();
          }
        }, 8000);
      });
      return resposta;
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);

  /**
   * Onde cada aviso se resolve.
   *
   * O pedido do cliente já é uma tarefa no quadro, e o clique abre a gaveta
   * dela - pelo mesmo caminho da busca rápida, com o `nonce` que faz a mesma
   * tarefa reabrir se alguém clicar duas vezes. Levar só até a página deixava
   * a pessoa procurando no quadro a tarefa que o aviso acabara de nomear.
   *
   * A reunião se atrela na ficha do projeto e o chamado mora na fila que o
   * cartão do menu abre. Nos três casos o inbox leva até a tela e sai da
   * frente: resolver o aviso é trabalho de quem já sabe fazer aquilo.
   */
  const irPeloInbox = useCallback((item: ItemDoInbox) => {
    if (item.tipo === 'chamado') {
      setFilaDeChamados(prev => ({
        nonce: (prev?.nonce ?? 0) + 1,
        // `reporte:12`, ou `reporte:12:<quando reabriu>`: o id e o segundo pedaco.
        chamado: Number(item.chave.split(':')[1]) || undefined,
      }));
      return;
    }
    // A reunião não passa por aqui: ela abre a caixa de vincular dentro do
    // próprio inbox, que é onde a pergunta é feita.
    if (item.tipo === 'reuniao') return;
    // O interesse se resolve na vitrine que o cliente abriu: a gaveta dela
    // lista quem foi pedido, que e o que a linha do inbox esta anunciando.
    if (item.tipo === 'vitrine') {
      setPage('talentos');
      if (item.alvo) {
        setOpenCard(prev => ({ page: 'talentos', id: item.alvo!, nonce: (prev?.nonce ?? 0) + 1 }));
      }
      return;
    }
    setPage('tarefas');
    if (item.alvo) {
      setOpenCard(prev => ({ page: 'tarefas', id: item.alvo!, nonce: (prev?.nonce ?? 0) + 1 }));
    }
  }, []);

  const listarReportes = useCallback(async () => {
    try {
      return await lerAdmin('action=reportes') ?? { error: 'Não foi possível carregar os relatos.' };
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [lerAdmin]);
  const mudarStatusDoReporte = useCallback(async (id: number, status: string, avisar: boolean, comentario: string) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'set_reporte_status', id, status, avisar, comentario }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível mudar o status.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);
  const mudarTipoDoReporte = useCallback(async (id: number, tipo: string) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'set_reporte_tipo', id, tipo }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível classificar.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);
  const editarReporte = useCallback(async (id: number, texto: string, urgencia: string) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'editar_reporte', id, texto, urgencia }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível gravar a correção.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);
  const excluirReporte = useCallback(async (id: number) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'excluir_reporte', id }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível excluir.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);
  const reabrirReporte = useCallback(async (id: number, comentario: string) => {
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'reabrir_reporte', id, comentario }),
      });
      return await r.json().catch(() => ({ error: 'Não foi possível reabrir.' }));
    } catch {
      return { error: 'Erro de conexão. Tente de novo.' };
    }
  }, [token]);
  const printDoReporte = useCallback(async (id: number, anexo?: number) => {
    try {
      // Sem `anexo`, e o print antigo da propria linha; com ele, e um dos
      // arquivos da tabela de anexos. Quem pode ver ja foi decidido no servidor,
      // pelo dono do chamado.
      const d = await lerAdmin(
        `action=reporte_print&id=${id}${anexo ? `&anexo=${anexo}` : ''}`,
      );
      return d?.base64 ? d : null;
    } catch {
      return null;
    }
  }, [lerAdmin]);
  // Pedido vindo da tela de Projetos: abrir Tarefas já estreitada numa entrega.
  /** "Nova tarefa" do painel: a tela de Tarefas abre com uma tarefa nova na
   *  gaveta. O carimbo de hora faz o pedido valer de novo a cada clique. */
  const [criarTarefa, setCriarTarefa] = useState<number | null>(null);
  const [tarefasDaEntrega, setTarefasDaEntrega] = useState<
    { projeto: string; entrega: number; nonce: number } | null>(null);

  // Quem é o dono desta sessão. Vem do servidor, nunca do que o navegador
  // guardou: é essa identidade que assina cada ação daqui pra frente.
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  // `null` = ainda não chegou. O `criarPode` trata isso como "pode", para o menu
  // não montar cheio e esvaziar na volta seguinte.
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch('/api/admin-data?action=me', { headers: { 'x-admin-session': token } })
      .then(r => {
        // Token velho no localStorage: cai fora agora, em vez de deixar a tela
        // montar e cada requisição seguinte falhar sozinha.
        if (r.status === 401) { if (vivo) onLogout(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => {
        if (!vivo || !d) return;
        setUsuario(d.usuario ?? null);
        setPermissoes(d.permissoes ?? '*');
      })
      // Falhou: `permissoes` fica em `null`, que agora nega tudo, e a ronda
      // abaixo tenta de novo em um minuto. Antes o erro era engolido e a tela
      // seguia destravada pelo resto da sessão.
      .catch(() => {});
    return () => { vivo = false; };
  }, [token]);

  // Ronda da sessão. O servidor já recusa quem teve o acesso removido, mas só na
  // requisição seguinte: uma aba parada seguiria mostrando a tela até a pessoa
  // clicar em alguma coisa. A ronda transforma isso em, no máximo, um minuto - e
  // confere na hora em que a aba volta a aparecer, que é quando alguém retoma o
  // trabalho depois de um tempo longe.
  useEffect(() => {
    let vivo = true;

    async function conferir() {
      if (document.hidden) return;
      try {
        const r = await fetch('/api/admin-data?action=me', { headers: { 'x-admin-session': token } });
        if (!vivo) return;
        if (r.status === 401) { onLogout(); return; }
        // A ronda também traz a matriz. Duas coisas dependem disso: uma primeira
        // carga que falhou se conserta sozinha, e mudar a permissão de um papel
        // chega a quem está com a tela aberta em até um minuto, sem depender de
        // a pessoa recarregar.
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        if (vivo && d) {
          setUsuario(d.usuario ?? null);
          setPermissoes(d.permissoes ?? '*');
        }
      } catch {
        // Rede fora não é sessão perdida: deixa para a próxima volta.
      }
    }

    const relogio = setInterval(() => void conferir(), 60_000);
    const aoMostrar = () => { if (!document.hidden) void conferir(); };
    document.addEventListener('visibilitychange', aoMostrar);
    return () => {
      vivo = false;
      clearInterval(relogio);
      document.removeEventListener('visibilitychange', aoMostrar);
    };
  }, [token]);

  const pode = useMemo(() => criarPode(permissoes), [permissoes]);

  // A página de Usuários não entra na matriz: a trava dela é o papel, conferido
  // no servidor. O master abre para ler; mexer continua sendo do administrador
  // do sistema. Ver `PAGINAS_SO_ADMIN`.
  const veUsuarios = podeVerUsuarios(usuario);
  const paginaLiberada = useCallback(
    (p: Page) => podeAbrirPagina(pode, p, veUsuarios),
    [pode, veUsuarios],
  );

  // Quando as permissões chegam e a página aberta não é alcançável, vai para a
  // primeira que é - em vez de deixar a pessoa parada num "sem acesso" que ela
  // não escolheu. É o que cobre quem não tem o Dashboard, onde a tela abre.
  useEffect(() => {
    if (permissoes === null) return;
    if (paginaLiberada(page)) return;
    const primeira = (Object.keys(PERMISSAO_DA_PAGINA) as Page[]).find(paginaLiberada);
    setPage(primeira ?? 'perfil');
  }, [permissoes, paginaLiberada, page]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Portal Sheep';
    return () => { document.title = prev; };
  }, []);

  // Deep link: ?oportunidade=<id> abre direto o card da oportunidade (link compartilhável).
  // Lê uma vez na montagem (após o login, a URL é preservada) e limpa a query para não reabrir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // `?lead=` continua valendo: a seção mudou de nome, e os links que já foram
    // mandados por aí não mudaram junto.
    const sid = params.get('oportunidade') ?? params.get('lead');
    if (sid) {
      setPage('oportunidades');
      setOpenCard({ page: 'oportunidades', id: sid, nonce: 1 });
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      return;
    }
    // `?tarefa=<id>` abre a gaveta da tarefa, pelo mesmo caminho da busca
    // rápida e do inbox: a tela de Tarefas guarda o alvo e abre quando a
    // listagem chega.
    const tid = params.get('tarefa');
    if (tid) {
      setPage('tarefas');
      setOpenCard({ page: 'tarefas', id: tid, nonce: 1 });
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      return;
    }
    // `?projeto=` só troca de página: quem abre o card é a própria tela de
    // Projetos, que precisa da lista carregada para achar o projeto.
    if (params.get('projeto')) setPage('projetos');
  }, []);

  // Desktop = sidebar fixa (pinned). Só reage quando CRUZA o limiar desktop↔mobile;
  // resize/zoom que não muda de faixa não mexe no sidebar (senão ele reabria a cada
  // zoom e o layout piscava). A escolha manual do usuário é preservada na mesma faixa.
  useEffect(() => {
    let faixaAnterior: boolean | null = null;
    function check() {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop === faixaAnterior) return;
      const primeira = faixaAnterior === null;
      faixaAnterior = isDesktop;
      setPinned(isDesktop);
      // Carga inicial: abre no desktop, fecha no mobile. Ao virar mobile: fecha o
      // overlay. Ao VOLTAR pro desktop: preserva a escolha do usuário (não reabre
      // um sidebar que ele tinha recolhido - o zoom não deve expandir de novo).
      // No computador o menu nasce no trilho de icones, a menos que a pessoa o
      // tenha fixado aberto - essa escolha fica guardada no navegador.
      if (primeira) setOpen(isDesktop && lerMenuFixo());
      else if (!isDesktop) setOpen(false);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Ctrl/⌘ + K abre a busca rápida de qualquer página
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setQuickOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Alvo da busca rápida: página ou ferramenta só troca de tela; card também pede
  // à página destino que abra o detalhe.
  function irPara(t: QuickTarget) {
    setQuickOpen(false);
    setPage(t.page);
    if (t.kind === 'card') {
      setOpenCard(prev => ({ page: t.page, id: t.id, nonce: (prev?.nonce ?? 0) + 1 }));
    }
  }

  const toast = useCallback((type: ToastItem['type'], title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, title, message }]);
  }, []);

  function dismiss(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  function toggle() {
    setOpen(v => !v);
  }

  return (
    <AuthContext.Provider value={{ onSessionExpired: onLogout, usuario, pode }}>
    <ToastContext.Provider value={{ toast }}>
    {/* Dentro do provedor de toast, porque e ele quem confirma o fim de cada
        atividade; e por fora das paginas, porque o trabalho tem de sobreviver a
        fechar a gaveta que o comecou e a trocar de pagina. */}
    <ProvedorAtividades navegar={p => setPage(p as Page)}>
    <TrilhaContext.Provider value={{ degrau, definir: definirDegrau }}>
      {/* A casca e o ambiente - o fundo e o brilho que deriva -, e a janela e a
          peca de vidro que pousa sobre ele, com o menu, o topo e a pagina
          dentro. No celular a janela ocupa a tela toda, sem moldura. */}
      <div className={`admin-casca${saindo ? ' tela-sai' : ''}`}>
      <FundoDeOndas />
      <div className={`casca-janela${pinned ? ' menu-preso' : ''}`} style={{
        display: 'grid',
        // Duas colunas no desktop: o menu à esquerda e a página. O menu vai do
        // trilho à largura inteira, e a transição anima a troca.
        gridTemplateColumns: pinned
          ? `${open ? `${LARGURA_DO_MENU}px` : `${LARGURA_DO_TRILHO}px`} minmax(0, 1fr)`
          : '1fr',
        // Preso, nao ha faixa de topo: a busca mora no menu e a pagina sobe
        // ate o alto da janela. Solto (celular), o topo guarda o menu e a marca.
        gridTemplateRows: pinned ? 'minmax(0, 1fr)' : '64px minmax(0, 1fr)',
        height: '100%',
        overflow: 'clip',
        transition: 'grid-template-columns 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {!pinned && <Topbar
          coluna="1 / -1"
          mostrarMarca={!pinned}
          mostrarMenu={!pinned}
          onToggle={toggle}
          onLogout={onLogout}
          onQuickSearch={() => setQuickOpen(true)}
          usuario={usuario}
          onAbrirPerfil={() => setPage('perfil')}
          onIrInicio={() => setPage('dashboard')}
          inbox={null}
        />}

        {/* Overlay backdrop (mobile / overlay mode) */}
        {open && !pinned && (
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 290,
              background: 'rgba(18,19,22,0.35)',
              animation: 'fadeIn .2s ease both',
            }}
          />
        )}

        <Sidebar
          page={page}
          setPage={setPage}
          open={open}
          pinned={pinned}
          onClose={() => setOpen(false)}
          onAlternarFixo={() => setOpen(v => { gravarMenuFixo(!v); return !v; })}
          projetosDoMenu={projetosDoMenu}
          contagens={contagens}
          onQuickSearch={() => setQuickOpen(true)}
          onAbrirPerfil={() => setPage('perfil')}
          portas={(
            <>
              <Inbox noMenu listar={listarInbox} marcarLido={marcarInboxLido} limpar={limparInbox}
                vincularReuniao={vincularReuniaoDoInbox} onIr={irPeloInbox} />
            </>
          )}
          onAbrirProjeto={id => {
            setPage('projetos');
            setOpenCard({ page: 'projetos', id, nonce: Date.now() });
          }}
          onLogout={onLogout}
        />

        <NavInferior page={page} setPage={setPage} onMais={() => setOpen(true)} />

        {/* Coluna flexível, e não bloco com rolagem própria. O `.admin-content-wrap`
            já se declara `flex: 1; overflow: auto`, mas isso só vale se o pai
            for um flex: como bloco, o wrap crescia com o conteúdo, nunca
            rolava, e quem rolava era o `main`. O efeito colateral era um
            `position: sticky` lá dentro preso a um scrollport parado - o índice
            do relatório escapava ao rolar. */}
        <main style={{
          gridColumn: pinned ? 2 : 1,
          gridRow: pinned ? 1 : 2,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          // Transparente: o fundo e o brilho que deriva moram na casca, e a
          // pagina passa por cima deles em vez de tampar.
          background: 'transparent',
          minHeight: 0,
        }}>
          {TOOL_PAGES.includes(paginaNaTela) && (
            // A trilha troca junto com o conteúdo, e não com o clique: ela é o
            // rótulo do que está na tela. Como a mesma área muda de texto sem
            // mudar de lugar, ela entra em opacidade - `.troca`, com a chave do
            // caminho para a animação tocar de novo a cada mudança.
            <nav aria-label="breadcrumb" className="trilha troca"
              key={`${paginaNaTela}/${degrau?.label ?? ''}`}>
              <button className="trilha-degrau" onClick={() => setPage('ferramentas')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ferramentas
              </button>
              <span className="trilha-barra">/</span>
              {/* Com um terceiro degrau, o nome da ferramenta deixa de ser texto
                  e vira o caminho de volta - é ele que fecha o que a página
                  abriu por dentro. */}
              {degrau ? (
                <>
                  <button className="trilha-degrau" onClick={degrau.onVoltar}>{TOOL_LABELS[paginaNaTela]}</button>
                  <span className="trilha-barra">/</span>
                  <span className="trilha-aqui">{degrau.label}</span>
                </>
              ) : (
                <span className="trilha-aqui">{TOOL_LABELS[paginaNaTela]}</span>
              )}
            </nav>
          )}
          {/* Última porta antes do conteúdo. O redirecionamento acima já tira a
              pessoa de uma página que ela não alcança; isto cobre o resto:
              deep link, ⌘K com cache velho, permissão revogada com a tela
              aberta. Cada página também é trancada no servidor. */}
          {/* Enquanto as permissões não chegam, esqueleto - e não a página.
              É o que substitui o antigo "na dúvida pode": a tela não pisca cheia
              e também não oferece nada que o servidor vá recusar. */}
          {/* A chave é o nível: é ela que remonta o bloco e faz a entrada
              tocar. Sem ela a classe mudaria e a animação não rodaria de novo. */}
          <div className={`nivel ${nivel.classe}`} key={paginaNaTela}>
          {permissoes === null ? (
            <SkeletonPagina />
          ) : !paginaLiberada(paginaNaTela) ? (
            <SemAcesso />
          ) : (
          // Esqueleto, e não giro: ele já ocupa o formato da página que vem,
          // então a troca de tela não pisca de vazio para cheio.
          <Suspense fallback={<SkeletonPagina />}>
            {paginaNaTela === 'projetos'      && (
              <ProjetosPage
                token={token}
                abrir={openCard?.page === 'projetos' ? openCard : undefined}
                onAbriu={() => { setOpenCard(null); avisarFichaAberta(); }}
                // O card clicado na folha do Funil da Planning abre no Funil, que é
                // onde ele se mexe - o mesmo caminho da busca rápida.
                onAbrirOportunidade={(id: string) => {
                  setPage('oportunidades');
                  setOpenCard({ page: 'oportunidades', id, nonce: Date.now() });
                }}
                onVerTarefasDaEntrega={(projeto: string, entrega: number) => {
                  setTarefasDaEntrega({ projeto, entrega, nonce: Date.now() });
                  setPage('tarefas');
                }}
              />
            )}
            {paginaNaTela === 'tarefas'       && (
              <TarefasPage
                token={token}
                filtroInicial={tarefasDaEntrega ?? undefined}
                onFiltroAplicado={() => setTarefasDaEntrega(null)}
                abrir={openCard?.page === 'tarefas' ? openCard : undefined}
                onAbriu={() => setOpenCard(null)}
                criar={criarTarefa ?? undefined}
                onCriou={() => setCriarTarefa(null)}
              />
            )}
            {paginaNaTela === 'dashboard'     && (
              <DashboardPage token={token} onIr={p => setPage(p)}
                onNovaTarefa={pode('tarefas:editar') ? () => {
                  setCriarTarefa(Date.now());
                  setPage('tarefas');
                } : undefined} />
            )}
            {paginaNaTela === 'oportunidades'  && <OportunidadesPage  token={token} openCard={openCard?.page === 'oportunidades' ? openCard : undefined} onCardOpened={() => setOpenCard(null)} />}
            {paginaNaTela === 'configuracoes' && <ConfiguracoesPage token={token} />}
            {paginaNaTela === 'ferramentas'   && <FerramentasPage token={token} onNavigate={p => setPage(p as Page)} />}
            {paginaNaTela === 'gerador-documentos' && <GeradorContratos token={token} />}
            {paginaNaTela === 'gerador-propostas' && (
              <GeradorPropostas token={token}
                // A proposta vive presa a um lead: o histórico leva até ele no Funil.
                onAbrirOportunidade={pode('oportunidades:ver') ? (id: string) => {
                  setPage('oportunidades');
                  setOpenCard({ page: 'oportunidades', id, nonce: Date.now() });
                } : undefined} />
            )}
            {paginaNaTela === 'cofre' && <CofreSenhas token={token} />}
            {paginaNaTela === 'talentos'      && <TalentosPage      token={token}
              abrir={openCard?.page === 'talentos' ? openCard : undefined} />}
            {paginaNaTela === 'perfil'        && <PerfilPage token={token} />}
            {paginaNaTela === 'usuarios'      && <UsuariosPage   token={token} />}
          </Suspense>
          )}
          </div>
        </main>

      </div>
      </div>

      {/* Reportar mora no canto inferior direito, por cima de qualquer tela: um
          circulo que se abre em Reportar e Chamados. O nome da pagina vai junto
          para quem le o e-mail saber de onde veio o relato. O inbox pede a fila
          por `abrirFila`, dizendo qual chamado deve nascer aberto. */}
      <CartaoReportar
        flutuante
        pagina={DESTINOS.find(d => d.page === page)?.titulo ?? page}
        enviar={reportar}
        listar={listarReportes}
        carregarPrint={printDoReporte}
        mudarStatus={mudarStatusDoReporte}
        mudarTipo={mudarTipoDoReporte}
        editar={editarReporte}
        excluir={excluirReporte}
        reabrir={reabrirReporte}
        admin={podeGerenciarUsuarios(usuario)}
        abrirFila={filaDeChamados}
        onAbriuFila={() => setFilaDeChamados(null)}
      />

      {quickOpen && (
        <Suspense fallback={null}>
          <QuickSearch token={token} onClose={() => setQuickOpen(false)} onSelect={irPara} />
        </Suspense>
      )}

      <ToastContainer items={toasts} onDismiss={dismiss} />
    </TrilhaContext.Provider>
    </ProvedorAtividades>
    </ToastContext.Provider>
    </AuthContext.Provider>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
// Computed once at module load - reads URL params before any history.replaceState clears them
const _urlState = (() => {
  const p = new URLSearchParams(window.location.search);
  const urlToken = p.get('session');
  if (urlToken) {
    const clean = new URL(window.location.href);
    clean.searchParams.delete('session');
    history.replaceState(null, '', clean.toString());
  }
  return { urlToken };
})();

/** A tela de conectar do MCP. Lido uma vez: nada no portal navega para cá. */
const CONECTANDO_MCP = window.location.pathname.replace(/\/+$/, '') === '/mcp/conectar';

/** Duração da saída de tela. Espelhada em .tela-sai, no main.css. */
const SAIDA_MS = 300;

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => {
    if (_urlState.urlToken) {
      localStorage.setItem(SESSION_KEY, _urlState.urlToken);
      return _urlState.urlToken;
    }
    return localStorage.getItem(SESSION_KEY);
  });

  // Troca de tela em duas etapas: quem sai roda a animação de saída e só então
  // a outra monta, com a sua de entrada. Sem isso o corte é seco.
  const [saindo, setSaindo] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (relogio.current) clearTimeout(relogio.current); }, []);

  function trocarTela(aplicar: () => void) {
    if (relogio.current) return; // troca já em curso: ignora clique repetido
    setSaindo(true);
    relogio.current = setTimeout(() => {
      relogio.current = null;
      aplicar();
      setSaindo(false);
    }, SAIDA_MS);
  }

  function logout() {
    const t = token;
    localStorage.removeItem(SESSION_KEY);
    // Solta a conta escolhida no GIS. Hoje o botão não usa auto_select, mas o
    // Google guarda a escolha para a próxima visita: sair tem que apagar isso,
    // senão a sessão seguinte volta com a mesma conta sem perguntar.
    window.google?.accounts.id.disableAutoSelect();
    // A sessão morre no servidor já; só a troca visual espera a animação.
    if (t) {
      fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': t },
        body: JSON.stringify({ action: 'logout' }),
      }).catch(() => {});
    }
    trocarTela(() => setToken(null));
  }

  if (!token) return <LoginScreen onLogin={t => trocarTela(() => setToken(t))} saindo={saindo} />;
  // O consentimento do MCP ocupa a tela inteira, no lugar do portal: quem chega
  // aqui veio de um aplicativo de IA e volta para ele. Sem sessão, a entrada de
  // cima aparece primeiro e o endereço continua este.
  if (CONECTANDO_MCP) {
    return (
      <Suspense fallback={<div className="mcp-conectar"><div className="dux-spinner-row"><span className="dux-spinner sm" /></div></div>}>
        <ConectarMcp token={token} onSessaoExpirada={logout} />
      </Suspense>
    );
  }
  return <MainApp token={token} onLogout={logout} saindo={saindo} />;
}
