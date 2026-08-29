// Planejamento do lote de propostas - porte de `_merge_notas_proposta` e do laço
// de `/gerar_lote` do "DUX Gerador de Propostas".
//
// A geração em si continua sendo a mesma de sempre (`/api/gerar-documento
// ?action=proposta`, um documento por chamada). O que vive aqui é só a decisão de
// *quais* propostas o lote produz: quais notas viram uma proposta agrupada, quais
// saem sozinhas, como as parcelas se combinam e qual modelo cada item usa.
//
// Tudo é função pura, sem rede: dá para conferir o plano na tela antes de gerar
// qualquer arquivo.
import type { Marca, TipoDoc } from './gerador';

export interface ParcelaLote {
  vencimento: string;
  /** Zero ou ausente significa "divide o valor a antecipar igualmente". */
  valor: number;
}

export interface NotaLote {
  clienteRazao: string;
  clienteCnpj: string;
  sacadoRazao: string;
  sacadoCnpj: string;
  valorTotal: number;
  /** Antecipação parcial; vazio significa antecipar o valor de face inteiro. */
  valorAntecipado?: number;
  numeroNf?: string;
  /** ISO; vira dd/mm/aaaa na proposta. */
  dataEmissao?: string;
  parcelas: ParcelaLote[];
}

export interface ComunsLote {
  marca: Marca;
  tipo: 'avista' | 'parcelado';
  tipoDocumento: TipoDoc;
  ocultarTaxa: boolean;
  taxaMensal: number;
  /** ISO */
  dataAntecipacao: string;
  servico: string;
  /**
   * Ao agrupar, mantém cada nota como parcela própria em vez de somar as que
   * caem no mesmo vencimento. É o `desagrupar` do original.
   */
  desagrupar: boolean;
}

export interface ItemLote {
  /** Como o item aparece na tela e nos avisos de erro. */
  rotulo: string;
  origem: 'nota' | 'grupo';
  /** Posições das notas de origem, na ordem em que foram carregadas. */
  indices: number[];
  /** Nota resolvida: a original, ou a fusão das notas do grupo. */
  nota: NotaLote;
  /** Modelo efetivo - grupo com mais de um vencimento cai no parcelado. */
  tipo: 'avista' | 'parcelado';
  /** Parcelas com valor já resolvido, prontas para o cálculo. */
  parcelas: ParcelaLote[];
}

export interface PlanoLote {
  itens: ItemLote[];
  /** Notas e grupos que não geram documento, com o motivo. */
  erros: { rotulo: string; erro: string }[];
}

/** Grupo montado na tela: as posições das notas que entram nele. */
export interface GrupoLote { indices: number[] }

function valorAntecipadoDe(n: NotaLote): number {
  const va = Number(n.valorAntecipado);
  return Number.isFinite(va) && va > 0 ? va : Number(n.valorTotal) || 0;
}

/**
 * Resolve o valor de cada parcela. Quando todas vêm preenchidas, respeita o que
 * foi digitado; caso contrário divide o valor a antecipar igualmente - é o
 * `valores_parc = None` do original.
 */
export function resolverParcelas(parcelas: ParcelaLote[], valorAntecipado: number): ParcelaLote[] {
  const limpas = (parcelas ?? [])
    .filter(p => p && p.vencimento)
    .slice()
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  if (!limpas.length) return [];

  const todasComValor = limpas.every(p => Number.isFinite(p.valor) && p.valor > 0);
  if (todasComValor) return limpas.map(p => ({ vencimento: p.vencimento, valor: p.valor }));
  return limpas.map(p => ({ vencimento: p.vencimento, valor: valorAntecipado / limpas.length }));
}

/**
 * Funde várias notas numa proposta só - porte de `_merge_notas_proposta`.
 *
 * Identidade (cedente, sacado, emissão) vem da primeira nota; os valores de face
 * e os antecipados são somados; os números de documento entram concatenados. As
 * parcelas de cada nota entram proporcionais à fatia antecipada dela e, por
 * padrão, as que caem no mesmo vencimento viram uma só.
 */
export function mesclarNotas(notas: NotaLote[], manterIndividuais: boolean): NotaLote {
  const base = notas[0];
  let totalFace = 0;
  let totalAntecipado = 0;
  const numeros: string[] = [];
  const pares: ParcelaLote[] = [];

  for (const n of notas) {
    const face = Number(n.valorTotal) || 0;
    const antecipado = valorAntecipadoDe(n);
    totalFace += face;
    totalAntecipado += antecipado;
    if (n.numeroNf) numeros.push(String(n.numeroNf).trim());

    const limpas = (n.parcelas ?? []).filter(p => p && p.vencimento);
    if (!limpas.length) continue;

    const todasComValor = limpas.every(p => Number.isFinite(p.valor) && p.valor > 0);
    // Valores digitados são de face; entram na proposta na proporção antecipada
    const fatia = face > 0 ? antecipado / face : 1;
    for (const p of limpas) {
      pares.push({
        vencimento: p.vencimento,
        valor: todasComValor ? p.valor * fatia : antecipado / limpas.length,
      });
    }
  }

  pares.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  let parcelas = pares;
  if (!manterIndividuais) {
    const porData = new Map<string, number>();
    for (const p of pares) porData.set(p.vencimento, (porData.get(p.vencimento) ?? 0) + p.valor);
    parcelas = [...porData.entries()].map(([vencimento, valor]) => ({ vencimento, valor }));
  }

  return {
    clienteRazao: base.clienteRazao,
    clienteCnpj: base.clienteCnpj,
    sacadoRazao: base.sacadoRazao,
    sacadoCnpj: base.sacadoCnpj,
    valorTotal: totalFace,
    // Só vai como antecipação parcial quando de fato difere da soma das faces
    valorAntecipado: Math.abs(totalAntecipado - totalFace) > 0.01 ? totalAntecipado : undefined,
    numeroNf: numeros.length ? Array.from(new Set(numeros)).join(' / ') : '',
    dataEmissao: base.dataEmissao,
    parcelas,
  };
}

/** Motivo pelo qual a nota não vira proposta, ou null quando está de pé. */
function motivoInvalida(nota: NotaLote, parcelas: ParcelaLote[]): string | null {
  if (!String(nota.clienteRazao ?? '').trim()) return 'Sem cedente.';
  if (!String(nota.sacadoRazao ?? '').trim()) return 'Sem sacado.';
  if (!(Number(nota.valorTotal) > 0)) return 'Sem valor.';
  if (!parcelas.length) return 'Sem data de vencimento.';
  if (parcelas.some(p => !(p.valor > 0))) return 'Há parcela sem valor.';
  return null;
}

function rotuloNota(nota: NotaLote, posicao: number): string {
  const num = String(nota?.numeroNf ?? '').trim();
  return num ? `Nota ${posicao} (${num})` : `Nota ${posicao}`;
}

/**
 * Decide o que o lote vai gerar. Grupos primeiro, depois as notas soltas - mesma
 * ordem do original, para que o nome dos arquivos saia na mesma sequência.
 *
 * Uma nota que entrou num grupo não sai também sozinha. Grupo com menos de duas
 * notas é ignorado (não é grupo).
 */
export function montarPlanoLote(notas: NotaLote[], grupos: GrupoLote[], com: ComunsLote): PlanoLote {
  const itens: ItemLote[] = [];
  const erros: { rotulo: string; erro: string }[] = [];

  const validos = (grupos ?? [])
    .map(g => Array.from(new Set((g?.indices ?? []).filter(i => Number.isInteger(i) && i >= 0 && i < notas.length))))
    .filter(ix => ix.length >= 2);
  const agrupadas = new Set<number>(validos.flat());

  function registrar(rotulo: string, origem: 'nota' | 'grupo', indices: number[], nota: NotaLote) {
    const antecipado = valorAntecipadoDe(nota);
    let parcelas = resolverParcelas(nota.parcelas, antecipado);
    // À vista é parcela única e o restante das datas fica de fora - mas só para
    // nota avulsa. No grupo, cada nota é uma parcela com vencimento próprio, e
    // aí o modelo parcelado assume mesmo em modo à vista (regra do original).
    if (com.tipo === 'avista' && origem === 'nota' && parcelas.length > 1) {
      parcelas = [{ vencimento: parcelas[0].vencimento, valor: antecipado }];
    }
    const erro = motivoInvalida(nota, parcelas);
    if (erro) { erros.push({ rotulo, erro }); return; }
    itens.push({
      rotulo, origem, indices, nota, parcelas,
      // Grupo com vários vencimentos usa o modelo parcelado mesmo em modo à vista
      tipo: com.tipo === 'avista' && parcelas.length === 1 ? 'avista' : 'parcelado',
    });
  }

  validos.forEach((ix, i) => {
    const doGrupo = ix.map(j => notas[j]).filter(Boolean);
    const rotulo = `Grupo ${i + 1} · ${doGrupo.length} notas`;
    if (doGrupo.length < 2) { erros.push({ rotulo, erro: 'Grupo com menos de duas notas.' }); return; }
    registrar(rotulo, 'grupo', ix, mesclarNotas(doGrupo, com.desagrupar));
  });

  notas.forEach((nota, i) => {
    if (agrupadas.has(i)) return;
    registrar(rotuloNota(nota, i + 1), 'nota', [i], nota);
  });

  return { itens, erros };
}

/**
 * Nome do arquivo no padrão do original (`_nome_arquivo`), com sufixo numérico
 * quando dois itens do mesmo lote chegam ao mesmo nome.
 */
export function nomearSemRepetir(nome: string, usados: Set<string>): string {
  if (!usados.has(nome)) { usados.add(nome); return nome; }
  const ponto = nome.lastIndexOf('.');
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext = ponto > 0 ? nome.slice(ponto) : '';
  for (let c = 1; ; c++) {
    const tentativa = `${base}_${c}${ext}`;
    if (!usados.has(tentativa)) { usados.add(tentativa); return tentativa; }
  }
}
