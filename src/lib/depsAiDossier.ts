// Dossiê DEPS para a IA - extrai do payload BRUTO da consulta tudo o que importa
// para uma análise de crédito, em forma compacta.
//
// Por que não mandar o bruto direto: o payload tem ~50-150 KB, 46 blocos, e a
// maior parte vem `null` com "Sem informação". Jogar isso no prompt gasta ~15k
// tokens por parte quase todos em plumbing (ids, envelopes success/message/info,
// campos repetidos), afogando o sinal. Aqui fica o oposto: linhas de detalhe que
// a IA nunca viu (regras do parecer, ocorrência por ocorrência de pendência,
// sócios com data de entrada, pontualidade mês a mês) e nada de estrutura morta.
//
// Três garantias:
//  1. Números continuam números - a IA precisa poder somar e comparar.
//  2. `blocos_sem_ocorrencia` preserva a diferença entre "consultado e limpo"
//     (sinal positivo de crédito) e "não consultado" (lacuna). Isso muda parecer.
//  3. `blocos_nao_mapeados` recebe o que não tem extrator dedicado, então bloco
//     novo da DEPS chega à IA mesmo antes de alguém mexer aqui.

/** Teto de caracteres do dossiê serializado, por parte. */
const LIMITE_CHARS = 24000;
/** Teto de linhas por lista de detalhe, para uma parte não monopolizar o prompt. */
const LIMITE_LINHAS = 40;

function num(v: any): number | null {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
}

function txt(v: any): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Datas em ISO curto (YYYY-MM-DD) - sem ambiguidade dd/mm vs mm/dd para o modelo. */
function data(v: any): string | null {
  if (!v) return null;
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : txt(v);
}

function bool(v: any): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v == null || v === '') return null;
  return /^(s|sim|1|true|optante)/i.test(String(v).trim());
}

/** Remove chaves nulas/vazias - recursivamente. Objeto/array que esvazia virá undefined. */
function enxuga(v: any): any {
  if (Array.isArray(v)) {
    const arr = v.map(enxuga).filter(x => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (v && typeof v === 'object') {
    const o: Record<string, any> = {};
    for (const [k, x] of Object.entries(v)) {
      const y = enxuga(x);
      if (y !== undefined) o[k] = y;
    }
    return Object.keys(o).length ? o : undefined;
  }
  if (v === null || v === '' || v === undefined) return undefined;
  return v;
}

/**
 * Colapsa envelopes `{success, message, info, data}` que a DEPS aninha dentro de
 * blocos (ex.: os 4 sub-blocos de cheques). Sem isso, `success: true` e
 * `info: null` vazam para o prompt sem informar nada - e um sub-bloco vazio
 * chegaria como `{}` em vez da mensagem "Nada consta.", que é o dado útil.
 */
function desenvelopa(v: any): any {
  if (Array.isArray(v)) return v.map(desenvelopa);
  if (!v || typeof v !== 'object') return v;
  const chaves = Object.keys(v);
  const ehEnvelope = chaves.includes('success') && (chaves.includes('data') || chaves.includes('message'));
  if (ehEnvelope) {
    const d = (v as any).data;
    if (d == null || (Array.isArray(d) && d.length === 0)) return txt((v as any).message) ?? undefined;
    return desenvelopa(d);
  }
  const o: Record<string, any> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === 'info') continue;
    o[k] = desenvelopa(x);
  }
  return o;
}

/** Corta a lista no teto e devolve também quantas linhas ficaram de fora. */
function corta<T>(arr: T[] | undefined | null, limite = LIMITE_LINHAS): { itens: T[]; omitidas?: number } {
  const a = Array.isArray(arr) ? arr : [];
  if (a.length <= limite) return { itens: a };
  return { itens: a.slice(0, limite), omitidas: a.length - limite };
}

/** Nomes de bloco → rótulo legível, para a lista de "consultado e sem ocorrência". */
const ROTULOS: Record<string, string> = {
  protestos: 'protestos',
  acoesJudiciais: 'ações judiciais',
  falenciasRecuperacaoJudicial: 'falências e recuperação judicial',
  restricao: 'restrições',
  restricoesCheques: 'restrições de cheques',
  pendenciasRestricoes: 'pendências e restrições',
  participacaoEmpresa: 'participações da empresa',
  consultasDetalhadas: 'consultas detalhadas',
  indicadoresBoleto: 'indicadores de pagamento a fornecedores',
  scr: 'SCR (Banco Central)',
  balanco: 'balanço',
  sintegra: 'Sintegra',
  suframa: 'Suframa',
  vinculoEmpregaticio: 'vínculo empregatício',
  redeRelacionamentoSocio: 'rede de relacionamento dos sócios',
  grupoComponentes: 'grupo econômico',
  comportamental: 'comportamental',
  consultas: 'consultas',
};

/** Blocos com extrator dedicado - o resto cai em `blocos_nao_mapeados`. */
const MAPEADOS = new Set([
  'empresa', 'pessoa', 'faturamentoPresumido', 'smart', 'score', 'analiseRisco',
  'comportamentalResumido', 'pendenciasRestricoes', 'protestos', 'acoesJudiciais',
  'restricoesCheques', 'falenciasRecuperacaoJudicial', 'quadroSocietario',
  'relacaoEmpresaParticipacaoSocio', 'contatosPreferenciais', 'emails', 'outrosEnderecos',
]);

const META = new Set(['consultante', 'produto', 'dataConsulta', 'versaoProduto', 'versao',
  'isParcial', 'usuario', 'centroCusto', 'depsIa', 'blocosComErros', 'linkCompartilhamento',
  'historicoConsultaId', 'isGrupo', 'share']);

export interface DepsDossier {
  [k: string]: any;
  /** Avisos de truncamento - nunca corta em silêncio. */
  _truncado?: string[];
}

/**
 * Monta o dossiê compacto a partir do payload bruto da consulta DEPS.
 * Retorna null se o payload não tiver nada aproveitável.
 */
export function buildDepsAiDossier(raw: any): DepsDossier | null {
  const mix = raw?.mix ?? raw;
  if (!mix || typeof mix !== 'object') return null;

  const avisos: string[] = [];
  const dado = (chave: string) => {
    const b = mix[chave];
    if (b === undefined || b === null) return undefined;
    return b?.data !== undefined ? b.data : b;
  };

  const emp = dado('empresa');
  const pes = dado('pessoa');
  const fat = dado('faturamentoPresumido');
  const smart = dado('smart');
  const score = dado('score');
  const ar = dado('analiseRisco');
  const cr = dado('comportamentalResumido');
  const pend = dado('pendenciasRestricoes');
  const qs = dado('quadroSocietario');

  // ── Cadastro ──────────────────────────────────────────────────────────────
  const cadastro = emp ? {
    razao_social: txt(emp.razaoSocial),
    nome_fantasia: txt(emp.nomeFantasia),
    cnpj: txt(emp.cnpj),
    fundacao: data(emp.dataInicioAtividade),
    situacao_receita: txt(emp.situacaoCadastral),
    data_situacao: data(emp.dataSituacaoCadastral),
    motivo_situacao: txt(emp.motivoSituacaoCadastral),
    tipo_unidade: txt(emp.tipoUnidade),
    porte: txt(emp.porte),
    capital_social: num(emp.capitalSocial),
    natureza_juridica: txt(emp.naturezaJuridica),
    cnae_principal: txt(emp.cnaePrincipal),
    cnaes_secundarios: corta(Array.isArray(emp.cnaesSecundarios) ? emp.cnaesSecundarios.map(txt) : [], 10).itens,
    municipio_uf: txt([txt(emp.municipio), txt(emp.uf)].filter(Boolean).join(' - ')),
    qtd_funcionarios: num(emp.quantidadeFuncionarios),
    qtd_filiais: num(emp.quantidadeFiliais),
    optante_simples: txt(emp.opcaoPeloSimples),
    mei: bool(emp.opcaoMei),
  } : pes ? {
    nome: txt(pes.nome),
    cpf: txt(pes.cpf ?? pes.documento),
    nascimento: data(pes.dataNascimento),
    idade: num(pes.idade),
    situacao_cpf: txt(pes.situacaoCadastral ?? pes.situacao),
    estado_civil: txt(pes.estadoCivil),
    profissao: txt(pes.profissao),
    municipio_uf: txt([txt(pes.municipio), txt(pes.uf)].filter(Boolean).join(' - ')),
  } : undefined;

  const faturamento = fat ? {
    faixa: txt(fat.faturamentoPresumido),
    valor: num(fat.valor),
    valor_minimo: num(fat.valorMinimo),
    valor_maximo: num(fat.valorMaximo),
  } : undefined;

  // ── Parecer da política de crédito da própria DEPS ────────────────────────
  // O mais valioso e o que a IA nunca via: QUAIS regras falharam e por quê.
  const par = smart?.parecer;
  const gruposCortados = corta(Array.isArray(par?.resultadoParecer) ? par.resultadoParecer : []);
  if (gruposCortados.omitidas) avisos.push(`parecer: ${gruposCortados.omitidas} grupos de regras omitidos`);
  const parecer_deps = par ? {
    aprovado: par.aprovado === true,
    motivo: txt(par.motivo),
    limite_requisitado: num(par.limiteRequisitado),
    grupos_de_regras: gruposCortados.itens.map((g: any) => ({
      nome: txt(g?.nome),
      atendido: g?.atendido === true,
      pct_esperado: num(g?.percentualEsperado),
      pct_atingido: num(g?.percentual),
      regras: corta(Array.isArray(g?.regras) ? g.regras : [], 12).itens.map((r: any) => ({
        descricao: txt(r?.descricao),
        atendido: r?.atendido === true,
        obrigatorio: r?.obrigatorio === true,
        resultado: txt(r?.resultado),
        motivo: txt(r?.motivo),
      })),
    })),
  } : undefined;

  // ── Smart: classificação, limite e o que puxou pra cima/baixo ─────────────
  const cl = smart?.classificacao;
  const smart_resumo = smart ? {
    classificacao: txt(cl?.classificacao),
    limite_sugerido: num(cl?.limiteSugerido),
    validade: data(cl?.validade),
    pontuacao_atingida: num(cl?.pontuacaoAtingida),
    politica: txt(cl?.politica),
    ticket_medio: num(cl?.ticketMedio),
    pontos_positivos: corta(Array.isArray(smart.positivas) ? smart.positivas : [], 20).itens.map((x: any) => ({
      metrica: txt(x?.metrica), descricao: txt(x?.descricao),
      impacto_politica_pct: num(x?.impacto), impacto_metrica_pct: num(x?.percentualMetrica),
    })),
    pontos_negativos: corta(Array.isArray(smart.negativas) ? smart.negativas : [], 20).itens.map((x: any) => ({
      metrica: txt(x?.metrica), descricao: txt(x?.descricao),
      impacto_politica_pct: num(x?.impacto), impacto_metrica_pct: num(x?.percentualMetrica),
    })),
    faixas_de_limite: corta(Array.isArray(smart.todasClassificacoes) ? smart.todasClassificacoes : [], 12).itens.map((x: any) => ({
      classificacao: txt(x?.nome), limite_minimo: num(x?.limiteMinimo), limite_maximo: num(x?.limiteMaximo),
      pontuacao: num(x?.pontuacaoAtingida),
    })),
    historico_classificacao: corta(Array.isArray(smart.historicoClassificacao) ? smart.historicoClassificacao : [], 12)
      .itens.map((h: any) => ({ data: data(h?.dataHora), classificacao: txt(h?.classificacao) })),
  } : undefined;

  // ── Score ─────────────────────────────────────────────────────────────────
  const score_resumo = score ? {
    score: num(score.score),
    score_boleto: num(score.scoreBoleto),
    risco: txt(score.risco),
    descricao: txt(score.descricao),
    probabilidade_pagamento: txt(score.probabilidadePagamento),
    motivos: corta(Array.isArray(score.motivos) ? score.motivos.map(txt).filter(Boolean) : [], 10).itens,
    referencia_faixas: '300-553 muito alto | 554-725 alto | 726-874 médio | 875-937 baixo | 938-1000 muito baixo',
  } : undefined;

  // ── Indicadores de risco das instituições financeiras ─────────────────────
  const risco_indicadores = ar ? Object.entries(ar)
    .filter(([k, v]) => !['success', 'message', 'info'].includes(k) && v && typeof v === 'object')
    .map(([grupo, c]: [string, any]) => ({
      grupo,
      conceito: txt(c?.conceito),
      pontuacao: num(c?.pontuacao),
      escala: num(c?.pontuacaoMax) != null ? `0-${num(c?.pontuacaoMax)}` : null,
      indicadores: corta(Array.isArray(c?.indicadores) ? c.indicadores : [], 25).itens
        .filter((i: any) => i?.semInformacao !== true)
        .map((i: any) => ({
          nome: txt(i?.descricaoIndicador) ?? txt(i?.indicador),
          conceito: Array.isArray(i?.conceitos) ? txt(i.conceitos[0]) : null,
          pontuacao: num(i?.pontuacao),
          parecer: txt(i?.parecer),
        })),
      indicadores_sem_informacao: corta(Array.isArray(c?.indicadores) ? c.indicadores : [], 25).itens
        .filter((i: any) => i?.semInformacao === true)
        .map((i: any) => txt(i?.descricaoIndicador) ?? txt(i?.indicador)),
    })) : undefined;

  // ── Pontualidade mês a mês ────────────────────────────────────────────────
  const histPag = corta(Array.isArray(cr?.historicoPagamentoResumido?.data) ? cr.historicoPagamentoResumido.data : [], 24);
  if (histPag.omitidas) avisos.push(`histórico de pagamento: ${histPag.omitidas} períodos omitidos`);
  const pontualidade = histPag.itens.length ? histPag.itens.map((l: any) => ({
    periodo: txt(l?.periodo),
    pontual_pct: num(l?.pontualidade),
    compromissos: txt(l?.compromisso?.faixa),
    credito_obtido: txt(l?.creditoObtido?.faixa),
    atrasos: (Array.isArray(l?.faixaPontualidadeAtraso) ? l.faixaPontualidadeAtraso : [])
      .filter((f: any) => num(f?.pontualidade))
      .reduce((acc: Record<string, number>, f: any) => {
        const k = txt(f?.descricao);
        if (k) acc[k] = num(f?.pontualidade)!;
        return acc;
      }, {}),
  })) : undefined;

  const endividamento = corta(Array.isArray(cr?.endividamento?.data) ? cr.endividamento.data : [], 24)
    .itens.map((l: any) => ({ periodo: txt(l?.periodo), compromisso: txt(l?.compromisso?.faixa), credito: txt(l?.credito?.faixa) }));

  // ── Pendências e restrições, com a ocorrência detalhada ───────────────────
  const ocorr = corta(Array.isArray(pend?.ocorrencias) ? pend.ocorrencias : []);
  if (ocorr.omitidas) avisos.push(`pendências: ${ocorr.omitidas} ocorrências omitidas`);
  const pendencias = pend ? {
    quantidade: num(pend.totalPendencias),
    valor_total: num(pend.valor),
    total_credores: num(pend.totalCredores),
    nivel_cobertura: txt(pend.nivel),
    primeira: { data: data(pend.dataPrimeiro), valor: num(pend.valorPrimeiro) },
    maior: { data: data(pend.dataMaior), valor: num(pend.valorMaior) },
    ocorrencias: ocorr.itens.map((o: any) => ({
      informante: txt(o?.informante),
      tipo_participante: txt(o?.tipoParticipante),
      contrato: txt(o?.numeroContrato),
      valor: num(o?.valor),
      data_debito: data(o?.dataDebito),
      disponivel_em: data(o?.disponivelEm),
      uf: txt(o?.uf),
      cidade: txt(o?.cidade),
    })),
  } : undefined;

  // ── Quadro societário e empresas dos sócios ───────────────────────────────
  const socios = corta(Array.isArray(qs?.quadroSocietario) ? qs.quadroSocietario : (Array.isArray(qs) ? qs : []));
  if (socios.omitidas) avisos.push(`quadro societário: ${socios.omitidas} sócios omitidos`);
  const quadro_societario = socios.itens.length ? socios.itens.map((s: any) => ({
    nome: txt(s?.nome),
    documento: txt(s?.documento),
    cargo: txt(s?.cargoSociedade),
    participacao_pct: num(s?.participacao),
    data_entrada: data(s?.dataEntrada),
    data_saida: data(s?.dataSaida),
    situacao: txt(s?.situacao),
    tem_restricao: bool(s?.restricao),
    alerta: txt(s?.alerta),
  })) : undefined;

  const rel = dado('relacaoEmpresaParticipacaoSocio');
  const empresas_dos_socios: any[] = [];
  if (rel && typeof rel === 'object') {
    for (const [socio, lista] of Object.entries(Array.isArray(rel) ? { '': rel } : rel)) {
      if (!Array.isArray(lista)) continue;
      for (const x of corta(lista, 25).itens as any[]) {
        empresas_dos_socios.push({
          socio: txt(socio) ?? undefined,
          cnpj: txt(x?.cnpj), nome: txt(x?.nome), situacao: txt(x?.situacao),
          cargo: txt(x?.cargo), participacao_pct: num(x?.participacao),
          data_entrada: data(x?.dataEntrada),
        });
      }
    }
  }

  // ── Restritivos com estrutura variável → genérico enxuto ──────────────────
  const restritivo = (chave: string) => {
    const d = dado(chave);
    return d == null ? undefined : enxuga(desenvelopa(d));
  };

  // ── Consultado e SEM ocorrência: sinal positivo, precisa chegar à IA ──────
  const blocos_sem_ocorrencia: string[] = [];
  for (const [chave, b] of Object.entries(mix)) {
    if (META.has(chave)) continue;
    const bloco: any = b;
    if (!bloco || typeof bloco !== 'object') continue;
    const d = bloco?.data !== undefined ? bloco.data : bloco;
    if (d != null && !(Array.isArray(d) && d.length === 0)) continue;
    const msg = txt(bloco?.message);
    if (!msg) continue;
    blocos_sem_ocorrencia.push(`${ROTULOS[chave] ?? chave}: ${msg}`);
  }

  // ── Blocos sem extrator dedicado - nada se perde ──────────────────────────
  const blocos_nao_mapeados: Record<string, any> = {};
  for (const [chave, b] of Object.entries(mix)) {
    if (META.has(chave) || MAPEADOS.has(chave)) continue;
    const bloco: any = b;
    const d = bloco?.data !== undefined ? bloco.data : bloco;
    const limpo = enxuga(desenvelopa(d));
    if (limpo !== undefined) blocos_nao_mapeados[chave] = limpo;
  }

  const dossier: DepsDossier = {
    produto: txt(mix.produto),
    data_consulta: data(mix.dataConsulta),
    consulta_parcial: mix.isParcial === true ? true : undefined,
    cadastro,
    faturamento_presumido: faturamento,
    parecer_da_deps: parecer_deps,
    smart: smart_resumo,
    score: score_resumo,
    risco_instituicoes_financeiras: risco_indicadores,
    pontualidade_mensal: pontualidade,
    endividamento_mensal: endividamento.length ? endividamento : undefined,
    pendencias_restricoes: pendencias,
    protestos: restritivo('protestos'),
    acoes_judiciais: restritivo('acoesJudiciais'),
    falencias_recuperacao_judicial: restritivo('falenciasRecuperacaoJudicial'),
    restricoes_cheques: restritivo('restricoesCheques'),
    quadro_societario,
    empresas_dos_socios: empresas_dos_socios.length ? empresas_dos_socios : undefined,
    contatos: corta(Array.isArray(dado('contatosPreferenciais')) ? dado('contatosPreferenciais') : [], 8)
      .itens.map((c: any) => txt(c?.telefone)).filter(Boolean),
    emails: corta(Array.isArray(dado('emails')) ? dado('emails') : [], 8)
      .itens.map((c: any) => txt(typeof c === 'string' ? c : c?.email)).filter(Boolean),
    blocos_sem_ocorrencia: blocos_sem_ocorrencia.length ? blocos_sem_ocorrencia : undefined,
    blocos_nao_mapeados: Object.keys(blocos_nao_mapeados).length ? blocos_nao_mapeados : undefined,
  };

  const limpo: DepsDossier = enxuga(dossier) ?? {};

  // Último recurso: se estourar o teto, poda progressivamente os blocos de menor
  // valor por token até caber, sempre avisando. Nunca truncamento silencioso.
  let serializado = JSON.stringify(limpo);
  const ordemPoda: (keyof DepsDossier)[] = [
    'blocos_nao_mapeados', 'empresas_dos_socios', 'risco_instituicoes_financeiras',
    'endividamento_mensal', 'pontualidade_mensal', 'blocos_sem_ocorrencia',
  ];
  for (const chave of ordemPoda) {
    if (serializado.length <= LIMITE_CHARS) break;
    if ((limpo as any)[chave] !== undefined) {
      delete (limpo as any)[chave];
      avisos.push(`${chave} removido por tamanho - consulte o relatório completo`);
      serializado = JSON.stringify(limpo);
    }
  }
  if (serializado.length > LIMITE_CHARS) {
    avisos.push(`dossiê excede ${LIMITE_CHARS} caracteres (${serializado.length}) - algumas listas podem estar incompletas`);
  }

  if (avisos.length) limpo._truncado = avisos;
  return Object.keys(limpo).length ? limpo : null;
}
