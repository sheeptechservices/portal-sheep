import { useState, useEffect, useRef, createContext, useContext, useCallback, useMemo, lazy, Suspense, useSyncExternalStore } from 'react';
import { IconAcessos, IconAlert, IconArrowRight, IconDashboard, IconGoogle, IconSpinner } from '../components/icons';
import {
  criarPode, podeAbrirPagina, podeGerenciarUsuarios, PERMISSAO_DA_PAGINA,
  type Permissoes, type Pode,
} from './papeis';
import { createPortal, flushSync } from 'react-dom';
import { lojaTema, comRevelacao, type Tema } from '../lib/tema';
import { MARCAS } from '../lib/marcas';
import { SkeletonPagina } from '../components/Skeleton';
import { GOOGLE_CLIENT_ID, GOOGLE_DOMINIO, carregarGis } from '../lib/google';
// Cada página é carregada sob demanda (code-splitting) - só entra no bundle quando aberta
const LeadsPage = lazy(() => import('./LeadsPage'));
const ProjetosPage = lazy(() => import('./ProjetosPage'));
const TarefasPage = lazy(() => import('./TarefasPage'));
const ConfiguracoesPage = lazy(() => import('./ConfiguracoesPage'));
const CadastrosPage = lazy(() => import('./CadastrosPage'));
const FerramentasPage = lazy(() => import('./FerramentasPage'));
const GeradorDocumentosPage = lazy(() => import('./GeradorDocumentosPage'));
const PerfilPage = lazy(() => import('./PerfilPage'));
const UsuariosPage = lazy(() => import('./UsuariosPage'));
const QuickSearch = lazy(() => import('./QuickSearch'));
import type { QuickTarget } from './QuickSearch';
import { TOOL_PAGES, TOOL_LABELS, type Page } from './destinos';

// ── Toast system ─────────────────────────────────────────────────────────────
interface ToastItem { id: string; type: 'success' | 'error' | 'info'; title: string; message?: string }
interface ToastCtx { toast: (type: ToastItem['type'], title: string, message?: string) => void }
const ToastContext = createContext<ToastCtx>({ toast: () => {} });
export function useToast() { return useContext(ToastContext); }

// ── Auth context ──────────────────────────────────────────────────────────────
/** Quem está logado. Nulo quando a sessão veio da senha compartilhada. */
export interface UsuarioSessao {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  papel: string;
}
interface AuthCtx {
  onSessionExpired: () => void;
  usuario: UsuarioSessao | null;
  /** Teste de permissão da sessão. Ver `criarPode` - responde `true` enquanto o
   *  `me` não voltou, para o menu não piscar cheio e esvaziar. */
  pode: Pode;
}
const AuthContext = createContext<AuthCtx>({
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

const TOAST_ACCENT: Record<ToastItem['type'], string> = {
  success: '#16A34A',
  error:   '#D93025',
  info:    '#2563EB',
};

function ToastIcon({ type, color }: { type: ToastItem['type']; color: string }) {
  if (type === 'success') return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  if (type === 'error') return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4L4 12" stroke={color} strokeWidth={2} strokeLinecap="round"/>
    </svg>
  );
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none">
      <path d="M8 7v5M8 5.5v.01" stroke={color} strokeWidth={2} strokeLinecap="round"/>
    </svg>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [exiting, setExiting] = useState(false);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accent = TOAST_ACCENT[item.type];

  function leave() {
    setExiting(true);
    setTimeout(() => onDismiss(item.id), 320);
  }

  useEffect(() => {
    if (hovered) { if (timerRef.current) clearTimeout(timerRef.current); return; }
    timerRef.current = setTimeout(leave, 4000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [hovered]);

  const border = accent + '40';
  const shadow = `0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px ${border}`;
  const shadowHov = `0 12px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px ${border}`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        width: 320, padding: '12px 12px 12px 13px',
        background: accent + '18',
        borderRadius: 14,
        border: `1px solid ${border}`,
        borderLeft: `3.5px solid ${accent}`,
        boxShadow: hovered ? shadowHov : shadow,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        animation: exiting
          ? 'toastOut 0.32s cubic-bezier(0.4,0,1,1) both'
          : 'toastIn 0.38s cubic-bezier(0.34,1.1,0.64,1) both',
        transition: 'box-shadow 0.2s ease',
        cursor: 'default',
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 1, display: 'flex', alignItems: 'center' }}>
        <ToastIcon type={item.type} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: accent, lineHeight: 1.3 }}>{item.title}</p>
        {item.message && <p style={{ fontSize: 11.5, color: '#64748B', marginTop: 2, lineHeight: 1.45 }}>{item.message}</p>}
      </div>
      <button
        onClick={leave}
        style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', opacity: 0.7, transition: 'opacity 0.15s', marginTop: 1 }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}
      >
        <svg width={8} height={8} viewBox="0 0 9 9" fill="none">
          <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

function ToastContainer({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: string) => void }) {
  if (!items.length) return null;
  return createPortal(
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', pointerEvents: 'none' }}>
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
type NavLeaf = { page?: Page; perm?: string; label: string; icon: JSX.Element; disabled?: boolean };
const NAV_SECTIONS: { section: string; items: NavLeaf[] }[] = [
  // Grupo sem título: fica solto no topo, antes das seções nomeadas.
  {
    section: '',
    items: [
      {
        label: 'Dashboard',
        perm: 'dashboard:ver',
        disabled: true,
        icon: <IconDashboard size={15} />,
      },
      // Onboarding, Leads e Operações ficavam sob o título "Esteira de
      // Crédito". O título saiu e os itens vieram para cá, e não para um grupo
      // próprio sem rótulo: a lista é montada com `key={group.section}`, então
      // dois grupos de título vazio colidiriam na mesma chave.
      {
        page: 'leads',
        label: 'Funil',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        page: 'projetos',
        label: 'Projetos',
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
    section: 'GERAL',
    items: [
      {
        page: 'ferramentas',
        label: 'Ferramentas',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      {
        page: 'cadastros',
        label: 'Cadastros',
        icon: (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ),
      },
      {
        page: 'configuracoes',
        label: 'Configurações',
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
        icon: <IconAcessos size={15} />,
      },
    ],
  },
];

// Atalho da busca rápida - ⌘K no Mac, Ctrl+K no resto.
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const QS_HINT = IS_MAC ? '⌘K' : 'Ctrl K';

// ── Topbar ────────────────────────────────────────────────────────────────────
// Switch de tema (sol/lua): um botão só - clicar em qualquer ponto dele vai para
// o outro tema, com a revelação circular a partir do ponto do clique. Quem se
// move é o pino, que corre entre os dois lados; os ícones ficam parados.
function ThemeToggle() {
  const tema = useSyncExternalStore(lojaTema.assinar, lojaTema.agora, lojaTema.servidor);
  const escuro = tema === 'escuro';

  const alternar = (ev: React.MouseEvent) => {
    const alvo: Tema = escuro ? 'claro' : 'escuro';
    // Sem coordenadas (acionado pelo teclado) a revelação nasce do centro da tela.
    const origem = (ev.clientX || ev.clientY) ? { x: ev.clientX, y: ev.clientY } : null;
    comRevelacao(origem, () => flushSync(() => lojaTema.definir(alvo)));
  };

  return (
    <button
      type="button"
      className="theme-seg"
      data-tema={tema}
      onClick={alternar}
      role="switch"
      aria-checked={escuro}
      aria-label="Modo escuro"
      title={escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
    >
      {/* Pino que corre por baixo dos dois ícones - é ele que dá o movimento. */}
      <span className="theme-seg-thumb" aria-hidden="true" />
      <span className={`theme-seg-opt${!escuro ? ' on' : ''}`} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="4" fill="currentColor" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
            <rect key={a} x="11.25" y="1.5" width="1.5" height="3.2" rx="0.75" fill="currentColor" transform={`rotate(${a} 12 12)`} />
          ))}
        </svg>
      </span>
      <span className={`theme-seg-opt${escuro ? ' on' : ''}`} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M20 14.5A8 8 0 019.5 4a7 7 0 100 16 8 8 0 0010.5-5.5z" fill="currentColor" />
        </svg>
      </span>
    </button>
  );
}

function Topbar({ onToggle, onLogout, onQuickSearch, usuario, onAbrirPerfil }: {
  onToggle: () => void; onLogout: () => void; onQuickSearch: () => void; usuario: UsuarioSessao | null;
  onAbrirPerfil: () => void;
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
    <header style={{
      gridColumn: '1 / -1',
      background: 'var(--white)',
      borderBottom: '1px solid var(--gray3)',
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 300,
      height: 60,
      flexShrink: 0,
    }}>
      {/* Left: toggle + brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onToggle}
          title="Alternar sidebar"
          style={{
            width: 30, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'transparent', color: 'var(--gray2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background .15s, color .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; e.currentTarget.style.color = 'var(--black)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gray2)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <line x1="2" y1="4" x2="14" y2="4"/>
            <line x1="2" y1="8" x2="14" y2="8"/>
            <line x1="2" y1="12" x2="14" y2="12"/>
          </svg>
        </button>

        {/* Brand badge */}
        <div style={{
          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <img src="/favicon.png" alt="Sheep Technology" className="brand-logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        {/* Brand text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div className="topbar-marca-nome"
            style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)', lineHeight: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Portal Sheep
          </div>
          <div className="topbar-marca-sub"
            style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 500, lineHeight: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Gestão geral dos projetos
          </div>
        </div>
      </div>

      {/* Busca rápida: centralizada na tela grande, item da própria linha no
          celular - em posição absoluta ela caía por cima do nome do portal. */}
      <div className="topbar-busca"
        style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
        <button type="button" className="qs-trigger" onClick={onQuickSearch} title="Busca rápida (Ctrl+K)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <span className="qs-trigger-label">Buscar</span>
          <span className="qs-trigger-kbd">{QS_HINT}</span>
        </button>
      </div>

      {/* Right: avatar (o switch de tema vive no rodapé da sidebar) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div ref={avatarRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          title={usuario ? `${usuario.nome} (${usuario.email})` : 'Acesso compartilhado'}
          aria-label={usuario ? `Conta de ${usuario.nome}` : 'Conta'}
          className="topbar-conta"
        >
          {/* Identidade ao lado da foto. Some no mobile, onde o cabeçalho não
              comporta - o avatar continua abrindo o mesmo menu. */}
          <span className="topbar-conta-texto">
            <span className="topbar-conta-nome">{usuario ? usuario.nome : 'Acesso compartilhado'}</span>
            <span className="topbar-conta-email">{usuario ? usuario.email : 'Entrada por senha'}</span>
          </span>
          <span className="topbar-conta-avatar">
            {usuario?.foto_url && !semFoto ? (
              <img
                src={usuario.foto_url}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setSemFoto(true)}
              />
            ) : (
              <span>{usuario ? iniciais(usuario.nome) : 'D'}</span>
            )}
          </span>
        </button>

        {menuOpen && createPortal(
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setMenuOpen(false)} />
            <div style={{
              position: 'fixed', top: 56, right: 16,
              background: 'var(--white)', border: '1px solid var(--gray3)',
              borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 9999, minWidth: 180, overflow: 'hidden',
              animation: 'panelUp .18s ease both',
            }}>
              {/* Nome e e-mail agora vivem no cabeçalho. Aqui sobra só o aviso
                  de quem entrou pela senha, que o topo não tem espaço para dar. */}
              {!usuario && (
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray3)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--gray2)', lineHeight: 1.5 }}>
                    Entrada por senha compartilhada - as ações não ficam no seu nome.
                  </div>
                </div>
              )}
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => { setMenuOpen(false); onAbrirPerfil(); }}
                className="conta-menu-item"
              >
                Perfil
              </button>

              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={onLogout}
                style={{
                  width: '100%', padding: '9px 14px', fontSize: 13, fontWeight: 600,
                  color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left', transition: 'background .2s', fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(217,48,37,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                Sair
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
      </div>
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
  const admin = podeGerenciarUsuarios(usuario);

  // A ordem é a da sidebar, filtrada pelo que a pessoa alcança: sem isso a
  // barra ofereceria uma tela que devolve "sem acesso".
  const candidatos = NAV_SECTIONS
    .flatMap(g => g.items)
    .filter(i => i.page && !i.disabled && podeAbrirPagina(pode, i.page, admin));

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
  page, setPage, open, pinned, onClose,
}: {
  page: Page; setPage: (p: Page) => void; open: boolean; pinned: boolean; onClose: () => void;
}) {
  const sidebarStyle: React.CSSProperties = pinned
    ? {
        background: 'var(--white)',
        borderRight: open ? '1px solid var(--gray3)' : '1px solid transparent',
        overflow: 'hidden',
        // Ocupa a largura da coluna do grid (220px -> 0px), sem largura fixa
        // própria: assim o fundo e o recorte encolhem junto com a coluna, em vez
        // de a largura fixa vazar por cima do conteúdo enquanto recolhe.
        width: '100%',
        minWidth: 0,
        height: '100%',
        // Some suave junto com o recolher; ao fechar, a visibilidade só cai
        // depois do fade (a11y), ao abrir volta na hora.
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        transition: open
          ? 'opacity 0.2s cubic-bezier(0.4,0,0.2,1), border-color 0.2s ease'
          : 'opacity 0.2s cubic-bezier(0.4,0,0.2,1), border-color 0.2s ease, visibility 0s linear 0.2s',
        pointerEvents: open ? 'auto' : 'none',
      }
    : {
        background: 'var(--white)',
        borderRight: '1px solid var(--gray3)',
        overflow: 'hidden',
        width: 220,
        flexShrink: 0,
        position: 'fixed',
        left: 0,
        top: 60,
        height: 'calc(100vh - 60px)',
        zIndex: 300,
        boxShadow: '4px 0 20px rgba(0,0,0,0.12)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      };

  // Conteúdo com largura fixa: enquanto a coluna encolhe, o texto é recortado
  // pelo <aside> (overflow:hidden) em vez de requebrar de linha.
  const innerStyle: React.CSSProperties = {
    width: 220,
    minWidth: 220,
    height: '100%',
    padding: '20px 0',
    display: 'flex',
    flexDirection: 'column',
  };

  // Menu de quem está olhando: página que a pessoa não alcança não aparece, e
  // uma seção que fique sem item nenhum não deixa o título órfão. Esconder é
  // cortesia - a trava é o servidor, em cada ação.
  const { pode, usuario } = useAuth();
  const admin = podeGerenciarUsuarios(usuario);
  const secoes = NAV_SECTIONS
    .map(g => ({
      ...g,
      items: g.items.filter(i =>
        (!i.page || podeAbrirPagina(pode, i.page, admin)) && (!i.perm || pode(i.perm))),
    }))
    .filter(g => g.items.length > 0);

  const renderLeaf = (item: NavLeaf) => {
    const active = !!item.page && (page === item.page || (item.page === 'ferramentas' && TOOL_PAGES.includes(page)));
    const disabled = !!item.disabled;
    return (
      <button
        key={item.label}
        type="button"
        className="nav-leaf"
        disabled={disabled}
        title={disabled ? 'Em breve' : undefined}
        onClick={() => { if (disabled || !item.page) return; setPage(item.page); if (!pinned) onClose(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', padding: '9px 20px',
          fontSize: 13, fontWeight: 600,
          color: disabled ? 'var(--gray2)' : active ? 'var(--black)' : 'var(--gray)',
          border: 'none', borderLeft: `2px solid ${active ? 'var(--yellow)' : 'transparent'}`,
          background: active ? 'var(--yd)' : 'transparent',
          cursor: disabled ? 'default' : 'pointer', textAlign: 'left',
          opacity: disabled ? 0.55 : 1,
          transition: 'all .2s', fontFamily: 'inherit',
        }}
        onMouseEnter={e => { if (!active && !disabled) { e.currentTarget.style.color = 'var(--black)'; e.currentTarget.style.background = 'var(--bg)'; } }}
        onMouseLeave={e => { if (!active && !disabled) { e.currentTarget.style.color = 'var(--gray)'; e.currentTarget.style.background = 'transparent'; } }}
      >
        <span className="nav-leaf-ico" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{item.icon}</span>
        <span style={{ flex: 1 }}>{item.label}</span>
        {disabled && (
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)', background: 'var(--gray3)', padding: '2px 6px', borderRadius: 999 }}>
            em breve
          </span>
        )}
      </button>
    );
  };

  return (
    <aside style={sidebarStyle}>
      <div style={innerStyle}>
      {/* A navegação rola; o rodapé de Aparência fica preso embaixo. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      {secoes.map(group => (
        <div key={group.section || 'topo'}>
          {group.section && (
            <div style={{
              fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '0.12em', color: 'var(--gray2)',
              padding: '0 20px', margin: '16px 0 6px',
            }}>
              {group.section}
            </div>
          )}

          {group.items.map(item => renderLeaf(item))}
        </div>
      ))}
      </div>

      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--gray3)',
        margin: '12px 0 0',
        padding: '14px 20px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}>Tema</span>
        <ThemeToggle />
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
 * `prompt: ''` é o que torna isso indolor: a tela de autorização do Google
 * aparece quando é necessária, na prática só no primeiro acesso, e as entradas
 * seguintes passam direto. Foi a ausência dele - o padrão reapresenta a tela
 * toda vez - que fez a foto sair do login numa versão anterior.
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
          // Sem isto o Google reapresenta a confirmação a cada entrada, que foi o
          // motivo de a foto ter saído do login um dia. Com `''`, a tela aparece
          // no primeiro acesso e as entradas seguintes passam direto.
          prompt: '',
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

// A conta Google é o único caminho de entrada. A senha compartilhada foi
// removida em 28/08/2026: era uma porta anônima num sistema cuja auditoria
// pressupõe identidade, e o valor dela era adivinhável. Não há plano B por
// decisão consciente - se o Google estiver fora, o painel fica fora.
function LoginScreen({ onLogin, saindo }: { onLogin: (token: string) => void; saindo: boolean }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
    setLoading(true);
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
      setLoading(false);
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
              <BotaoGoogle onCodigo={entrarComGoogle} entrando={loading} />
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

// Shader das ondas, porte fiel do template: deforma o plano com uma soma de
// senos e cossenos realimentada e tira dali o brilho e a banda em teal.
const FRAG_ONDAS = `
precision highp float;
uniform vec2 u_res; uniform float u_time; uniform float u_speed; uniform float u_warm;
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*u_res) / min(u_res.x, u_res.y);
  float t = u_time * u_speed;
  vec2 q = uv * 1.6;
  for (float i = 1.; i < 7.; i++) {
    q.x += (0.42/i) * sin(i*2.1*q.y + t + i*1.7) ;
    q.y += (0.46/i) * cos(i*1.6*q.x + t*1.13 + i*0.8);
  }
  float v = sin(q.x*1.2 + q.y*1.1 + t*0.3);
  float s = 0.5 + 0.5*v;
  float sheen = pow(s, 6.0);
  float mid = pow(s, 2.2);
  float gold = pow(0.5 + 0.5*sin(q.x*0.9 - q.y*1.3 + t*0.5), 3.0);
  vec3 base = vec3(0.016, 0.018, 0.026);
  vec3 midC = mix(vec3(0.020, 0.080, 0.068), vec3(0.035, 0.150, 0.125), gold*u_warm);
  vec3 hi   = mix(vec3(0.10, 0.82, 0.68), vec3(0.25, 0.92, 0.80), gold*u_warm);
  vec3 col = base + midC*mid + hi*sheen*0.85;
  col += vec3(0.05, 0.72, 0.60) * gold * mid * sheen * 0.5 * u_warm;
  float vig = smoothstep(1.45, 0.35, length(uv));
  col *= 0.55 + 0.45*vig;
  gl_FragColor = vec4(col, 1.0);
}`;
const VERT_ONDAS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const ONDAS_VELOCIDADE = 0.28;
const ONDAS_DOURADO = 1.0;
// Período exato do shader. Todos os termos que dependem do tempo lá em cima são
// t, 1.13t, 0.3t e 0.5t; a cada t = 200π os quatro completam voltas inteiras de
// 2π ao mesmo tempo, então reiniciar o relógio aí devolve exatamente a mesma
// imagem, sem salto. É o que impede o `float` do shader de perder precisão numa
// aba deixada aberta a noite toda - passadas algumas horas de segundos crus, o
// seno começa a se repetir em degraus e a onda empastela até parar de andar.
const ONDAS_PERIODO = (200 * Math.PI) / ONDAS_VELOCIDADE;

interface Ondas {
  parar(): void;
  /** Contexto perdido ou quadros travados: o vigia usa isto para remontar. */
  morto(): boolean;
}

/**
 * Ondas animadas em WebGL. Devolve null quando o contexto não pôde ser criado
 * - nesse caso o painel fica com o degradê do CSS, que sozinho já é um fundo
 * apresentável.
 */
function iniciarOndas(canvas: HTMLCanvasElement): Ondas | null {
  const gl = canvas.getContext('webgl', { antialias: true, powerPreference: 'low-power' });
  if (!gl || gl.isContextLost()) return null;

  const compilar = (tipo: number, fonte: string) => {
    const sh = gl.createShader(tipo)!;
    gl.shaderSource(sh, fonte);
    gl.compileShader(sh);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT_ONDAS));
  gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAG_ONDAS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  // Um triângulo só, maior que a tela: mais barato que dois para um fundo.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uTime = gl.getUniformLocation(prog, 'u_time');
  const uSpeed = gl.getUniformLocation(prog, 'u_speed');
  const uWarm = gl.getUniformLocation(prog, 'u_warm');

  const redimensionar = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  };
  window.addEventListener('resize', redimensionar);

  let raf = 0;
  let ultimoQuadro = performance.now();
  const inicio = ultimoQuadro;
  const quadro = () => {
    if (gl.isContextLost()) return;
    ultimoQuadro = performance.now();
    redimensionar();
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, ((ultimoQuadro - inicio) / 1000) % ONDAS_PERIODO);
    gl.uniform1f(uSpeed, ONDAS_VELOCIDADE);
    gl.uniform1f(uWarm, ONDAS_DOURADO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(quadro);
  };
  const perdeu = (e: Event) => { e.preventDefault(); cancelAnimationFrame(raf); };
  canvas.addEventListener('webglcontextlost', perdeu);
  quadro();

  return {
    parar() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', redimensionar);
      canvas.removeEventListener('webglcontextlost', perdeu);
      // Nada de WEBGL_lose_context aqui: um canvas com contexto perdido devolve
      // o MESMO contexto morto no getContext seguinte, e sob StrictMode (que
      // monta, limpa e remonta) as ondas nunca mais subiriam. Quem libera a GPU
      // é o navegador, quando o elemento é coletado.
    },
    morto: () => gl.isContextLost() || performance.now() - ultimoQuadro > 3000,
  };
}

/**
 * Espera antes de tentar montar as ondas de novo, por falhas seguidas (ms). A
 * última se repete para sempre: a tela nunca desiste de vez do WebGL, só passa
 * a insistir devagar. Enquanto o canvas está fora do ar quem segura o
 * movimento é o degradê animado do CSS, então o palco nunca fica parado.
 */
const ONDAS_ESPERAS = [1500, 5000, 20000, 60000];

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
interface NewCedente { cnpj: string; razao_social: string; natureza_juridica?: string }

function MainApp({ token, onLogout, saindo, newCedente }: { token: string; onLogout: () => void; saindo: boolean; newCedente?: NewCedente }) {
  const [page, setPage] = useState<Page>(newCedente ? 'cadastros' : 'leads');
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  // Card a abrir na página destino. O nonce força o efeito a rodar de novo quando
  // o mesmo card é escolhido duas vezes; a página zera o pedido ao consumi-lo, para
  // não reabrir o detalhe quando o usuário voltar à página pelo menu.
  const [openCard, setOpenCard] = useState<{ page: Page; id: string; nonce: number } | null>(null);
  // Pedido vindo da tela de Projetos: abrir Tarefas já estreitada numa entrega.
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
  // A página de Usuários não entra na matriz: a trava dela é o e-mail do
  // administrador, conferido no servidor. Ver `PAGINAS_SO_ADMIN`.
  const admin = podeGerenciarUsuarios(usuario);
  const paginaLiberada = useCallback(
    (p: Page) => podeAbrirPagina(pode, p, admin),
    [pode, admin],
  );

  // A tela abre em Leads, que é o certo para quase todo mundo. Quando as
  // permissões chegam e a página aberta não é alcançável, vai para a primeira que
  // é - em vez de deixar a pessoa parada num "sem acesso" que ela não escolheu.
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

  // Deep link: ?lead=<id> abre direto o card do lead (link compartilhável).
  // Lê uma vez na montagem (após o login, a URL é preservada) e limpa a query para não reabrir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('lead');
    if (sid) {
      setPage('leads');
      setOpenCard({ page: 'leads', id: sid, nonce: 1 });
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
      if (primeira) setOpen(isDesktop);
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
      <div className={`admin-casca${saindo ? ' tela-sai' : ''}`} style={{
        display: 'grid',
        gridTemplateColumns: pinned ? (open ? '220px 1fr' : '0px 1fr') : '1fr',
        gridTemplateRows: '60px 1fr',
        height: '100vh',
        overflow: 'clip',
        transition: 'grid-template-columns 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <Topbar
          onToggle={toggle}
          onLogout={onLogout}
          onQuickSearch={() => setQuickOpen(true)}
          usuario={usuario}
          onAbrirPerfil={() => setPage('perfil')}
        />

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
        />

        <NavInferior page={page} setPage={setPage} onMais={() => setOpen(true)} />

        {/* Coluna flexível, e não bloco com rolagem própria. O `.admin-content-wrap`
            já se declara `flex: 1; overflow: auto`, mas isso só vale se o pai
            for um flex: como bloco, o wrap crescia com o conteúdo, nunca
            rolava, e quem rolava era o `main`. O efeito colateral era um
            `position: sticky` lá dentro preso a um scrollport parado - o índice
            do relatório escapava ao rolar. */}
        <main style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg)',
          minHeight: 0,
        }}>
          {TOOL_PAGES.includes(page) && (
            <nav aria-label="breadcrumb" style={{ padding: '18px 28px 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <button
                onClick={() => setPage('ferramentas')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gray)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, padding: 0, transition: 'color .15s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--black)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--gray)'; }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ferramentas
              </button>
              <span style={{ color: 'var(--gray2)' }}>/</span>
              <span style={{ color: 'var(--black)' }}>{TOOL_LABELS[page]}</span>
            </nav>
          )}
          {/* Última porta antes do conteúdo. O redirecionamento acima já tira a
              pessoa de uma página que ela não alcança; isto cobre o resto:
              deep link, ⌘K com cache velho, permissão revogada com a tela
              aberta. Cada página também é trancada no servidor. */}
          {/* Enquanto as permissões não chegam, esqueleto - e não a página.
              É o que substitui o antigo "na dúvida pode": a tela não pisca cheia
              e também não oferece nada que o servidor vá recusar. */}
          {permissoes === null ? (
            <SkeletonPagina />
          ) : !paginaLiberada(page) ? (
            <SemAcesso />
          ) : (
          // Esqueleto, e não giro: ele já ocupa o formato da página que vem,
          // então a troca de tela não pisca de vazio para cheio.
          <Suspense fallback={<SkeletonPagina />}>
            {page === 'projetos'      && (
              <ProjetosPage
                token={token}
                onVerTarefasDaEntrega={(projeto: string, entrega: number) => {
                  setTarefasDaEntrega({ projeto, entrega, nonce: Date.now() });
                  setPage('tarefas');
                }}
              />
            )}
            {page === 'tarefas'       && (
              <TarefasPage
                token={token}
                filtroInicial={tarefasDaEntrega ?? undefined}
                onFiltroAplicado={() => setTarefasDaEntrega(null)}
              />
            )}
            {page === 'leads'  && <LeadsPage  token={token} openCard={openCard?.page === 'leads' ? openCard : undefined} onCardOpened={() => setOpenCard(null)} />}
            {page === 'cadastros'     && <CadastrosPage     token={token} newCedente={newCedente} />}
            {page === 'configuracoes' && <ConfiguracoesPage token={token} />}
            {page === 'ferramentas'   && <FerramentasPage onNavigate={p => setPage(p as Page)} />}
            {page === 'gerador-documentos' && <GeradorDocumentosPage token={token} />}
            {page === 'perfil'        && <PerfilPage token={token} />}
            {page === 'usuarios'      && <UsuariosPage   token={token} />}
          </Suspense>
          )}
        </main>
      </div>

      {quickOpen && (
        <Suspense fallback={null}>
          <QuickSearch token={token} onClose={() => setQuickOpen(false)} onSelect={irPara} />
        </Suspense>
      )}

      <ToastContainer items={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
    </AuthContext.Provider>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
// Computed once at module load - reads URL params before any history.replaceState clears them
const _urlState = (() => {
  const p = new URLSearchParams(window.location.search);
  const urlToken = p.get('session');
  const cnpj = p.get('cnpj') ?? '';
  const nc = p.get('new_cedente') === '1' && cnpj
    ? { cnpj, razao_social: decodeURIComponent(p.get('razao') ?? ''), natureza_juridica: decodeURIComponent(p.get('nj') ?? '') || undefined }
    : undefined;
  if (urlToken || nc) {
    const clean = new URL(window.location.href);
    ['session', 'new_cedente', 'cnpj', 'razao', 'nj'].forEach(k => clean.searchParams.delete(k));
    history.replaceState(null, '', clean.toString());
  }
  return { urlToken, newCedente: nc };
})();

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
  const [newCedente] = useState<NewCedente | undefined>(() => _urlState.newCedente);

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
  return <MainApp token={token} onLogout={logout} saindo={saindo} newCedente={newCedente} />;
}
