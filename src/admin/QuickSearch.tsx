import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DESTINOS, buscarDestinos, type Page, type Destino } from './destinos';
import { useAuth } from './AdminApp';
import { podeAbrirPagina, podeGerenciarUsuarios } from './papeis';

// Alvo de navegação devolvido ao shell. Um alvo é ou um card (abre a página e
// destaca o card) ou um destino de navegação (só troca de página).
export type QuickTarget =
  | { kind: 'card'; page: 'solicitacoes' | 'cadastros-pipeline'; id: string; titulo: string; sub?: string | null }
  | { kind: 'nav'; page: Page; titulo: string; sub?: string | null };

interface SolHit {
  id: string;
  created_at: string;
  valor: string | null;
  nome_contratado: string | null;
  cnpj_contratado: string | null;
  nome_sacado: string | null;
  cnpj_sacado: string | null;
  status_nome: string | null;
  status_cor: string | null;
}

interface CadHit {
  id: string;
  nome: string | null;
  razao_social: string | null;
  cnpj_cpf: string | null;
  nome_responsavel: string | null;
  aprovacao_status: string | null;
  criado_em: string;
  etapa_nome: string | null;
  etapa_cor: string | null;
}

type Row = { target: QuickTarget; badge?: string | null; badgeCor?: string | null; meta?: string | null };

const RECENTS_KEY = 'dux_admin_quick_recents';
const MAX_RECENTS = 6;

function loadRecents(): QuickTarget[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    // Recentes gravados antes dos destinos de navegação não têm `kind` - eram
    // sempre cards.
    return arr.slice(0, MAX_RECENTS).map((r: any) => ({ kind: r?.kind ?? 'card', ...r })) as QuickTarget[];
  } catch { return []; }
}

function chaveAlvo(t: QuickTarget): string {
  return t.kind === 'card' ? `card:${t.page}:${t.id}` : `nav:${t.page}`;
}

function pushRecent(t: QuickTarget) {
  try {
    const next = [t, ...loadRecents().filter(r => chaveAlvo(r) !== chaveAlvo(t))].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch { /* storage indisponível - recentes é conveniência, não requisito */ }
}

function maskDoc(v: string | null): string {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v;
}

const CardIcon = {
  solicitacoes: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <rect x="14" y="3" width="7" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  ),
  'cadastros-pipeline': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

/** Ícone da linha: o do destino, quando é navegação; o da página, quando é card. */
function iconeDe(t: QuickTarget): JSX.Element | null {
  if (t.kind === 'nav') return DESTINOS.find(d => d.page === t.page)?.icon ?? null;
  return CardIcon[t.page] ?? null;
}

function linhaDestino(d: Destino): Row {
  return {
    target: { kind: 'nav', page: d.page, titulo: d.titulo, sub: d.descricao },
    meta: d.grupo === 'Ferramentas' ? 'Ferramenta' : 'Página',
  };
}

export default function QuickSearch({ token, onClose, onSelect }: {
  token: string;
  onClose: () => void;
  onSelect: (t: QuickTarget) => void;
}) {
  const { pode, usuario } = useAuth();
  // Página que a pessoa não alcança não aparece na busca: oferecer um caminho que
  // volta 403 é pior do que não oferecer. Os cards já vêm filtrados do servidor.
  const admin = podeGerenciarUsuarios(usuario);
  const visivel = useCallback((d: Destino) => podeAbrirPagina(pode, d.page, admin), [pode, admin]);

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sols, setSols] = useState<SolHit[]>([]);
  const [cads, setCads] = useState<CadHit[]>([]);
  const [active, setActive] = useState(0);
  const [recents] = useState<QuickTarget[]>(() => loadRecents());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const termo = q.trim();
  // Navegação casa a partir do primeiro caractere (é tudo local); a busca de
  // cards vai ao servidor, então espera dois.
  const buscandoCards = termo.length >= 2;

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cada tecla recoloca a seleção na primeira linha - a lista mudou embaixo dela.
  useEffect(() => { setActive(0); }, [termo]);

  // Busca com debounce - cada tecla cancela o request anterior em voo.
  useEffect(() => {
    if (!buscandoCards) { setSols([]); setCads([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch('/api/admin-data?action=quick_search&q=' + encodeURIComponent(termo), {
        headers: { 'x-admin-session': token },
        signal: ctrl.signal,
      })
        .then(r => r.json())
        .then(d => { setSols(d.solicitacoes ?? []); setCads(d.cadastros ?? []); })
        .catch(() => { /* abortado ou offline */ })
        .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [termo, buscandoCards, token]);

  const grupos: { titulo: string; rows: Row[] }[] = termo
    ? [
        {
          titulo: 'Ir para',
          rows: buscarDestinos(termo).filter(visivel).map(linhaDestino),
        },
        {
          titulo: 'Solicitações',
          rows: sols.map(s => ({
            target: {
              kind: 'card' as const,
              page: 'solicitacoes' as const,
              id: s.id,
              titulo: s.nome_contratado || 'Sem cedente',
              sub: s.nome_sacado ? `Sacado: ${s.nome_sacado}` : maskDoc(s.cnpj_contratado) || null,
            },
            badge: s.status_nome,
            badgeCor: s.status_cor,
            meta: s.valor,
          })),
        },
        {
          titulo: 'Onboarding',
          rows: cads.map(c => ({
            target: {
              kind: 'card' as const,
              page: 'cadastros-pipeline' as const,
              id: c.id,
              titulo: c.razao_social || c.nome || 'Sem razão social',
              sub: c.nome_responsavel ? `Resp.: ${c.nome_responsavel}` : maskDoc(c.cnpj_cpf) || null,
            },
            badge: c.etapa_nome ?? c.aprovacao_status,
            badgeCor: c.etapa_cor,
            meta: maskDoc(c.cnpj_cpf) || null,
          })),
        },
      ].filter(g => g.rows.length > 0)
    : [
        ...(recents.length ? [{ titulo: 'Recentes', rows: recents.map(t => ({ target: t })) }] : []),
        { titulo: 'Ir para', rows: DESTINOS.filter(visivel).map(linhaDestino) },
      ];

  const flat: Row[] = grupos.flatMap(g => g.rows);
  // A lista encurta enquanto se digita; a seleção acompanha em vez de sumir.
  const sel = flat.length ? Math.min(active, flat.length - 1) : 0;

  const escolher = useCallback((t: QuickTarget) => {
    pushRecent(t);
    onSelect(t);
  }, [onSelect]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(flat.length ? (sel + 1) % flat.length : 0); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(flat.length ? (sel - 1 + flat.length) % flat.length : 0); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = flat[sel];
      if (row) escolher(row.target);
    }
  }

  // Mantém o item ativo visível durante a navegação por teclado.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.qs-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  let idx = -1;

  return createPortal(
    <div className="qs-overlay" onMouseDown={onClose}>
      <div className="qs-panel" onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="qs-inputwrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="qs-searchicon">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            className="qs-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar páginas, ferramentas, solicitações e onboarding…"
            spellCheck={false}
          />
          {loading && <span className="qs-spinner" aria-hidden />}
          <button type="button" className="qs-esc" onClick={onClose}>esc</button>
        </div>

        <div className="qs-results" ref={listRef}>
          {termo && !loading && flat.length === 0 && (
            <p className="qs-empty">
              {termo.length === 1
                ? 'Digite ao menos 2 caracteres para buscar cards.'
                : `Nada encontrado para “${termo}”.`}
            </p>
          )}

          {grupos.map(g => (
            <div key={g.titulo} className="qs-group">
              <div className="qs-grouphead">{g.titulo}</div>
              {g.rows.map(row => {
                idx += 1;
                const i = idx;
                const icone = iconeDe(row.target);
                return (
                  <button
                    key={chaveAlvo(row.target)}
                    type="button"
                    className={`qs-row${i === sel ? ' active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => escolher(row.target)}
                  >
                    <span className="qs-rowicon">{icone}</span>
                    <span className="qs-rowtext">
                      <span className="qs-rowtitle">{row.target.titulo}</span>
                      {row.target.sub && <span className="qs-rowsub">{row.target.sub}</span>}
                    </span>
                    {row.meta && <span className="qs-rowmeta">{row.meta}</span>}
                    {row.badge && (
                      <span
                        className="qs-rowbadge"
                        style={{
                          background: (row.badgeCor ?? '#8A8F98') + '1F',
                          color: row.badgeCor ?? '#8A8F98',
                        }}
                      >
                        {row.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="qs-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
