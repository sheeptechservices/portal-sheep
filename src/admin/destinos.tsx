// Catálogo dos destinos navegáveis do painel - as páginas do menu e as ferramentas
// do hub. É a fonte única do breadcrumb das ferramentas (AdminApp) e da navegação
// por ⌘K (QuickSearch), que casa por título, descrição e apelidos de cada destino.

export type Page =
  | 'projetos' | 'tarefas' | 'oportunidades' | 'cadastros' | 'configuracoes'
  | 'ferramentas' | 'gerador-documentos' | 'perfil'
  | 'usuarios';

export type GrupoDestino = 'Páginas' | 'Ferramentas';

export interface Destino {
  page: Page;
  titulo: string;
  descricao: string;
  grupo: GrupoDestino;
  /** Apelidos e sinônimos que também devem encontrar o destino. */
  termos?: string[];
  icon: JSX.Element;
}

const ic = {
  width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export const DESTINOS: Destino[] = [
  {
    page: 'oportunidades',
    titulo: 'Oportunidades',
    descricao: 'O funil comercial: com quem se está falando e o que pode virar projeto',
    grupo: 'Páginas',
    termos: ['funil', 'esteira', 'demandas', 'operacoes', 'kanban', 'comercial',
      // nomes anteriores da tela, para quem a conhece assim ainda encontrar
      'lead', 'leads', 'solicitacoes', 'solicitações'],
    icon: (
      <svg {...ic}>
        <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" />
      </svg>
    ),
  },
  {
    page: 'projetos',
    titulo: 'Projetos',
    descricao: 'Cadastro e acompanhamento dos projetos da casa',
    grupo: 'Páginas',
    termos: ['projeto', 'entregas', 'cliente', 'cronograma', 'prazo', 'gestao'],
    icon: (
      <svg {...ic}>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l1.8 2.2h8A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
        <path d="M8 13h8" />
      </svg>
    ),
  },
  {
    page: 'tarefas',
    titulo: 'Tarefas',
    descricao: 'O trabalho dos projetos, em quadro, lista ou tabela',
    grupo: 'Páginas',
    termos: ['task', 'tasks', 'tarefa', 'kanban', 'backlog', 'atividades', 'quadro'],
    icon: (
      <svg {...ic}>
        <path d="M9 11l2 2 4-4" />
        <rect x="3" y="4" width="18" height="16" rx="2.5" />
      </svg>
    ),
  },
  {
    page: 'ferramentas',
    titulo: 'Ferramentas',
    descricao: 'Hub de utilitários da operação',
    grupo: 'Páginas',
    termos: ['hub', 'utilitarios'],
    icon: (
      <svg {...ic}>
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
      </svg>
    ),
  },
  {
    page: 'cadastros',
    titulo: 'Cadastros',
    descricao: 'Cedentes, sacados e contatos',
    grupo: 'Páginas',
    termos: ['cedentes', 'sacados', 'clientes', 'contatos', 'base'],
    icon: (
      <svg {...ic}>
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    page: 'configuracoes',
    titulo: 'Configurações',
    descricao: 'Status, etapas, integrações, credenciais e o sistema de desenho',
    grupo: 'Páginas',
    termos: ['ajustes', 'settings', 'integracoes', 'credenciais', 'status', 'etapas',
      // A aba Desenho mora aqui dentro, e é por estes nomes que se procura por ela.
      'design', 'design system', 'estilo', 'desenho', 'tokens', 'cores', 'ui'],
    icon: (
      <svg {...ic}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },

  {
    // Só o administrador do sistema alcança - quem filtra é o `podeAbrirPagina`,
    // pela lista `PAGINAS_SO_ADMIN`, no menu e aqui no ⌘K.
    page: 'usuarios',
    titulo: 'Usuários',
    descricao: 'Quem tem acesso ao painel, papéis e o que cada papel alcança',
    grupo: 'Páginas',
    termos: ['acessos', 'permissoes', 'papel', 'papeis', 'role', 'equipe', 'time', 'membro', 'master', 'admin'],
    icon: (
      <svg {...ic}>
        <path d="M12 2.8l7.2 2.7v6c0 4.3-3 8.1-7.2 9.2-4.2-1.1-7.2-4.9-7.2-9.2v-6L12 2.8z" />
        <circle cx="12" cy="10.4" r="2.2" />
        <path d="M8.5 17c.5-1.9 1.9-2.9 3.5-2.9s3 1 3.5 2.9" />
      </svg>
    ),
  },

  {
    // Não está no menu lateral de propósito: chega-se a ela pelo avatar, no
    // topo. Fica no catálogo para o ⌘K encontrar.
    page: 'perfil',
    titulo: 'Perfil',
    descricao: 'Sua conta, seus acessos e o que você já fez no sistema',
    grupo: 'Páginas',
    termos: ['minha conta', 'usuario', 'quem sou eu', 'meus dados', 'atividade'],
    icon: (
      <svg {...ic}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20.5a7.5 7.5 0 0115 0" />
      </svg>
    ),
  },

  // ── Ferramentas (páginas que vivem dentro do hub) ──────────────────────────
  {
    page: 'gerador-documentos',
    titulo: 'Gerador de Contratos',
    descricao: 'Contratos, termos e aditivos a partir de modelos',
    grupo: 'Ferramentas',
    termos: ['documento', 'contrato', 'aditivo', 'modelo', 'template', 'docx', 'minuta'],
    icon: (
      <svg {...ic}>
        <rect x="8.4" y="8.4" width="13.2" height="13.2" rx="2.2" />
        <path d="M4.6 15.6a2.2 2.2 0 0 1-2.2-2.2V4.6a2.2 2.2 0 0 1 2.2-2.2h8.8a2.2 2.2 0 0 1 2.2 2.2" />
        <path d="M11.6 13.2h6.8M11.6 16.8h4.4" />
      </svg>
    ),
  },
];

/** Páginas que vivem "dentro" do hub de Ferramentas (breadcrumb + item de menu). */
export const TOOL_PAGES: Page[] = DESTINOS.filter(d => d.grupo === 'Ferramentas').map(d => d.page);

export const TOOL_LABELS: Record<string, string> = Object.fromEntries(
  DESTINOS.filter(d => d.grupo === 'Ferramentas').map(d => [d.page, d.titulo]),
);

/**
 * Dobra o texto para comparação: minúsculas, sem acentos e sem pontuação -
 * "Análise de Crédito", "analise credito" e "ANALISE-DE-CREDITO" viram a mesma
 * coisa. Pontuação some virando espaço, para não colar palavras vizinhas.
 */
export function dobrar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Pontua um destino contra o termo digitado. Zero = não casa. Casar no começo do
 * título vale mais que casar no meio, e o título vale mais que a descrição, para
 * "análise" trazer "Análise de Crédito" na frente de quem só a menciona.
 */
function pontuar(d: Destino, termo: string): number {
  const titulo = dobrar(d.titulo);
  const palavras = titulo.split(' ');

  if (titulo.startsWith(termo)) return 100;
  if (palavras.some(p => p.startsWith(termo))) return 80;

  // Termos de uma ou duas letras param aqui: casar no meio de uma palavra ou na
  // descrição encheria a lista de ruído já na primeira tecla.
  if (termo.length < 3) return 0;
  if (titulo.includes(termo)) return 60;

  const apelidos = dobrar([d.descricao, ...(d.termos ?? [])].join(' '));

  // Termo com várias palavras ("gerador doc"): todas precisam aparecer em algum
  // lugar do destino, em qualquer ordem.
  const tokens = termo.split(' ').filter(Boolean);
  const feno = `${titulo} ${apelidos}`;
  if (tokens.length > 1 && tokens.every(t => feno.includes(t))) return 40;
  if (apelidos.includes(termo)) return 25;
  return 0;
}

/** Destinos que casam com o termo, do mais relevante para o menos. */
export function buscarDestinos(termo: string): Destino[] {
  const t = dobrar(termo);
  if (!t) return [];
  return DESTINOS
    .map(d => ({ d, s: pontuar(d, t) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map(x => x.d);
}
