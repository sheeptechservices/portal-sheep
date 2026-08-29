// Parser por heurística (regex) - converte o texto extraído (pdfjs/OCR) nos campos
// da Análise de Crédito. Sem IA/token. Best-effort: quando não tem certeza, deixa null.
//
// Saída no MESMO formato que populateFromServer espera:
//   { files: [{filename, type}], dados: { operacao, cedente, sacado, lastro },
//     analise, documentos_faltantes, adequacoes_sugeridas }

import type { ExtractedDoc } from './ocrExtractor';

// ── Helpers numéricos / texto ────────────────────────────────────────────────
function norm(s: string): string {
  // normaliza acentos para casar rótulos mesmo com OCR imperfeito
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function digits(s: string): string { return s.replace(/\D/g, ''); }

function fmtCNPJ(d: string): string {
  if (d.length !== 14) return d;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
function fmtCPF(d: string): string {
  if (d.length !== 11) return d;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

// Pega o trecho a partir do match da regex + `after` chars
function ctxAt(text: string, re: RegExp, after = 200): string | null {
  const m = re.exec(text);
  if (!m) return null;
  return text.slice(m.index, Math.min(text.length, m.index + after));
}

// Primeiro valor monetário "1.234.567,89" no trecho
function firstBRL(s: string): string | null {
  const m = s.match(/\d{1,3}(?:\.\d{3})*,\d{2}/);
  return m ? m[0] : null;
}
function largestBRL(s: string): string | null {
  const all = [...s.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(m => m[0]);
  if (!all.length) return null;
  return all.sort((a, b) => parseFloat(b.replace(/\./g,'').replace(',','.')) - parseFloat(a.replace(/\./g,'').replace(',','.')))[0];
}

function firstDate(s: string): string | null {
  const m = s.match(/\d{2}\/\d{2}\/\d{4}/);
  return m ? m[0] : null;
}

// Score 0 a 1000 próximo do rótulo "score"
function findScore(text: string): string | null {
  const t = norm(text);
  const m = t.match(/score[^\d]{0,20}(\d{2,4})/i);
  if (m) { const n = parseInt(m[1], 10); if (n >= 0 && n <= 1000) return String(n); }
  return null;
}

// Quantidade + valor após um rótulo (ex.: "Protestos", "Ações")
function findQtdValor(text: string, label: RegExp): { qtd: string | null; valor: string | null } {
  const ctx = ctxAt(norm(text), label, 160);
  if (!ctx) return { qtd: null, valor: null };
  const qtdM = ctx.match(/(\d{1,4})\s*(?:ocorr|registro|protesto|aca|acao|titulo|t[ií]tulo)/i)
            ?? ctx.match(/[:\s](\d{1,3})\b/);
  const valor = largestBRL(ctx);
  return { qtd: qtdM ? String(parseInt(qtdM[1], 10)) : null, valor };
}

function findPercent(text: string, label: RegExp): string | null {
  const ctx = ctxAt(norm(text), label, 80);
  if (!ctx) return null;
  const m = ctx.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
  return m ? m[1].replace('.', ',') : null;
}

// Valor monetário após um rótulo
function valorAfter(text: string, label: RegExp, after = 90): string | null {
  const ctx = ctxAt(norm(text), label, after);
  return ctx ? largestBRL(ctx) : null;
}

// Razão social após "Nome/Razão Social:" (mesma linha ou próxima)
function nomeAfter(ctx: string): string | null {
  const m = norm(ctx).match(/(?:nome\s*\/?\s*raz[ao]+\s+social|raz[ao]+\s+social|nome\s+empresarial)\s*:?\s*/i);
  if (!m) return null;
  const after = ctx.slice((m.index ?? 0) + m[0].length);
  const sameLine = after.match(/^[ \t]*([^\n\r:]{3,80})/);
  if (sameLine && sameLine[1].trim().length >= 3) return clean(sameLine[1]);
  for (const line of after.split('\n')) {
    const t = line.trim();
    if (t.length < 3 || t.includes(':')) continue;
    if (/^\d[\d.\-/\s]{8,}/.test(t)) continue;
    return clean(t);
  }
  return null;
}
function clean(s: string): string {
  return s.trim()
    .replace(/\s+(?:CPF\/?CNPJ?|CNPJ|Inscri|Endere|Munic|E-?mail|UF|CEP)\b.*/i, '')
    .replace(/\s+/g, ' ').trim();
}

// CNPJ dentro de um trecho
function cnpjIn(s: string): string | null {
  const m = s.match(/\d{2}[\s.]?\d{3}[\s.]?\d{3}[\s/]?\d{4}[\s-]?\d{2}/);
  if (!m) return null;
  const d = digits(m[0]);
  return d.length === 14 ? d : null;
}
function cpfCnpjIn(s: string): { value: string; isCnpj: boolean } | null {
  const c = cnpjIn(s);
  if (c) return { value: c, isCnpj: true };
  const m = s.match(/\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{2}(?!\d)/);
  if (m) { const d = digits(m[0]); if (d.length === 11) return { value: d, isCnpj: false }; }
  return null;
}

// ── Tipo de documento ────────────────────────────────────────────────────────
function detectTipo(text: string): string {
  const t = norm(text).toLowerCase();
  if (/nfs-?e|nota fiscal( eletr)?|prestador de servic|tomador de servic/.test(t)) return 'Nota Fiscal';
  if (/quod|serasa|deps|score de cr[eé]dito|relat[oó]rio de cr[eé]dito|verifiq/.test(t)) return 'Relatório de Crédito';
  if (/balan[cç]o patrimonial|demonstra[cç][aã]o do resultado|\bdre\b|ativo circulante|patrim[oô]nio l[ií]quido/.test(t)) return 'Balanço/DRE';
  if (/contrato social|altera[cç][aã]o contratual|instrumento particular/.test(t)) return 'Contrato Social';
  if (/carteira nacional de habilita|\bcnh\b|registro geral|\brg\b/.test(t)) return 'Identidade (CNH/RG)';
  if (/irpj|\becf\b|\bdefis\b|escritura[cç][aã]o cont[aá]bil fiscal/.test(t)) return 'IRPJ/ECF/DEFIS';
  if (/comprovante de endere[cç]o|fatura|conta de (luz|energia|[aá]gua)/.test(t)) return 'Comprovante de Endereço';
  if (/extrato|ag[eê]ncia|conta corrente|banco/.test(t)) return 'Dados Bancários';
  return 'Documento';
}

// ── Extrações específicas ─────────────────────────────────────────────────────
function parseNotaFiscal(text: string) {
  // Cedente = Prestador/Emitente | Sacado = Tomador/Destinatário
  const cedStart = norm(text).search(/emitente|prestador/i);
  const cedCtx = cedStart >= 0 ? text.slice(cedStart, cedStart + 400) : text.slice(0, 400);
  const sacStart = norm(text).search(/destinat[aá]rio|tomador|sacado|pagador/i);
  const sacCtx = sacStart >= 0 ? text.slice(sacStart, sacStart + 400) : '';

  const prestadorCnpj = cnpjIn(cedCtx);
  const tomadorDoc = cpfCnpjIn(sacCtx);
  const prestadorNome = nomeAfter(cedCtx);
  const tomadorNome = nomeAfter(sacCtx);

  const numero = (() => {
    for (const re of [
      /n[uú]mero\s+da\s+nota\s*:?\s*(\d{1,9})/i,
      /nota\s+fiscal\s+n[°ºo]?\s*:?\s*(\d{1,9})/i,
      /nfs?-?e?\s*n[°ºo.]?\s*(\d{1,9})/i,
    ]) { const m = re.exec(norm(text)); if (m) return String(parseInt(m[1], 10)); }
    return null;
  })();

  const emissao = firstDate(ctxAt(norm(text), /emiss[aã]o|emitida em/i, 120) ?? '');
  const vencimento = firstDate(ctxAt(norm(text), /vencimento|venc\.?/i, 80) ?? '');
  const valor = valorAfter(text, /valor\s+(?:total|l[ií]quido|dos servi|da nota|do documento)/i, 100)
             ?? largestBRL(text);

  return {
    prestadorNome, prestadorCnpj,
    tomadorNome, tomadorDoc,
    numero, emissao, vencimento, valor,
  };
}

interface CreditReport {
  cnpj: string | null;
  score: string | null;
  classificacao: string | null;
  protestos: string | null; protestos_valor: string | null;
  acoes_qtd: string | null; acoes_valor: string | null;
  pontualidade_12m: string | null; pontualidade_3m: string | null;
  faturamento_presumido: string | null;
  limite: string | null;
}
function parseCreditReport(text: string): CreditReport {
  const protest = findQtdValor(text, /protesto/i);
  const acoes = findQtdValor(text, /a[cç][oõ]es?\s+(?:judici|c[ií]ve)/i);
  const classM = norm(text).match(/classifica[cç][aã]o\s*:?\s*([A-E][+-]?|baix[oa]|m[eé]di[oa]|alt[oa])/i);
  return {
    cnpj: cnpjIn(text),
    score: findScore(text),
    classificacao: classM ? classM[1].toUpperCase() : null,
    protestos: protest.qtd, protestos_valor: protest.valor,
    acoes_qtd: acoes.qtd, acoes_valor: acoes.valor,
    pontualidade_12m: findPercent(text, /pontualidade(?:\s+12|.*12\s*m)/i) ?? findPercent(text, /pontualidade/i),
    pontualidade_3m: findPercent(text, /pontualidade.*3\s*m/i),
    faturamento_presumido: valorAfter(text, /faturamento\s+presumido|presun[cç][aã]o\s+de\s+faturamento/i, 120),
    limite: valorAfter(text, /limite\s+(?:de\s+cr[eé]dito|sugerido)/i, 80),
  };
}

function parseBalanco(text: string) {
  return {
    patrimonio_liquido: valorAfter(text, /patrim[oô]nio\s+l[ií]quido/i),
    faturamento_12m: valorAfter(text, /receita\s+(?:bruta|l[ií]quida|operacional)|faturamento\s+(?:anual|12)/i),
    receita_bruta_fiscal: valorAfter(text, /receita\s+bruta/i),
    capital_social_balanco: valorAfter(text, /capital\s+social/i),
    disponibilidades: valorAfter(text, /disponibilidad|caixa\s+e\s+equivalent/i),
    resultado_exercicio: valorAfter(text, /resultado\s+do\s+exerc[ií]cio|lucro\s+l[ií]quido|preju[ií]zo/i),
  };
}

// ── Orquestração ──────────────────────────────────────────────────────────────
export interface ParseResult {
  files: { filename: string; type: string }[];
  dados: {
    operacao: Record<string, any>;
    cedente: Record<string, any>;
    sacado: Record<string, any>;
    lastro: Record<string, any>;
  };
  analise: string;
  documentos_faltantes: string[];
  adequacoes_sugeridas: string[];
}

export function parseDocs(docs: ExtractedDoc[]): ParseResult {
  const files = docs.map(d => ({ filename: d.filename, type: detectTipo(d.text) }));

  const operacao: Record<string, any> = {};
  const cedente: Record<string, any> = {};
  const sacado: Record<string, any> = {};
  const lastro: Record<string, any> = {};

  // 1) Nota Fiscal → lastro + cedente/sacado básicos + operação
  const nf = docs.find(d => detectTipo(d.text) === 'Nota Fiscal');
  if (nf) {
    const n = parseNotaFiscal(nf.text);
    lastro.tipo_documento = 'NFS-e';
    if (n.numero) lastro.numero = n.numero;
    if (n.emissao) lastro.emissao = n.emissao;
    if (n.vencimento) lastro.vencimento = n.vencimento;
    if (n.valor) lastro.valor = n.valor;
    if (n.prestadorNome) { lastro.prestador_nome = n.prestadorNome; cedente.razao_social = n.prestadorNome; }
    if (n.prestadorCnpj) { lastro.prestador_cnpj = fmtCNPJ(n.prestadorCnpj); cedente.cnpj = fmtCNPJ(n.prestadorCnpj); }
    if (n.tomadorNome) { lastro.tomador_nome = n.tomadorNome; sacado.razao_social = n.tomadorNome; }
    if (n.tomadorDoc) {
      const v = n.tomadorDoc.isCnpj ? fmtCNPJ(n.tomadorDoc.value) : fmtCPF(n.tomadorDoc.value);
      lastro.tomador_cnpj = v; sacado.cnpj = v;
    }
    if (n.valor) operacao.valor = n.valor;
    if (n.vencimento) operacao.vencimento = n.vencimento;
  }

  // 2) Relatórios de crédito → cedente/sacado por CNPJ; senão 1º=cedente, 2º=sacado
  const reports = docs.filter(d => detectTipo(d.text) === 'Relatório de Crédito').map(d => parseCreditReport(d.text));
  const cedCnpj = digits(cedente.cnpj ?? '');
  const sacCnpj = digits(sacado.cnpj ?? '');
  let assignedSacado = false, assignedCedente = false;
  const applyReport = (target: Record<string, any>, r: CreditReport) => {
    if (r.score) target.score_deps = r.score;
    if (r.classificacao) target.classificacao_deps = r.classificacao;
    if (r.protestos) target.protestos = r.protestos;
    if (r.protestos_valor) target.protestos_valor = r.protestos_valor;
    if (r.acoes_qtd) target.acoes_qtd = r.acoes_qtd;
    if (r.acoes_valor) target.acoes_valor = r.acoes_valor;
    if (r.pontualidade_12m) target.pontualidade_12m = r.pontualidade_12m;
    if (r.pontualidade_3m) target.pontualidade_3m = r.pontualidade_3m;
    if (r.limite) target.limite_deps = r.limite;
  };
  for (const r of reports) {
    const rc = digits(r.cnpj ?? '');
    if (rc && sacCnpj && rc === sacCnpj) { applyReport(sacado, r); if (r.faturamento_presumido) sacado.faturamento_presumido = r.faturamento_presumido; assignedSacado = true; }
    else if (rc && cedCnpj && rc === cedCnpj) { applyReport(cedente, r); if (r.faturamento_presumido) cedente.faturamento_presumido_deps = r.faturamento_presumido; assignedCedente = true; }
    else if (!assignedCedente) { applyReport(cedente, r); if (r.faturamento_presumido) cedente.faturamento_presumido_deps = r.faturamento_presumido; assignedCedente = true; }
    else if (!assignedSacado) { applyReport(sacado, r); if (r.faturamento_presumido) sacado.faturamento_presumido = r.faturamento_presumido; assignedSacado = true; }
  }

  // 3) Balanço/DRE → financeiro do cedente
  const bal = docs.find(d => detectTipo(d.text) === 'Balanço/DRE');
  if (bal) {
    const b = parseBalanco(bal.text);
    for (const [k, v] of Object.entries(b)) if (v) cedente[k] = v;
  }

  // 4) Resumo gerado localmente
  const tipos = [...new Set(files.map(f => f.type))];
  const linhas: string[] = [];
  linhas.push(`Extração local (OCR/texto) de ${docs.length} documento(s): ${tipos.join(', ')}.`);
  if (cedente.razao_social || cedente.cnpj) linhas.push(`Cedente: ${cedente.razao_social ?? '-'}${cedente.cnpj ? ' (' + cedente.cnpj + ')' : ''}.`);
  if (sacado.razao_social || sacado.cnpj) linhas.push(`Sacado: ${sacado.razao_social ?? '-'}${sacado.cnpj ? ' (' + sacado.cnpj + ')' : ''}.`);
  if (cedente.score_deps) linhas.push(`Score cedente: ${cedente.score_deps}.`);
  if (sacado.score_deps) linhas.push(`Score sacado: ${sacado.score_deps}.`);
  if (operacao.valor || lastro.valor) linhas.push(`Valor identificado: R$ ${operacao.valor ?? lastro.valor}.`);
  linhas.push('Atenção: dados extraídos automaticamente por OCR/regex - revise e complete os campos.');

  return {
    files,
    dados: { operacao, cedente, sacado, lastro },
    analise: linhas.join(' '),
    documentos_faltantes: [],
    adequacoes_sugeridas: [],
  };
}
