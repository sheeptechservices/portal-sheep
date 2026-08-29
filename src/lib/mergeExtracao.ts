// ─────────────────────────────────────────────────────────────────────────────
//  Consolidação das extrações por documento - código puro, sem IA e sem token.
//
//  Cada documento é lido isoladamente e devolve uma lista de campos com chave
//  namespaced (`cedente.score_deps`), confiança e fonte. Aqui juntamos tudo no
//  formato que `populateFromServer` já espera ({operacao, cedente, sacado,
//  lastro}) e registramos o que o operador precisa conferir:
//
//   - conflito: dois documentos deram valores diferentes para o mesmo campo
//   - confiança baixa/média declarada pela própria IA
//   - divergência entre a leitura visual e o texto extraído localmente
//
//  Em conflito, vence a maior confiança; empate mantém o primeiro e sinaliza.
// ─────────────────────────────────────────────────────────────────────────────

export type Confianca = 'alta' | 'media' | 'baixa';

export interface CampoExtraido {
  chave: string;
  valor: string;
  confianca: Confianca | string;
  fonte: string;
}

export interface DocExtraido {
  filename: string;
  tipo: string;
  resumo: string;
  parte: string;
  confianca_global: string;
  campos: CampoExtraido[];
  divergencias: { chave: string; valor_imagem: string; valor_texto: string; adotado: string }[];
  leitura?: string;
}

export interface AvisoCampo {
  chave: string;
  motivo: 'conflito' | 'confianca' | 'divergencia';
  texto: string;
}

export interface Consolidado {
  dados: { operacao: Record<string, string>; cedente: Record<string, string>; sacado: Record<string, string>; lastro: Record<string, string> };
  /** Chaves (namespaced) que merecem conferência do operador. */
  revisar: Set<string>;
  avisos: AvisoCampo[];
  /** Fonte declarada pela IA por chave - usada no tooltip do campo. */
  fontes: Record<string, string>;
}

const PESO: Record<string, number> = { alta: 3, media: 2, baixa: 1 };

function peso(c: string): number { return PESO[String(c).toLowerCase()] ?? 1; }

// Comparação tolerante: "12.345.678/0001-99" e "12345678000199" são o mesmo
// valor; "R$ 1.234,56" e "1.234,56" também.
function norm(v: string): string {
  return String(v ?? '')
    .toLowerCase()
    .replace(/r\$/g, '')
    .replace(/[.\-/()\s%]/g, '')
    .trim();
}

export function consolidarExtracao(docs: DocExtraido[]): Consolidado {
  const escolhido = new Map<string, { valor: string; confianca: string; fonte: string; filename: string }>();
  const revisar = new Set<string>();
  const avisos: AvisoCampo[] = [];

  for (const doc of docs) {
    // Divergência visão × texto vale conferência mesmo que o campo não conflite
    for (const d of doc.divergencias ?? []) {
      if (!d?.chave) continue;
      revisar.add(d.chave);
      avisos.push({
        chave: d.chave,
        motivo: 'divergencia',
        texto: `${d.chave}: imagem diz "${d.valor_imagem}" e o texto extraído diz "${d.valor_texto}" (${doc.filename}). Adotado: ${d.adotado}`,
      });
    }

    for (const campo of doc.campos ?? []) {
      const chave = String(campo?.chave ?? '').trim();
      const valor = String(campo?.valor ?? '').trim();
      if (!chave || !valor) continue;

      const atual = escolhido.get(chave);
      if (!atual) {
        escolhido.set(chave, { valor, confianca: String(campo.confianca), fonte: String(campo.fonte ?? ''), filename: doc.filename });
      } else if (norm(atual.valor) !== norm(valor)) {
        const novoGanha = peso(campo.confianca) > peso(atual.confianca);
        const vencedor = novoGanha ? valor : atual.valor;
        const perdedor = novoGanha ? atual.valor : valor;
        if (novoGanha) {
          escolhido.set(chave, { valor, confianca: String(campo.confianca), fonte: String(campo.fonte ?? ''), filename: doc.filename });
        }
        revisar.add(chave);
        avisos.push({
          chave,
          motivo: 'conflito',
          texto: `${chave}: "${vencedor}" (${novoGanha ? doc.filename : atual.filename}) × "${perdedor}" (${novoGanha ? atual.filename : doc.filename}) - mantido o de maior confiança`,
        });
      }

      // Confiança declarada abaixo de alta → conferir
      if (peso(campo.confianca) < 3) {
        revisar.add(chave);
        avisos.push({
          chave,
          motivo: 'confianca',
          texto: `${chave}: confiança ${String(campo.confianca)} - ${campo.fonte || doc.filename}`,
        });
      }
    }
  }

  const dados: Consolidado['dados'] = { operacao: {}, cedente: {}, sacado: {}, lastro: {} };
  const fontes: Record<string, string> = {};
  for (const [chave, v] of escolhido) {
    const ponto = chave.indexOf('.');
    if (ponto < 1) continue;
    const grupo = chave.slice(0, ponto) as keyof Consolidado['dados'];
    const campo = chave.slice(ponto + 1);
    if (!dados[grupo]) continue;
    dados[grupo][campo] = v.valor;
    if (v.fonte) fontes[chave] = `${v.fonte} · ${v.filename}`;
  }

  return { dados, revisar, avisos, fontes };
}

// ── Chave da extração → ids do formulário (espelha populateFromServer) ───────
// Serve para destacar na tela exatamente os campos que precisam de conferência.
const MAPA_CHAVE_CAMPOS: Record<string, string[]> = {
  'operacao.valor': ['op-valor'],
  'operacao.vencimento': ['op-vencimento'],
  'operacao.descricao': ['op-descricao'],

  'cedente.razao_social': ['op-cedente-nome', 'ced-razao'],
  'cedente.cnpj': ['op-cedente-cnpj', 'ced-cnpj'],
  'cedente.endereco': ['op-cedente-end', 'ced-endereco'],
  'cedente.cnae': ['ced-cnae'],
  'cedente.capital_social': ['ced-capital'],
  'cedente.fundacao': ['ced-fundacao'],
  'cedente.situacao': ['ced-situacao'],
  'cedente.representante_nome': ['ced-repr-nome'],
  'cedente.representante_cpf': ['ced-repr-cpf'],
  'cedente.representante_validade_cnh': ['ced-repr-validade'],
  'cedente.banco': ['ced-banco'],
  'cedente.agencia': ['ced-banco'],
  'cedente.conta': ['ced-banco'],
  'cedente.banco_cnpj_titular': ['ced-banco-cnpj'],
  'cedente.score_deps': ['ced-score'],
  'cedente.classificacao_deps': ['ced-class'],
  'cedente.limite_deps': ['ced-limite-deps'],
  'cedente.faturamento_presumido_deps': ['ced-fat-presumido'],
  'cedente.pontualidade_12m': ['ced-pont12'],
  'cedente.pontualidade_3m': ['ced-pont3'],
  'cedente.protestos': ['ced-protestos'],
  'cedente.protestos_valor': ['ced-protestos-val'],
  'cedente.pendencias': ['ced-pendencias'],
  'cedente.acoes_qtd': ['ced-acoes-qtd'],
  'cedente.acoes_valor': ['ced-acoes-val'],
  'cedente.faturamento_12m': ['ced-fat-total'],
  'cedente.receita_bruta_fiscal': ['ced-fat-total'],
  'cedente.patrimonio_liquido': ['ced-pl'],
  'cedente.capital_social_balanco': ['ced-capital-bal'],
  'cedente.disponibilidades': ['ced-disp'],
  'cedente.liquidez_real': ['ced-liq-real'],
  'cedente.resultado_exercicio': ['ced-resultado'],

  'sacado.razao_social': ['op-sacado-nome', 'sac-razao'],
  'sacado.cnpj': ['op-sacado-cnpj', 'sac-cnpj'],
  'sacado.endereco': ['op-sacado-end', 'sac-endereco'],
  'sacado.capital_social': ['sac-capital'],
  'sacado.faturamento_presumido': ['sac-fat-presumido'],
  'sacado.fundacao': ['sac-fundacao'],
  'sacado.porte': ['sac-porte'],
  'sacado.funcionarios': ['sac-func'],
  'sacado.filiais': ['sac-filiais'],
  'sacado.score_deps': ['sac-score'],
  'sacado.classificacao_deps': ['sac-class'],
  'sacado.limite_deps': ['sac-limite-deps'],
  'sacado.pontualidade_12m': ['sac-pont12'],
  'sacado.pontualidade_3m': ['sac-pont3'],
  'sacado.protestos': ['sac-protestos'],
  'sacado.protestos_valor': ['sac-protestos-val'],
  'sacado.pendencias': ['sac-pendencias'],
  'sacado.acoes_qtd': ['sac-acoes-qtd'],
  'sacado.acoes_valor': ['sac-acoes-val'],

  'lastro.tipo_documento': ['lastro-tipo-doc'],
  'lastro.numero': ['lastro-numero'],
  'lastro.emissao': ['lastro-emissao'],
  'lastro.valor': ['lastro-valor', 'op-valor'],
  'lastro.vencimento': ['lastro-vencimento'],
  'lastro.descricao': ['lastro-desc', 'op-descricao'],
  'lastro.banco_nf': ['lastro-banco-nf'],
  'lastro.agencia_nf': ['lastro-banco-nf'],
  'lastro.conta_nf': ['lastro-banco-nf'],
  'lastro.prestador_nome': ['op-cedente-nome'],
  'lastro.prestador_cnpj': ['op-cedente-cnpj'],
  'lastro.tomador_nome': ['op-sacado-nome'],
  'lastro.tomador_cnpj': ['op-sacado-cnpj'],
};

/** Converte as chaves a conferir nos ids de campo do formulário. */
export function camposParaRevisar(chaves: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const chave of chaves) {
    for (const id of MAPA_CHAVE_CAMPOS[chave] ?? []) out.add(id);
  }
  return out;
}
