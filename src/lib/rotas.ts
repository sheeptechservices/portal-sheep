import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Page } from '../admin/destinos';

// As rotas do portal: o endereço diz que tela está aberta, em que aba e qual
// ficha, para que qualquer pedaço do portal possa ir por link.
//
//   /{tela}[/{aba}][/{item}]?{chave}={valor}
//
// - tela: a página (`/tarefas`, `/projetos`). O Dashboard é a raiz, `/`.
// - aba: a subpágina da tela, a mesma do menu (`/tarefas/lista`,
//   `/configuracoes/integracoes`). Só vale o que está em SUBPAGINAS.
// - item: a ficha aberta, a coisa principal da tela (`/tarefas/996`,
//   `/projetos/<id>`).
// - parâmetros: o resto, que mora dentro da ficha ou ao lado dela (a aba da
//   gaveta, a tarefa aberta por cima do projeto): `?aba=reunioes&tarefa=996`.
//
// Não há roteador: a página continua dona do próprio estado, e os ganchos
// daqui só o espelham no endereço, nos dois sentidos. Abrir a gaveta escreve o
// endereço; o endereço mudar (o voltar do navegador, um link colado) abre ou
// fecha a gaveta. Abrir ficha é passo no histórico, e o voltar a fecha; trocar
// de aba só reescreve o endereço, sem encher o histórico.

export const PAGINAS: readonly Page[] = [
  'dashboard', 'projetos', 'tarefas', 'oportunidades', 'configuracoes', 'ferramentas',
  'gerador-documentos', 'gerador-propostas', 'cofre', 'talentos', 'perfil', 'usuarios',
];

/** As abas de cada tela que vão no caminho. O nome é o mesmo valor que a
 *  página já usa no estado dela. */
export const SUBPAGINAS: Partial<Record<Page, readonly string[]>> = {
  oportunidades: ['quadro', 'lista', 'fechados', 'perdidos'],
  projetos: ['geral', 'planning'],
  tarefas: ['quadro', 'lista', 'tabela'],
  configuracoes: ['etapas', 'integracoes', 'desenho'],
  talentos: ['todos', 'time', 'interessados', 'vitrines'],
  cofre: ['segredos', 'acessos'],
  perfil: ['cadastro', 'acoes'],
  'gerador-propostas': ['gerador', 'templates', 'historico'],
};

/** Parâmetros que pertencem à ficha aberta: trocar de ficha, ou fechá-la,
 *  leva eles junto. Os outros (a visão da tela, o escopo) ficam. */
const PARAMETROS_DA_FICHA = ['aba', 'tarefa'];

export interface Rota {
  pagina: Page;
  sub: string | null;
  item: string | null;
  params: Record<string, string>;
}

const ehPagina = (s: string | undefined): s is Page => !!s && (PAGINAS as readonly string[]).includes(s);

export function lerRota(loc: { pathname: string; search: string } = window.location): Rota {
  const segs = loc.pathname.split('/').filter(Boolean).map(s => { try { return decodeURIComponent(s); } catch { return s; } });
  const pagina: Page = ehPagina(segs[0]) ? segs[0] : 'dashboard';
  let i = ehPagina(segs[0]) ? 1 : 0;
  let sub: string | null = null;
  if (segs[i] && SUBPAGINAS[pagina]?.includes(segs[i])) { sub = segs[i]; i += 1; }
  const item = ehPagina(segs[0]) ? (segs[i] ?? null) : null;
  return { pagina, sub, item, params: Object.fromEntries(new URLSearchParams(loc.search)) };
}

export function caminhoDe(r: { pagina: Page; sub?: string | null; item?: string | null; params?: Record<string, string> }): string {
  const partes = [r.pagina === 'dashboard' && !r.sub && !r.item ? '' : r.pagina, r.sub, r.item]
    .filter((x): x is string => !!x).map(encodeURIComponent);
  const busca = new URLSearchParams(Object.entries(r.params ?? {}).filter(([, v]) => v !== '')).toString();
  return `/${partes.join('/')}${busca ? `?${busca}` : ''}`;
}

/** O endereço completo de um pedaço do portal, para copiar e mandar. */
export function linkDe(r: Parameters<typeof caminhoDe>[0]): string {
  return `${window.location.origin}${caminhoDe(r)}`;
}

// ── A loja: a rota atual e quem quer saber dela ─────────────────────────────

let atual: Rota = lerRota();
const ouvintes = new Set<() => void>();

function avisar() {
  atual = lerRota();
  for (const o of ouvintes) o();
}

function assinar(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const assinarRota = assinar;
export const rotaAtual = (): Rota => atual;

if (typeof window !== 'undefined') window.addEventListener('popstate', avisar);

/** Marca do passo no histórico: quem o empurrou. Fechar a ficha que abriu o
 *  passo é voltar no histórico, em vez de empilhar mais um. */
type Marca = string | null;
const marcaAtual = (): Marca => (window.history.state && typeof window.history.state === 'object'
  ? (window.history.state.portal ?? null) : null);

/** Vai para a rota. `push` é passo no histórico; `replace` só reescreve. */
export function navegar(r: Rota, modo: 'push' | 'replace', marca?: Marca): void {
  const url = caminhoDe(r);
  if (url === `${window.location.pathname}${window.location.search}`) return;
  const estado = { portal: marca === undefined ? (modo === 'replace' ? marcaAtual() : null) : marca };
  if (modo === 'push') window.history.pushState(estado, '', url);
  else window.history.replaceState(estado, '', url);
  avisar();
}

/** O endereço pediu uma ficha que não existe (excluída, ou de um projeto que a
 *  pessoa não enxerga): a ficha sai do endereço, para ele não mentir. */
export function esquecerFicha(pagina: Page): void {
  const r = lerRota();
  if (r.pagina !== pagina || !r.item) return;
  const params = Object.fromEntries(Object.entries(r.params).filter(([k]) => !PARAMETROS_DA_FICHA.includes(k)));
  navegar({ ...r, item: null, params }, 'replace', null);
}

/** A rota atual, para os componentes: re-renderiza quando ela muda. */
export function useRota(): Rota {
  return useSyncExternalStore(assinar, rotaAtual, rotaAtual);
}

// ── Links antigos ───────────────────────────────────────────────────────────
// Os links que já foram mandados por aí (`/?tarefa=996`, `/?projeto=<id>`)
// viram rota já na carga, antes de qualquer tela montar.
if (typeof window !== 'undefined') {
  const p = new URLSearchParams(window.location.search);
  const antigos: [string, Page][] = [['tarefa', 'tarefas'], ['projeto', 'projetos'],
    ['oportunidade', 'oportunidades'], ['lead', 'oportunidades'], ['usuario', 'usuarios']];
  const achado = window.location.pathname.replace(/\/+$/, '') === '' ? antigos.find(([k]) => p.get(k)) : undefined;
  if (achado) {
    const [chave, pagina] = achado;
    const resto = new URLSearchParams(p);
    for (const [k] of antigos) resto.delete(k);
    window.history.replaceState(null, '', caminhoDe({ pagina, item: p.get(chave), params: Object.fromEntries(resto) }));
    atual = lerRota();
  }
}

// ── Os ganchos das telas ────────────────────────────────────────────────────

/**
 * Espelha a ficha aberta de uma tela no endereço (`/tarefas/996`).
 *
 * - `id`: a ficha aberta agora, ou null.
 * - `abrir(id)`: o endereço pediu esta ficha (link colado, voltar do
 *   navegador). A tela abre do jeito dela, até esperando a lista chegar.
 * - `fechar()`: o endereço não tem mais ficha, e a gaveta deve fechar.
 */
export function useFichaNaRota(pagina: Page, id: string | null, abrir: (id: string) => void, fechar: () => void): void {
  const rota = useRota();
  const idRef = useRef(id);
  idRef.current = id;
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const visto = useRef<string | null | undefined>(undefined);

  // A tela mudou a ficha: o endereço acompanha. Declarado antes da leitura,
  // para o endereço já estar escrito quando a leitura rodar.
  useEffect(() => {
    const anterior = visto.current;
    visto.current = id;
    if (anterior === undefined || anterior === id) return;
    const r = lerRota();
    if (r.pagina !== pagina || (r.item ?? null) === (id ?? null)) return;
    const params = Object.fromEntries(Object.entries(r.params).filter(([k]) => !PARAMETROS_DA_FICHA.includes(k)));
    if (id) {
      navegar({ ...r, item: id, params }, anterior == null ? 'push' : 'replace', anterior == null ? 'ficha' : undefined);
    } else if (marcaAtual() === 'ficha') {
      // A ficha abriu com um passo no histórico: fechar é voltar nele.
      window.history.back();
    } else {
      navegar({ ...r, item: null, params }, 'replace', null);
    }
  }, [id, pagina]);

  // O endereço mudou: a tela acompanha. Na montagem, só abre: endereço sem
  // ficha não fecha nada que a tela tenha aberto por conta própria.
  const montou = useRef(false);
  useEffect(() => {
    const primeira = !montou.current;
    montou.current = true;
    if (rota.pagina !== pagina) return;
    const naRota = rota.item;
    if ((naRota ?? null) === (idRef.current ?? null)) return;
    if (naRota) abrirRef.current(naRota);
    else if (!primeira && idRef.current != null) fecharRef.current();
  }, [rota, pagina]);
}

/**
 * Espelha um pedaço de estado num parâmetro do endereço (`?aba=reunioes`).
 *
 * - `padrao`: o valor que não vai no endereço (a aba de sempre).
 * - `passo`: abrir é passo no histórico (uma gaveta por cima de outra); sem
 *   ele, a troca só reescreve o endereço (uma aba).
 * - `ativo`: falso enquanto o estado não vale (a ficha ainda não abriu).
 */
export function useParametroNaRota(
  pagina: Page,
  chave: string,
  valor: string | null,
  aplicar: (v: string | null) => void,
  opcoes: { padrao?: string | null; passo?: boolean; ativo?: boolean } = {},
): void {
  const { padrao = null, passo = false, ativo = true } = opcoes;
  const rota = useRota();
  const valorRef = useRef(valor);
  valorRef.current = valor;
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  const visto = useRef<string | null | undefined>(undefined);
  const normal = (v: string | null | undefined) => (v == null || v === padrao ? null : v);

  useEffect(() => {
    if (!ativo) { visto.current = undefined; return; }
    const anterior = visto.current;
    visto.current = valor;
    const r = lerRota();
    if (r.pagina !== pagina) return;
    const naRota = normal(r.params[chave]);
    const meu = normal(valor);
    if (naRota === meu) return;
    if (anterior === undefined) {
      // Montou agora: o endereço manda, se disser algo; se não disser, o
      // estado da tela vai para o endereço, sem passo no histórico.
      if (naRota != null) return;
    } else if (normal(anterior) === meu) return;
    const params = { ...r.params };
    if (meu == null) delete params[chave]; else params[chave] = meu;
    const marca = `parametro:${chave}`;
    if (passo && meu != null && normal(anterior) == null && anterior !== undefined) navegar({ ...r, params }, 'push', marca);
    else if (passo && meu == null && marcaAtual() === marca) window.history.back();
    else navegar({ ...r, params }, 'replace');
  }, [valor, pagina, chave, ativo]);

  const leu = useRef(false);
  useEffect(() => {
    if (!ativo) { leu.current = false; return; }
    const primeira = !leu.current;
    leu.current = true;
    if (rota.pagina !== pagina) return;
    const naRota = normal(rota.params[chave]);
    if (naRota === normal(valorRef.current)) return;
    // Na primeira leitura, só o que o endereço pede de fato: endereço sem o
    // parâmetro não desfaz o estado da tela (o efeito de cima o escreve).
    if (primeira && naRota == null) return;
    aplicarRef.current(naRota ?? padrao);
  }, [rota, pagina, chave, ativo]);
}
