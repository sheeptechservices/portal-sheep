// ─────────────────────────────────────────────────────────────────────────────
//  Por onde a lista de entregas se reparte.
//
//  Dois níveis, escolhidos na tela: um grupo maior e, dentro dele, um menor.
//  Antes havia uma opção fixa de "marcador e submarcador", que era a única
//  combinação possível - e a hierarquia é decisão de quem está lendo, não do
//  sistema. Marcador dentro de responsável e situação dentro de marcador são
//  perguntas igualmente legítimas.
//
//  As regras moram aqui porque o painel e a página do cliente repartem a mesma
//  entrega e têm de chegar aos mesmos grupos. O que muda entre os dois é só o
//  desenho do seletor, e isso fica em cada tela.
// ─────────────────────────────────────────────────────────────────────────────

export type Dimensao =
  | 'nenhum' | 'status' | 'marcador' | 'submarcador' | 'responsavel' | 'prazo';

/** O que se oferece nos dois níveis. "Nenhum" no maior desliga o agrupamento;
 *  no menor, deixa um nível só. */
export const DIMENSOES: { valor: Dimensao; label: string }[] = [
  { valor: 'nenhum', label: 'Nenhum' },
  // "Etapa", e não "Situação": é o mesmo nome que a etapa tem em Configurações
  // e no quadro, e duas palavras para a mesma coisa fazem parecer que são duas.
  { valor: 'status', label: 'Etapa' },
  { valor: 'marcador', label: 'Marcador' },
  { valor: 'submarcador', label: 'Submarcador' },
  { valor: 'responsavel', label: 'Responsável' },
  { valor: 'prazo', label: 'Prazo' },
];

// ── Faixas de prazo ──────────────────────────────────────────────────────────

/** As faixas, do passado para o futuro. É esta ordem que os cabeçalhos seguem:
 *  por data, e não por alfabeto - "Esta semana" antes de "Semana passada"
 *  inverteria a leitura do tempo. */
export const FAIXAS_PRAZO = [
  'Mais de 30 dias atrás',
  'Últimos 30 dias',
  'Semana passada',
  'Esta semana',
  'Próxima semana',
  'Próximos 30 dias',
  'Depois de 30 dias',
] as const;

/** Segunda-feira da semana de uma data. A semana da casa começa na segunda:
 *  entrega para sábado é da semana que passou, não da que vem. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // `getDay()` conta a partir de domingo; isto desloca para segunda.
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

const DIA = 86400000;

/** Em que faixa de tempo o prazo cai.
 *
 *  As três semanas são o miolo - o que se olha todo dia - e as quatro pontas
 *  recolhem o resto. As duas mais externas não têm fim: entrega de seis meses
 *  atrás precisa cair em algum lugar, e uma faixa que termina deixaria linha
 *  sem grupo. */
export function faixaDoPrazo(prazo: string | null | undefined, hoje = new Date()): string | null {
  if (!prazo) return null;
  const d = new Date(`${prazo}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const semana = inicioDaSemana(hoje);
  const proxima = new Date(semana.getTime() + 7 * DIA);
  const seguinte = new Date(semana.getTime() + 14 * DIA);
  const passada = new Date(semana.getTime() - 7 * DIA);
  const dia = new Date(d);
  dia.setHours(0, 0, 0, 0);

  if (dia >= semana && dia < proxima) return 'Esta semana';
  if (dia >= proxima && dia < seguinte) return 'Próxima semana';
  if (dia >= passada && dia < semana) return 'Semana passada';

  const referencia = new Date(hoje);
  referencia.setHours(0, 0, 0, 0);
  if (dia >= seguinte) {
    return dia.getTime() - referencia.getTime() <= 30 * DIA
      ? 'Próximos 30 dias' : 'Depois de 30 dias';
  }
  return referencia.getTime() - dia.getTime() <= 30 * DIA
    ? 'Últimos 30 dias' : 'Mais de 30 dias atrás';
}

/** O balde de quem não foi classificado naquela dimensão. Vai sempre para o fim
 *  da lista: o que ninguém preencheu não abre a leitura. */
export const SOBRA: Record<Dimensao, string> = {
  nenhum: '',
  status: '',
  marcador: 'Sem marcador',
  submarcador: 'Sem submarcador',
  responsavel: 'Sem responsável',
  prazo: 'Sem prazo',
};

/** A entrega vista pelo agrupamento: só o que ele precisa saber dela. */
export interface Agrupavel {
  status: string;
  marcador: string | null;
  submarcador: string | null;
  /** `YYYY-MM-DD`, ou nulo quando a entrega não tem data marcada. */
  prazo?: string | null;
}

/** Em que grupos a entrega entra, naquela dimensão. Responsável devolve mais de
 *  um: entrega de duas pessoas aparece nas duas, porque é das duas, e esconder
 *  uma cópia faria o time procurar o que é dele e não achar.
 *
 *  `donos` vem de fora porque cada tela guarda o responsável de um jeito - id no
 *  painel, nome já resolvido na página do cliente. */
export function chavesDe(e: Agrupavel, dim: Dimensao, donos: () => string[]): string[] {
  if (dim === 'status') return [e.status];
  if (dim === 'marcador') return [(e.marcador ?? '').trim() || SOBRA.marcador];
  if (dim === 'submarcador') return [(e.submarcador ?? '').trim() || SOBRA.submarcador];
  if (dim === 'prazo') return [faixaDoPrazo(e.prazo) ?? SOBRA.prazo];
  if (dim === 'responsavel') {
    const nomes = donos();
    return nomes.length ? nomes : [SOBRA.responsavel];
  }
  return [''];
}

/** Como os títulos de grupo se ordenam. Etapa segue a escala do fluxo, e não
 *  a ordem alfabética: "Bloqueada" antes de "Planejada" inverteria a leitura do
 *  andamento. O resto é alfabético, com o balde de sobra no fim. */
export function comparadorDe(dim: Dimensao, escalaDeStatus: readonly string[]) {
  if (dim === 'status') {
    return (a: string, b: string) => escalaDeStatus.indexOf(a) - escalaDeStatus.indexOf(b);
  }
  // Prazo segue a linha do tempo, e o que não tem data fecha a lista.
  if (dim === 'prazo') {
    const pos = (x: string) => {
      const i = FAIXAS_PRAZO.indexOf(x as typeof FAIXAS_PRAZO[number]);
      return i === -1 ? FAIXAS_PRAZO.length : i;
    };
    return (a: string, b: string) => pos(a) - pos(b);
  }
  const sobra = SOBRA[dim];
  return (a: string, b: string) => (
    a === sobra ? 1 : b === sobra ? -1 : a.localeCompare(b, 'pt-BR'));
}

/** O que a linha ainda precisa dizer sobre onde a entrega vive: os níveis que
 *  nenhum cabeçalho de grupo está dizendo. Agrupado por marcador, a linha mostra
 *  a área; pelos dois, não mostra nada. */
export function marcaDaLinha(e: Agrupavel, niveis: Dimensao[]): string {
  const nosCabecalhos = new Set(niveis);
  return [
    nosCabecalhos.has('marcador') ? null : e.marcador,
    nosCabecalhos.has('submarcador') ? null : e.submarcador,
  ].filter(Boolean).join(' · ');
}
