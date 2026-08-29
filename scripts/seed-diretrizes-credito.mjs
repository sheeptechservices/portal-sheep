// ─────────────────────────────────────────────────────────────────────────────
//  Popula credito_diretrizes com a metodologia do projeto dux-analise-credito-v3.
//
//  Aquele projeto não tinha markdown: a base de conhecimento estava embutida no
//  prompt do server.js e, sobretudo, no motor buildDecisao() do app.js (limites,
//  faixas de score, taxa por risco, escolha do tipo de operação). Aqui essas
//  regras viram diretrizes de texto, que é o que a IA lê em runtime.
//
//  Duas origens, para o operador saber o que conferir:
//    · "explícita" — está literalmente no código/prompt do projeto v3
//    · "derivada"  — inferida dos campos e do fluxo (revisar antes de confiar)
//
//  Idempotente: pula instrução que já exista ativa (mesma normalização do
//  importar_diretrizes do admin-handler).
//
//  Uso:  node scripts/seed-diretrizes-credito.mjs [--dry]
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

const EXPLICITA = 'metodologia dux-analise-credito-v3 (regra explícita)';
const DERIVADA = 'metodologia dux-analise-credito-v3 (derivada — conferir)';

// prioridade: decisão 10 > interpretação 8 > extração 5; derivadas entram em 0
// para ficarem no fim da lista até o operador validar.
const DIRETRIZES = [
  // ── EXTRAÇÃO ───────────────────────────────────────────────────────────────
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Transcreva o faturamento presumido dos relatórios de crédito exatamente como o documento escreve, inclusive quando vier como faixa ou como "maior que" — não converta para um número único.',
    exemplo: 'Entre R$ 8.000.000,00 e R$ 10.000.000,00',
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Trate o faturamento presumido como valor já expresso em reais: nunca multiplique por mil ou por milhão, nem reinterprete a escala do número.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Extraia `cedente.faturamento_12m` da declaração de faturamento ou do Balanço/DRE e `cedente.receita_bruta_fiscal` do IRPJ/ECF/DEFIS — são campos distintos e um não substitui o outro.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Do IRPJ, da ECF ou da DEFIS extraia sempre a receita bruta e o resultado do exercício.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Em nota fiscal de serviço de qualquer prefeitura (o layout muda de município para município), extraia número, data de emissão, valor, vencimento, descrição do serviço e os dados bancários impressos na nota.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Registre os dados bancários impressos na nota fiscal em `lastro.banco_nf`/`agencia_nf`/`conta_nf` e os do comprovante bancário do cedente em `cedente.banco`/`agencia`/`conta` — nunca no mesmo campo, porque a análise compara os dois.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Ao ler CNH ou RG do representante legal, extraia nome, CPF e a validade do documento.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Do Balanço Patrimonial e da DRE extraia patrimônio líquido, capital social do balanço, disponibilidades, liquidez real e resultado do exercício.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Registre a pontualidade de pagamento em cada janela separadamente (12 meses, 6 meses e 3 meses), no campo correspondente — nunca consolide as janelas numa média.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 5, origem: EXPLICITA,
    instrucao: 'Do contrato social ou da última alteração contratual extraia razão social, CNPJ, capital social, data de fundação, CNAE principal, endereço e o representante legal / quadro societário.',
    exemplo: null,
  },
  {
    categoria: 'extracao', prioridade: 0, origem: DERIVADA,
    instrucao: 'No resumo do comprovante de endereço, informe a data de emissão do documento — o kit obrigatório exige comprovante com menos de 3 meses.',
    exemplo: null,
  },

  // ── INTERPRETAÇÃO ──────────────────────────────────────────────────────────
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Meça as restrições pela proporção, não pelo valor absoluto: proporção de restrições = (valor das ações judiciais + valor dos protestos) ÷ faturamento anual × 100.',
    exemplo: 'R$ 18.000 de protestos sobre faturamento de R$ 300.000 = 6%',
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Leia a proporção de restrições nestas faixas, tanto para o cedente quanto para o sacado: abaixo de 5% é confortável, de 5% a 15% é atenção, acima de 15% é crítico.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Leia o score do cedente nestas faixas: abaixo de 350 está abaixo do corte, de 350 a 649 é atenção, 650 ou mais é confortável.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Leia o score do sacado nestas faixas: abaixo de 500 está abaixo do corte, de 500 a 649 é atenção, 650 ou mais é confortável — o corte do sacado é mais alto que o do cedente.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Classifique o risco da operação como baixo quando as restrições de cedente e sacado ficarem abaixo de 5% e ambos os scores passarem de 500; como elevado quando qualquer das duas proporções passar de 15% ou o score do cedente ficar abaixo de 350; nos demais casos, como médio.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Use como faturamento do cedente o valor apurado (faturamento de 12 meses do balanço ou da declaração) e recorra ao faturamento presumido do relatório de crédito só quando o apurado não existir — dizendo no parecer qual base foi usada.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Do sacado normalmente só existe faturamento presumido: quando ele for a única base disponível, trate o limite do sacado como estimativa e reduza a confiança da recomendação.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Quando o faturamento presumido vier como faixa, use a média entre os extremos da faixa como base de cálculo.',
    exemplo: 'Entre R$ 8.000.000,00 e R$ 10.000.000,00 → base de R$ 9.000.000,00',
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Calcule os dias entre o vencimento do lastro e a data de hoje: título já vencido é ponto de atenção obrigatório no parecer, com os dias de atraso explicitados.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: EXPLICITA,
    instrucao: 'Pontualidade de pagamento abaixo de 80% em 12 meses enfraquece o sacado mesmo quando o score dele estiver bom.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 8, origem: DERIVADA,
    instrucao: 'Aponte qualquer divergência entre o valor solicitado na operação e o valor do lastro — a antecipação se limita ao valor do título.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Trate como red flag de desvio de recebível a divergência entre a conta bancária impressa na nota fiscal e a conta cadastrada do cedente, ou titular da conta com CNPJ diferente do CNPJ do cedente.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Situação cadastral do cedente na Receita Federal diferente de "ATIVA" é impeditivo: registre como alerta crítico.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'CNH do representante legal vencida impede a formalização: registre como condicionante de atualização do documento.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Comprovante de endereço com mais de 3 meses não atende o kit obrigatório: trate como documento pendente.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Compare os empréstimos a ligadas com o patrimônio líquido do cedente: valores relevantes indicam saída de caixa para partes relacionadas e são ponto de atenção.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Compare liquidez real e liquidez contábil do cedente: quando a real for bem menor que a contábil, há ativos de baixa realização no balanço — registre isso na leitura financeira.',
    exemplo: null,
  },
  {
    categoria: 'interpretacao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Não use como pilar da recomendação um dado que veio com confiança baixa ou com divergência de leitura sem sinalizar essa incerteza no parecer.',
    exemplo: null,
  },

  // ── DECISÃO ────────────────────────────────────────────────────────────────
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Calcule o limite do cedente como 30% do faturamento anual dele.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Calcule o limite do sacado como 20% do faturamento anual dele.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Adote como limite da operação o MENOR entre o limite do cedente e o limite do sacado.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Aplique a taxa conforme o nível de risco: 2,80% ao mês para risco baixo, 3,50% ao mês para risco médio e 4,50% ao mês para risco elevado.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Recomende ANUÊNCIA quando o sacado for forte — score 650 ou mais, pontualidade de 12 meses de 80% ou mais e restrições abaixo de 10% — porque a anuência concentra o risco no sacado confiável.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Recomende ESCROW quando o sacado for médio — score entre 500 e 649 com restrições abaixo de 15%.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Recomende COMISSIONÁRIA apenas no caso excepcional de sacado fraco (score abaixo de 500 ou restrições de 15% ou mais) combinado com cedente forte (score 650 ou mais, pontualidade de 12 meses de 80% ou mais e restrições abaixo de 10%).',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Use ESCROW como padrão sempre que a operação não se enquadrar em nenhum dos casos de anuência ou de comissionária.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Lance cada documento faltante do kit obrigatório como condicionante de responsabilidade do Cedente.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: EXPLICITA,
    instrucao: 'Classifique cada item de adequação com um responsável (Cedente, Sacado ou DUX) e um tipo (Condicionante, Adequação ou Bloqueante), reservando Bloqueante para o que impede a operação de seguir.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 10, origem: DERIVADA,
    instrucao: 'Trate a recomendação do motor de risco como ponto de partida: se divergir da taxa, do limite ou do tipo de operação calculados, diga explicitamente na argumentação por que está divergindo.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Quando o valor solicitado superar o limite calculado, não recomende aprovação pelo valor cheio: proponha aprovação parcial até o limite ou condicione a reforço de garantia.',
    exemplo: null,
  },
  {
    categoria: 'decisao', prioridade: 0, origem: DERIVADA,
    instrucao: 'Lastro já vencido exige condicionante específica no parecer — não recomende aprovação sem tratar o atraso.',
    exemplo: null,
  },
];

// ── env ──────────────────────────────────────────────────────────────────────
function lerEnv(arquivo) {
  const txt = readFileSync(arquivo, 'utf8');
  const out = {};
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = lerEnv(path.join(RAIZ, '.env'));
if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
  console.error('❌ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN ausentes no .env');
  process.exit(1);
}

const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

// Mesma tabela de _diretrizes.ts (o seed roda antes de qualquer request admin).
await db.execute(`
  CREATE TABLE IF NOT EXISTS credito_diretrizes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria     TEXT NOT NULL,
    escopo        TEXT NOT NULL DEFAULT 'global',
    instrucao     TEXT NOT NULL,
    exemplo       TEXT,
    status        TEXT NOT NULL DEFAULT 'ativa',
    substitui_id  INTEGER,
    prioridade    INTEGER NOT NULL DEFAULT 0,
    origem        TEXT,
    criado_por    TEXT,
    criado_em     TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  )
`);

const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const existentes = new Set(
  (await db.execute(`SELECT instrucao FROM credito_diretrizes WHERE status = 'ativa'`))
    .rows.map(r => norm(String(r.instrucao ?? ''))),
);

const agora = new Date().toISOString();
let criadas = 0, puladas = 0;

for (const d of DIRETRIZES) {
  if (existentes.has(norm(d.instrucao))) {
    puladas++;
    console.log(`↷ já existe: ${d.instrucao.slice(0, 70)}…`);
    continue;
  }
  if (DRY) {
    criadas++;
    console.log(`+ [${d.categoria}] ${d.instrucao.slice(0, 80)}…`);
    existentes.add(norm(d.instrucao));
    continue;
  }
  await db.execute({
    sql: `INSERT INTO credito_diretrizes
          (categoria, escopo, instrucao, exemplo, status, substitui_id, prioridade, origem, criado_por, criado_em, atualizado_em)
          VALUES (?, 'global', ?, ?, 'ativa', NULL, ?, ?, 'seed', ?, ?)`,
    args: [d.categoria, d.instrucao, d.exemplo, d.prioridade, d.origem, agora, agora],
  });
  existentes.add(norm(d.instrucao));
  criadas++;
}

console.log(`\n${DRY ? '[dry-run] ' : ''}${criadas} criada(s), ${puladas} pulada(s).`);
if (!DRY) {
  const r = await db.execute(`SELECT categoria, COUNT(*) c FROM credito_diretrizes WHERE status='ativa' GROUP BY categoria`);
  for (const row of r.rows) console.log(`  ${row.categoria}: ${row.c} ativa(s)`);
}
