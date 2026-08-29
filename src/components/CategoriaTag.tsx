// Categorias de anexos de solicitação - fonte única (usada em todas as visualizações).
export const ANEXO_CATEGORIAS = ['Lastro', 'Proposta', 'Contrato', 'DEPS', 'Financeiro', 'Identidade', 'Comprovante', 'Outros'] as const;
export type AnexoCategoria = typeof ANEXO_CATEGORIAS[number];

export const normalizaCategoria = (c?: string | null): AnexoCategoria => {
  const v = (c || '').trim();
  return (ANEXO_CATEGORIAS as readonly string[]).includes(v) ? (v as AnexoCategoria) : 'Outros';
};

const CAT_COLORS: Record<AnexoCategoria, { bg: string; color: string }> = {
  Lastro:      { bg: 'rgba(30,138,62,.12)',   color: '#1E8A3E' },
  Proposta:    { bg: 'rgba(0,102,204,.12)',   color: '#0066CC' },
  Contrato:    { bg: 'rgba(124,58,237,.12)',  color: '#7C3AED' },
  DEPS:        { bg: 'rgba(180,83,9,.14)',    color: '#B45309' },
  Financeiro:  { bg: 'rgba(122,86,0,.12)',    color: '#7A5600' },
  Identidade:  { bg: 'rgba(190,24,93,.12)',   color: '#BE185D' },
  Comprovante: { bg: 'rgba(2,132,199,.12)',   color: '#0284C7' },
  Outros:      { bg: 'rgba(120,120,120,.12)', color: '#666666' },
};

export function categoriaColors(categoria?: string | null) {
  return CAT_COLORS[normalizaCategoria(categoria)];
}

export function CategoriaTag({ categoria, size = 'sm' }: { categoria?: string | null; size?: 'sm' | 'xs' }) {
  const cat = normalizaCategoria(categoria);
  const c = CAT_COLORS[cat];
  return (
    <span className={`categoria-tag${size === 'xs' ? ' categoria-tag-xs' : ''}`} style={{ background: c.bg, color: c.color }}>
      {cat}
    </span>
  );
}
