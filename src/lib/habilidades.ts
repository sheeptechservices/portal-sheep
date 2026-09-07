// ─────────────────────────────────────────────────────────────────────────────
//  As áreas de habilidade - os eixos do radar da ficha.
//
//  A lista saiu da leitura das 90 habilidades declaradas pelos 23 candidatos, e
//  não de um catálogo genérico de mercado: são as oito áreas em que aquilo tudo
//  de fato cai. Oito também é o número de competências da avaliação da casa, e
//  assim os dois radares da ficha ficam com a mesma densidade.
//
//  Os eixos são fixos, e é isso que faz duas fichas se compararem: Front-end
//  fica sempre no mesmo canto, então o formato do desenho já diz o perfil da
//  pessoa. Área em que ela não declarou nada fica no centro - a ausência é
//  informação.
//
//  A ordem é a do mostrador, e não a alfabética: as áreas vizinhas no radar são
//  vizinhas no trabalho (produto -> aplicação -> dado -> operação), e é isso que
//  faz um perfil de ponta a ponta desenhar um arco em vez de estrelas soltas.
//
//  O que a pessoa escreve é texto livre - "Java - Spring", "SQL / SQLite /
//  SQLAlchemy / Bancos de Dados", "Docker + Git/GitHub (DevOps/Ferramentas)" -,
//  então a área sai por trecho do que está escrito. Por trecho e não por palavra
//  inteira: "PostgreSQL" tem de cair em Dados, "APIs" em Back-end e ".Net" em
//  Back-end, e nenhum dos três casa com fronteira de palavra. Os termos curtos
//  demais (js, ml, ia, qa) vão em `curtos`, com fronteira.
//
//  A ordem de teste importa: vale a primeira área que casa. É por isso que
//  "Java - Spring" é Back-end antes de ser linguagem, e "Power BI" é Dados antes
//  de ser ferramenta de automação da Microsoft.
// ─────────────────────────────────────────────────────────────────────────────

export interface Familia {
  chave: string;
  label: string;
  /** Rótulo curto, para o eixo do radar não virar duas linhas. */
  curto: string;
  termos: string[];
  curtos?: RegExp;
}

/** Ordem de teste - e também a ordem em volta do radar. */
export const FAMILIAS: Familia[] = [
  {
    chave: 'produto', label: 'Produto & Design', curto: 'Produto',
    termos: ['figma', 'design', 'produto', 'roadmap', 'scrum', 'ágil', 'agil',
      'vídeo', 'video', 'edição', 'edicao', 'marketing', 'startup'],
    curtos: /\b(ux|ui)\b/i,
  },
  {
    chave: 'front', label: 'Front-end', curto: 'Front-end',
    termos: ['react', 'next', 'angular', 'vue', 'svelte', 'tailwind', 'css', 'html',
      'front-end', 'front end', 'frontend', 'flutter', 'mobile', 'android', 'ios',
      'typescript', 'javascript', 'desenvolvimento web', 'interface'],
    curtos: /\b(js)\b/i,
  },
  {
    chave: 'back', label: 'Back-end & APIs', curto: 'Back-end',
    // As linguagens de servidor entram aqui: num banco de talentos, "Java"
    // responde à pergunta "quem faz back-end?", e não a "quem sabe uma
    // linguagem?" - eixo de linguagem seria eixo que quase todo mundo preenche,
    // e eixo que todo mundo preenche não separa ninguém.
    termos: ['api', 'rest', 'graphql', 'node', 'spring', 'laravel', 'symfony',
      'hyperf', 'micro servi', 'microservi', 'rabbitmq', 'kafka', 'clean arch',
      'back-end', 'back end', 'backend', 'java', 'python', 'php', 'c#', 'c++',
      '.net', 'kotlin', 'swift', 'ruby', 'rust', 'delphi', 'fastapi'],
    curtos: /\b(go|golang)\b/i,
  },
  {
    chave: 'dados', label: 'Dados & BI', curto: 'Dados & BI',
    termos: ['sql', 'banco de dados', 'bancos de dados', 'modelagem', 'etl',
      'power bi', 'powerbi', 'fabric', 'dados', 'dashboard', 'analytics',
      'planilha', 'excel', 'ferramentas microsoft'],
  },
  {
    chave: 'ia', label: 'IA & Automação', curto: 'IA & Automação',
    termos: ['machine learning', 'inteligência artificial', 'inteligencia artificial',
      'rag', 'llm', 'n8n', 'power automate', 'power app', 'automação', 'automacao',
      'chatbot', 'whisper', 'visão computacional'],
    curtos: /\b(ia|ml)\b/i,
  },
  {
    chave: 'infra', label: 'Cloud & DevOps', curto: 'Cloud & DevOps',
    termos: ['aws', 'azure', 'gcp', 'cloud', 'docker', 'kubernetes', 'k8s',
      'devops', 'git', 'ci/cd', 'linux', 'sistemas operacionais', 'rede',
      'protocolos', 'servidor', 'terraform', 'observabilidade'],
  },
  {
    chave: 'qualidade', label: 'Qualidade & Testes', curto: 'Qualidade',
    termos: ['teste', 'robot framework', 'k6', 'performance test', 'cypress',
      'selenium', 'quality', 'qualidade'],
    curtos: /\b(qa)\b/i,
  },
  {
    chave: 'seguranca', label: 'Segurança & Governança', curto: 'Segurança',
    termos: ['segurança', 'seguranca', 'jwt', 'lgpd', 'threat', 'siem', 'pentest',
      'acessos', 'criptografia', 'vulnerabilidade', 'itil', 'itsm', 'governança',
      'governanca', 'compliance', 'service desk', 'suporte'],
  },
];

/** O que não casa com área nenhuma. Não vira eixo: um eixo "Outras" mediria
 *  coisas diferentes em pessoas diferentes, e aí o radar deixaria de comparar.
 *  Aparece na lista embaixo do desenho, que é onde nada se perde. */
export const OUTRAS: Familia = { chave: 'outras', label: 'Outras', curto: 'Outras', termos: [] };

export function familiaDe(nome: string): Familia {
  const n = nome.toLowerCase();
  return FAMILIAS.find(f => f.termos.some(t => n.includes(t)) || f.curtos?.test(n)) ?? OUTRAS;
}

/**
 * Os anos que o texto de tempo diz, quando diz. "3 anos", "6 meses", "1 ano,
 * 6 meses", "+ 5 anos", "10" - tudo isso aparece na base, escrito por quem se
 * candidatou. Sem número reconhecível, `null`: chutar um tempo seria inventar
 * currículo.
 */
export function anosDe(tempo: string | null): number | null {
  if (!tempo) return null;
  const texto = tempo.toLowerCase();
  const anos = /(\d+(?:[.,]\d+)?)\s*anos?/.exec(texto);
  const meses = /(\d+(?:[.,]\d+)?)\s*(?:meses|mês|mes)\b/.exec(texto);
  let total = 0;
  if (anos) total += Number(anos[1].replace(',', '.'));
  if (meses) total += Number(meses[1].replace(',', '.')) / 12;
  if (!anos && !meses) {
    // Só o número, sem unidade: "10", "3". É ano - ninguém escreve "10" para
    // dizer dez meses.
    const solto = /^\s*[+-]?\s*(\d+(?:[.,]\d+)?)\s*$/.exec(texto);
    if (!solto) return null;
    total = Number(solto[1].replace(',', '.'));
  }
  return total > 0 && total < 60 ? total : null;
}
