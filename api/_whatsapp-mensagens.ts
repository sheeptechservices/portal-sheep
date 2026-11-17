// ─────────────────────────────────────────────────────────────────────────────
//  Os textos que o número da casa manda no WhatsApp.
//
//  Moram aqui, e não ao lado de quem envia, porque é o único lugar do portal
//  além das mensagens ao Slack em que emoji é permitido (ver CLAUDE.md): no
//  WhatsApp o ícone é convenção nativa e ajuda a ler a mensagem de relance
//  num grupo cheio. Fora deste arquivo, a regra continua valendo.
//
//  A formatação é a do próprio WhatsApp: *negrito*.
// ─────────────────────────────────────────────────────────────────────────────

/** O tipo do chamado, como aparece na mensagem. Sem tipo, o título vai sozinho. */
const TIPO: Record<string, string> = {
  bug: '🐞 Bug',
  melhoria: '✨ Melhoria',
};

/** O aviso de chamado concluído, para o grupo do cliente:
 *
 *    ✅ *Chamado nº 122 concluído*
 *
 *    🐞 Bug: Diferença total do pedido e total nota
 *    👤 Aberto por Vanda em 17/11/2026
 *
 *    🔗 Acompanhe no painel: https://...
 */
export function mensagemDeChamadoConcluido(c: {
  numero: number | string;
  titulo: string;
  tipo: string | null;
  solicitante: string;
  /** O dia do pedido, já em dd/mm/aaaa. */
  dia: string;
  /** O link do painel de chamados do projeto, quando houver. */
  painel: string | null;
}): string {
  const tipo = c.tipo ? TIPO[c.tipo] : undefined;
  return [
    `✅ *Chamado nº ${c.numero} concluído*`,
    '',
    tipo ? `${tipo}: ${c.titulo}` : `📝 ${c.titulo}`,
    `👤 Aberto por ${c.solicitante} em ${c.dia}`,
    ...(c.painel ? ['', `🔗 Acompanhe no painel: ${c.painel}`] : []),
  ].join('\n');
}
