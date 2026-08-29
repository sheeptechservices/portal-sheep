// Normaliza a resposta da consulta DEPS (depsmix / Smart PJ) nos campos da Análise de Crédito.
// Retorna: `deps` (campos de crédito por sufixo) e `empresa` (cadastrais).

function fmtBRL(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
}

function isoToBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// "Nada consta" → bloco sem ocorrências
function nadaConsta(bloco: any): boolean {
  return !!bloco && bloco.success === true && /nada consta/i.test(String(bloco.message ?? '')) && bloco.data == null;
}

// Quantidade dentro de um bloco genérico (data array, ou {total/quantidade}, ou nada consta = 0)
function qtdDe(bloco: any): string | null {
  if (!bloco) return null;
  if (nadaConsta(bloco)) return '0';
  const d = bloco.data;
  if (d == null) return null;
  if (Array.isArray(d)) return String(d.length);
  const t = d.total ?? d.quantidade ?? d.totalAcoes ?? d.qtd;
  return t != null ? String(t) : null;
}

export interface DepsNormalized {
  deps: Record<string, string>;     // sufixos: score, class, limite-deps, fat-presumido, pont12, pont3, protestos, protestos-val, pendencias, acoes-qtd, acoes-val
  empresa: Record<string, string>;  // razao, cnpj, situacao, cnae, capital, fundacao, porte, endereco, func, filiais
  resumo: string;
}

export function normalizeDepsMix(resultado: any): DepsNormalized {
  const mix = resultado?.mix ?? resultado ?? {};
  // Cadastrais: PJ vem em `empresa`, PF em `pessoa`
  const empData = mix.empresa?.data ?? null;
  const pesData = mix.pessoa?.data ?? null;
  const emp = empData ?? pesData ?? {};
  const isPF = !empData && !!pesData;
  const fat = mix.faturamentoPresumido?.data ?? null;
  const acoes = mix.acoesJudiciais?.data ?? null;
  const score = mix.score?.data ?? null;
  const classif = mix.smart?.data?.classificacao ?? null;

  // Pontualidade - média do histórico de pagamento resumido
  const hist = mix.comportamentalResumido?.data?.historicoPagamentoResumido?.data;
  let pont12 = '';
  if (Array.isArray(hist) && hist.length) {
    const vals = hist.map((h: any) => h?.pontualidade).filter((v: any) => typeof v === 'number');
    if (vals.length) pont12 = String(Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length));
  }

  // Pontualidade via indicadores (alguns produtos, ex. Smart PJ 022) - códigos por janela
  const indicadores: any[] = mix.indicadores?.data?.indicadores ?? [];
  const indVal = (codigo: string): string => {
    const f = indicadores.find((i: any) => i?.codigo === codigo);
    return f?.valor != null ? String(f.valor) : '';
  };
  const pont12Ind = indVal('PP_PD_CPG02_SCPJ'); // Pagamentos pontuais - 12 meses
  const pont3Ind = indVal('GC_PD_REC01_SCPJ');  // Pagamentos pontuais - 3 meses
  if (pont12Ind) pont12 = pont12Ind;

  const deps: Record<string, string> = {};
  const set = (k: string, v: any) => { if (v != null && String(v).trim() !== '') deps[k] = String(v); };

  set('score', score?.score);
  // Classificação: bloco "smart" (Smart PJ 005) ou risco do score (Smart PJ 022)
  set('class', classif?.classificacao ?? score?.risco);
  set('limite-deps', fmtBRL(classif?.limiteSugerido));
  set('fat-presumido', fat?.faturamentoPresumido ?? (fat?.valor ? fmtBRL(fat.valor) : ''));
  set('pont12', pont12);
  set('pont3', pont3Ind);

  // Protestos
  const protestosQtd = qtdDe(mix.protestos);
  set('protestos', protestosQtd);
  set('protestos-val', nadaConsta(mix.protestos) ? '0' : fmtBRL(mix.protestos?.data?.valorTotal));

  // Pendências / restrições
  set('pendencias', nadaConsta(mix.pendenciasRestricoes) ? 'Nada consta' : (mix.pendenciasRestricoes?.data ? qtdDe(mix.pendenciasRestricoes) : ''));

  // Ações judiciais
  set('acoes-qtd', acoes?.totalAcoes != null ? String(acoes.totalAcoes) : qtdDe(mix.acoesJudiciais));
  set('acoes-val', acoes?.valorTotal != null ? fmtBRL(acoes.valorTotal) : '');

  // Cadastrais - PJ (empresa) ou PF (pessoa)
  const empresa: Record<string, string> = {};
  const setE = (k: string, v: any) => { if (v != null && String(v).trim() !== '') empresa[k] = String(v); };
  setE('razao', emp.razaoSocial ?? emp.nome ?? emp.nomeCompleto);
  setE('cnpj', emp.cnpj ?? emp.cpf ?? emp.documento);
  setE('endereco', [emp.endereco ?? emp.logradouro, emp.numero, emp.complemento, emp.bairro, [emp.municipio ?? emp.cidade, emp.uf].filter(Boolean).join('/'), emp.cep]
    .filter(Boolean).join(', '));
  if (!isPF) {
    // Campos exclusivos de PJ
    setE('situacao', emp.situacaoCadastral);
    setE('cnae', emp.cnaePrincipal);
    setE('capital', fmtBRL(emp.capitalSocial));
    setE('fundacao', isoToBR(emp.dataInicioAtividade));
    setE('porte', emp.porte);
    setE('func', emp.quantidadeFuncionarios);
    setE('filiais', emp.quantidadeFiliais != null ? String(emp.quantidadeFiliais) : '');
  }

  const pontConceito = mix.analiseRisco?.data?.pontualidade?.conceito;
  const resumoPartes: string[] = [];
  if (score?.score) resumoPartes.push(`Score ${score.score}${score?.risco ? ` (risco ${score.risco})` : ''}`);
  if (classif?.classificacao) resumoPartes.push(`Classe ${classif.classificacao}`);
  if (classif?.limiteSugerido) resumoPartes.push(`Limite sugerido R$ ${fmtBRL(classif.limiteSugerido)}`);
  if (pontConceito) resumoPartes.push(`Pontualidade ${pontConceito}`);
  if (acoes?.totalAcoes) resumoPartes.push(`${acoes.totalAcoes} ação(ões) R$ ${fmtBRL(acoes.valorTotal)}`);
  const resumo = resumoPartes.join(' · ');

  return { deps, empresa, resumo };
}
