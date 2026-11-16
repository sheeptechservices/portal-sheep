import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { DESTINOS, buscarDestinos, type Page, type Destino } from './destinos';
import { useAuth } from './AdminApp';
import { podeAbrirPagina, podeVerUsuarios } from './papeis';
import { IconSearch, IconSpinner } from '../components/icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { COR_STATUS_PROJETO } from '../lib/statusDoProjeto';

// Alvo de navegação devolvido ao shell. Um alvo é ou um card (abre a página e
// destaca o card) ou um destino de navegação (só troca de página).
export type QuickTarget =
  | { kind: 'card'; page: 'oportunidades' | 'projetos' | 'tarefas'; id: string; titulo: string; sub?: string | null }
  | { kind: 'nav'; page: Page; titulo: string; sub?: string | null };

interface SolHit {
  id: string;
  created_at: string;
  empresa: string | null;
  cnpj: string | null;
  contato_nome: string | null;
  valor_estimado: number | null;
  status_nome: string | null;
  status_cor: string | null;
}


interface ProjetoHit {
  id: string;
  codigo: string | null;
  nome: string;
  status: string | null;
  cliente_nome: string | null;
}

interface TarefaHit {
  id: number;
  titulo: string;
  status: string | null;
  projeto_id: string;
  projeto_nome: string | null;
  /** A cor da etapa no quadro, para a pílula sair na mesma cor. */
  status_cor: string | null;
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

/** O ícone da linha: o mesmo que o menu usa para a página - de destino de
 *  navegação ou da página do card. É o que faz o olho reconhecer o destino
 *  antes de ler o título, e vem da mesma lista de destinos, sem desenho solto
 *  aqui dentro. */
function iconeDe(t: QuickTarget): JSX.Element | null {
  return DESTINOS.find(d => d.page === t.page)?.icon ?? null;
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
  const veUsuarios = podeVerUsuarios(usuario);
  const visivel = useCallback(
    (d: Destino) => podeAbrirPagina(pode, d.page, veUsuarios), [pode, veUsuarios],
  );

  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [sols, setSols] = useState<SolHit[]>([]);
  const [projs, setProjs] = useState<ProjetoHit[]>([]);
  const [tarefas, setTarefas] = useState<TarefaHit[]>([]);
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
    if (!buscandoCards) { setSols([]); setProjs([]); setTarefas([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch('/api/admin-data?action=quick_search&q=' + encodeURIComponent(termo), {
        headers: { 'x-admin-session': token },
        signal: ctrl.signal,
      })
        .then(r => r.json())
        .then(d => {
          setSols(d.oportunidades ?? []);
          setProjs(d.projetos ?? []);
          setTarefas(d.tarefas ?? []);
        })
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
          titulo: 'Oportunidades',
          rows: sols.map(s => ({
            target: {
              kind: 'card' as const,
              page: 'oportunidades' as const,
              id: s.id,
              titulo: s.empresa || 'Sem empresa',
              // Quem atendeu diz mais que o CNPJ; o documento fica de reserva.
              sub: s.contato_nome || maskDoc(s.cnpj) || null,
            },
            badge: s.status_nome,
            badgeCor: s.status_cor,
            meta: s.valor_estimado != null
              ? s.valor_estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
              : null,
          })),
        },
        {
          titulo: 'Projetos',
          rows: projs.map(p => ({
            target: {
              kind: 'card' as const,
              page: 'projetos' as const,
              id: p.id,
              titulo: p.nome,
              // O cliente diz de quem e o projeto, que e o que separa dois
              // projetos de nome parecido; o codigo fica na coluna da direita.
              sub: p.cliente_nome,
            },
            badge: p.status,
            badgeCor: p.status ? COR_STATUS_PROJETO[p.status] ?? null : null,
            meta: p.codigo,
          })),
        },
        {
          titulo: 'Tarefas',
          rows: tarefas.map(t => ({
            target: {
              kind: 'card' as const,
              page: 'tarefas' as const,
              id: String(t.id),
              titulo: t.titulo,
              // Sem o projeto ao lado, "Ajustar o filtro" aparece tres vezes na
              // lista e nao da para saber qual e qual.
              sub: t.projeto_nome,
            },
            badge: t.status,
            badgeCor: t.status_cor,
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

  // A busca sai como todo diálogo: encolhendo, e não de estalo. Escolher um
  // destino leva a tela para ele na hora, e a busca sai por cima, já em
  // movimento - ninguém espera a animação para ver a página.
  const { saindo, fechar } = useSaidaSuave(onClose, 160);

  const escolher = useCallback((t: QuickTarget) => {
    pushRecent(t);
    onSelect(t);
    fechar();
  }, [onSelect, fechar]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
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
  // A assinatura do resultado: quando a lista muda, os grupos remontam e a
  // entrada toca; uma tecla que não muda o resultado não reanima nada.
  const assinatura = flat.map(r => chaveAlvo(r.target)).join('|');

  return createPortal(
    <div className={`qs-overlay${saindo ? ' saindo' : ''}`} onMouseDown={fechar}>
      <div className="qs-panel" role="dialog" aria-modal="true" aria-label="Busca rápida"
        onMouseDown={e => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="qs-inputwrap">
          <span className="qs-searchicon"><IconSearch size={16} /></span>
          <input
            ref={inputRef}
            className="qs-input"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar páginas, ferramentas, oportunidades, projetos e tarefas"
            aria-label="Buscar no portal"
            spellCheck={false}
          />
          {loading && <span className="qs-carregando"><IconSpinner size={14} /></span>}
          <button type="button" className="qs-esc" onClick={fechar} aria-label="Fechar a busca">esc</button>
        </div>

        <div className="qs-results" ref={listRef}>
          {termo && !loading && flat.length === 0 && (
            <p className="qs-empty surge">
              {termo.length === 1
                ? 'Digite ao menos 2 caracteres para buscar cards.'
                : `Nada encontrado para "${termo}".`}
            </p>
          )}

          <div className="lista-anima" key={assinatura}>
            {grupos.map(g => (
              <div key={g.titulo} className="qs-group">
                <div className="qs-grouphead">{g.titulo}</div>
                {g.rows.map(row => {
                  idx += 1;
                  const i = idx;
                  const icone = iconeDe(row.target);
                  const cor = row.badgeCor ?? 'var(--gray2)';
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
                      {/* A pílula de status da casa, na cor da etapa: a mesma
                          que a pessoa vê no quadro e na fila. */}
                      {row.badge && (
                        <span className="reportes-status qs-rowbadge" style={{ ['--cor' as string]: cor }}>
                          <span className="reportes-ponto" style={{ background: cor }} />
                          {row.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="qs-footer" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> abrir</span>
          <span><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
