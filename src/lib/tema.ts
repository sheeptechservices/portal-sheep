// Tema claro/escuro - store simples + efeito de "revelação circular" na troca,
// portado do projeto dux_drawee-risk. Sem dependências: usa a View Transitions API
// (com fallback de cross-fade e respeito a prefers-reduced-motion).
export type Tema = 'claro' | 'escuro';
export const TEMA_PADRAO: Tema = 'claro';
const CHAVE = 'dux_tema';

// Traduz para o data-attribute que o CSS entende.
export function atributoDoTema(t: Tema): 'light' | 'dark' {
  return t === 'escuro' ? 'dark' : 'light';
}

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : TEMA_PADRAO;
  } catch {
    return TEMA_PADRAO; // localStorage lança em janela privada/iframe bloqueado
  }
}

function aplicar(t: Tema) {
  document.documentElement.setAttribute('data-theme', atributoDoTema(t));
}

const ouvintes = new Set<() => void>();
let atual: Tema | null = null;
function avisar() { for (const o of ouvintes) o(); }

export const lojaTema = {
  assinar(o: () => void): () => void {
    ouvintes.add(o);
    // 'storage' só dispara em OUTRAS abas → troca numa aba acerta as demais.
    const externo = () => { atual = null; aplicar(lerTema()); avisar(); };
    if (ouvintes.size === 1) window.addEventListener('storage', externo);
    return () => {
      ouvintes.delete(o);
      if (!ouvintes.size) window.removeEventListener('storage', externo);
    };
  },
  // Memoiza: useSyncExternalStore exige a mesma referência enquanto nada muda.
  agora(): Tema { if (atual === null) atual = lerTema(); return atual; },
  servidor(): Tema { return TEMA_PADRAO; },
  definir(t: Tema): void {
    atual = t;
    try { localStorage.setItem(CHAVE, t); } catch { /* ignore */ }
    aplicar(t);
    avisar();
  },
};

// Raio que, a partir de (x, y), cobre o retângulo largura×altura (canto mais longe).
export function raioQueCobre(x: number, y: number, largura: number, altura: number): number {
  return Math.hypot(Math.max(x, largura - x), Math.max(y, altura - y));
}

type DocumentoComTransicao = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

const DURACAO = 620; // espelhado no CSS (@keyframes tema-revela / fallback)

// Executa `trocar` (a mudança de estado) dentro de uma revelação circular a partir
// de `origem` (o ponto do clique). `trocar` deve ser SÍNCRONO (use flushSync no React).
export function comRevelacao(origem: { x: number; y: number } | null, trocar: () => void): void {
  if (typeof document === 'undefined') { trocar(); return; }

  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as DocumentoComTransicao;
  const raiz = document.documentElement;

  // Movimento reduzido → troca seca.
  if (calmo) { trocar(); return; }

  // Sem View Transitions (ex.: Firefox) → classe temporária que faz as cores deslizarem.
  if (typeof doc.startViewTransition !== 'function') {
    raiz.classList.add('tema-trocando');
    trocar();
    window.setTimeout(() => raiz.classList.remove('tema-trocando'), DURACAO);
    return;
  }

  // O efeito de verdade. Sem ponto de origem (teclado), nasce do centro da tela.
  const x = origem?.x ?? window.innerWidth / 2;
  const y = origem?.y ?? window.innerHeight / 2;
  raiz.style.setProperty('--tema-x', `${x}px`);
  raiz.style.setProperty('--tema-y', `${y}px`);
  raiz.style.setProperty('--tema-r', `${raioQueCobre(x, y, window.innerWidth, window.innerHeight)}px`);

  raiz.classList.add('tema-revelando');
  const transicao = doc.startViewTransition(trocar);
  const limpar = () => raiz.classList.remove('tema-revelando');
  transicao.finished.then(limpar, limpar);
}
