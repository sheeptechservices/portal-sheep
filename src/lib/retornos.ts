// ─────────────────────────────────────────────────────────────────────────────
//  Tarefa que retornou: foi entregue e voltou para trás no quadro.
//
//  A regra é uma só, e mora aqui para o servidor e a tela contarem igual:
//  retorno é sair de uma etapa de entrega (a revisão e as que fecham) para uma
//  etapa anterior. "Em revisão" para "Fazer" é retorno; "Fazendo" para "Fazer"
//  não é, porque ali ninguém entregou nada, é só arrumação do quadro.
//
//  A etapa de revisão não tem marca própria na configuração, então ela é a
//  última etapa antes da primeira que fecha, pulando as desconsideradas. As
//  etapas vêm na ordem do quadro, só as ativas.
//
//  O histórico de onde isto se conta é o diário da tarefa (`tarefa_eventos`,
//  campo `status`), que já guarda toda troca de etapa: por isso o selo vale
//  também para o que retornou antes de ele existir.
// ─────────────────────────────────────────────────────────────────────────────

/** O que a regra precisa de cada etapa, na ordem do quadro. */
export interface EtapaDoRetorno {
  nome: string;
  is_conclusao?: number | boolean | null;
  is_excluded?: number | boolean | null;
}

/** Uma volta para trás, como o diário a registrou. */
export interface Retorno {
  de: string;
  para: string;
  quando: string;
  quem: string | null;
}

const marcada = (v: unknown) => v === true || Number(v) === 1;

export function regraDoRetorno(etapas: EtapaDoRetorno[]) {
  const indice = new Map(etapas.map((e, i) => [e.nome, i]));
  const desconsiderada = new Set(etapas.filter(e => marcada(e.is_excluded)).map(e => e.nome));
  const primeiraQueFecha = etapas.findIndex(e => marcada(e.is_conclusao));
  // A entrega começa na revisão: a última etapa valendo antes da que fecha.
  // Sem etapa que fecha, só a última etapa valendo conta como entrega.
  const ultimaValendoAntes = (fim: number) => {
    for (let i = fim - 1; i >= 0; i--) if (!desconsiderada.has(etapas[i].nome)) return i;
    return -1;
  };
  let limite: number;
  if (primeiraQueFecha >= 0) {
    const revisao = ultimaValendoAntes(primeiraQueFecha);
    limite = revisao >= 0 ? revisao : primeiraQueFecha;
  } else {
    limite = ultimaValendoAntes(etapas.length);
  }
  if (limite < 0) limite = etapas.length;
  const entrega = new Set(etapas.filter((e, i) => i >= limite && !desconsiderada.has(e.nome)).map(e => e.nome));

  return {
    /** As etapas de onde se volta: a revisão e as que fecham. */
    etapasDeEntrega: [...entrega],
    /** A troca de etapa foi um retorno. */
    ehRetorno(de: string, para: string): boolean {
      const iDe = indice.get(de);
      const iPara = indice.get(para);
      return iDe !== undefined && iPara !== undefined && entrega.has(de) && iPara < iDe;
    },
    /** A troca de etapa foi uma entrega: chegou à revisão ou a uma que fecha,
     *  vindo de antes dela. É o denominador da taxa de retorno. */
    ehEntrega(de: string, para: string): boolean {
      const iDe = indice.get(de);
      return entrega.has(para) && (iDe === undefined || !entrega.has(de));
    },
    /** A tarefa está antes da entrega: é aí que o selo de retorno fica aceso.
     *  Voltou para a revisão (ou fechou), ele apaga. */
    antesDaEntrega(status: string): boolean {
      const i = indice.get(status);
      return i !== undefined && i < limite;
    },
  };
}

export type RegraDoRetorno = ReturnType<typeof regraDoRetorno>;

/** O que a taxa precisa de cada tarefa: as datas do último ano em que ela foi
 *  entregue e em que voltou, como a listagem as manda. */
export interface GiroDaTarefa {
  entregues_em?: string[];
  retornos_em?: string[];
}

/** Quantas das entregas da janela voltaram. Conta voltas sobre entregas, e não
 *  tarefas: a mesma tarefa entregue três vezes e devolvida duas pesa como o
 *  retrabalho que de fato deu. `pct` nulo quando ninguém entregou nada na
 *  janela: zero por cento ali diria uma coisa que não aconteceu. */
export function taxaDeRetorno(tarefas: GiroDaTarefa[], dias = 90) {
  const desde = new Date(Date.now() - dias * 86400_000).toISOString();
  let entregas = 0;
  let retornos = 0;
  for (const t of tarefas) {
    const voltas = (t.retornos_em ?? []).filter(d => d >= desde).length;
    // Quem voltou N vezes foi entregue pelo menos N vezes. Tarefa que nasceu
    // direto na revisão não tem a entrega no diário, e sem esse piso a volta
    // dela contaria sozinha, como se fosse cem por cento.
    entregas += Math.max(voltas, (t.entregues_em ?? []).filter(d => d >= desde).length);
    retornos += voltas;
  }
  return { entregas, retornos, dias, pct: entregas ? Math.min(100, Math.round((retornos / entregas) * 100)) : null };
}

/** O texto do selo e da dica: "Voltou de Em revisão para Fazer em 21/11, por
 *  Guilherme". */
export function textoDoRetorno(r: Retorno, vezes: number): string {
  const dia = r.quando
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(r.quando))
    : '';
  const quem = r.quem ? `, por ${r.quem}` : '';
  const total = vezes > 1 ? ` Retornou ${vezes} vezes no total.` : '';
  return `Voltou de ${r.de} para ${r.para}${dia ? ` em ${dia}` : ''}${quem}.${total}`;
}
