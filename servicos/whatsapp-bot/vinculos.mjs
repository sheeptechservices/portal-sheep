// ─────────────────────────────────────────────────────────────────────────────
//  De que cliente é cada grupo do WhatsApp.
//
//  A resposta sai dos cadastros do portal (listar_projetos): primeiro o vínculo
//  que alguém fez no projeto (o grupo do aviso de chamado); sem vínculo, o nome
//  do grupo, que quase sempre diz o cliente ("Sheep <> Orteconte"). Com o
//  cliente achado vêm todos os projetos dele, e com cada projeto os links
//  (ficha, painel de chamados, acompanhamento, sistema).
//
//  É o mesmo raciocínio no grupo (a nota que o bot recebe ao responder lá) e no
//  privado (listar_grupos), para o bot não perguntar o que o portal já sabe.
// ─────────────────────────────────────────────────────────────────────────────

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** O texto em palavras soltas, para casar nome inteiro e não pedaço de palavra. */
const palavras = (s) => ` ${semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** Nomes que aparecem em grupo de todo cliente e não dizem cliente nenhum: a
 *  própria casa e o vocabulário de grupo. */
const GENERICOS = new Set(['sheep', 'sheep technology', 'sheep tech', 'tech', 'squad', 'tech squad', 'suporte',
  'projeto', 'projetos', 'grupo', 'time', 'equipe', 'geral', 'interno', 'dev', 'testers']);

/** Lê listar_projetos do MCP do portal. Falhar aqui não derruba nada: só fica
 *  sem o mapa. */
export async function projetosDoPortal(url, token) {
  if (!url) return [];
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'listar_projetos', arguments: {} } }),
      signal: AbortSignal.timeout(30_000),
    });
    const cru = await r.text();
    const json = r.headers.get('content-type')?.includes('text/event-stream')
      ? cru.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop()
      : cru;
    const texto = JSON.parse(json ?? '{}').result?.content?.find(c => c.type === 'text')?.text ?? '{}';
    const projetos = JSON.parse(texto).projetos;
    return Array.isArray(projetos) ? projetos : [];
  } catch {
    return [];
  }
}

/** O projeto no formato curto que vai para o modelo. */
function resumo(p) {
  return {
    id: String(p.id), nome: p.nome ?? null, codigo: p.codigo ?? null, cliente: p.cliente ?? null,
    status: p.status ?? null, links: p.links ?? null,
  };
}

/** Os nomes pelos quais o nome de um grupo aponta para um projeto: o cliente,
 *  o nome do projeto e o código. Curtos demais e genéricos não contam. */
function apelidos(p) {
  return [p.cliente, p.nome, p.codigo]
    .map(x => palavras(x).trim())
    .filter(x => x.length >= 3 && !GENERICOS.has(x));
}

/**
 * De que cliente é o grupo. Devolve null quando nada no portal aponta para ele.
 * `como` diz de onde veio: `vinculo` (cadastrado no projeto) ou `nome` (deduzido
 * do nome do grupo). Com mais de um cliente possível, vêm todos, e `ambiguo`.
 */
export function clienteDoGrupo(grupo, projetos) {
  const lista = (projetos ?? []).filter(p => String(p.id) !== 'geral');
  const doCliente = (cliente) => lista.filter(p => cliente && semAcento(p.cliente) === semAcento(cliente));

  const vinculados = lista.filter(p => p.whatsapp?.grupo_id && p.whatsapp.grupo_id === grupo?.id);
  if (vinculados.length) {
    const clientes = [...new Set(vinculados.map(p => p.cliente).filter(Boolean))];
    // Os outros projetos do mesmo cliente vêm junto: o grupo é do cliente, e o
    // pedido de lá pode ser de qualquer um deles.
    const todos = [...vinculados, ...clientes.flatMap(doCliente)];
    const unicos = [...new Map(todos.map(p => [String(p.id), p])).values()];
    return {
      como: 'vinculo', ambiguo: clientes.length > 1, clientes,
      projetos: unicos.map(p => ({ ...resumo(p), vinculado: vinculados.includes(p) })),
    };
  }

  const nome = palavras(grupo?.nome);
  if (!nome.trim()) return null;
  const casados = lista
    .map(p => ({ p, tam: Math.max(0, ...apelidos(p).filter(a => nome.includes(` ${a} `)).map(a => a.length)) }))
    .filter(x => x.tam > 0);
  if (!casados.length) return null;
  const clientes = [...new Set(casados.map(x => x.p.cliente ?? x.p.nome).filter(Boolean))];
  const todos = [...casados.map(x => x.p), ...clientes.flatMap(doCliente)];
  const unicos = [...new Map(todos.map(p => [String(p.id), p])).values()];
  return { como: 'nome', ambiguo: clientes.length > 1, clientes, projetos: unicos.map(p => ({ ...resumo(p), vinculado: false })) };
}

/** A frase que o bot recebe ao responder dentro do grupo. */
export function notaDoCliente(c) {
  if (!c) {
    return ' Nenhum projeto do portal está vinculado a este grupo, e o nome dele não aponta cliente cadastrado: se o pedido depender do cliente, confira em listar_projetos ou pergunte.';
  }
  const origem = c.como === 'vinculo'
    ? 'pelo vínculo cadastrado no portal'
    : 'deduzido pelo nome do grupo (não há vínculo cadastrado: se a conversa indicar outro cliente, confira em listar_projetos)';
  const projetos = c.projetos.slice(0, 8).map(p => {
    const l = p.links ?? {};
    const links = [l.chamados && `painel de chamados ${l.chamados}`, l.acompanhamento && `acompanhamento ${l.acompanhamento}`,
      l.sistema && `sistema ${l.sistema}`, l.portal && `ficha no portal ${l.portal}`].filter(Boolean).join('; ');
    return `"${p.nome}"${p.codigo ? ` (código ${p.codigo})` : ''}, id ${p.id}${p.status ? `, ${p.status}` : ''}${links ? `. Links: ${links}` : ''}`;
  }).join(' | ');
  const quem = c.ambiguo ? `de um destes clientes: ${c.clientes.join(', ')}` : `do cliente ${c.clientes[0] ?? c.projetos[0]?.nome}`;
  return ` Este grupo é ${quem}, ${origem}. Projetos: ${projetos}. Pedidos daqui (tarefas, chamados, entregas, reuniões, links) são deste cliente: use estes projetos sem perguntar qual é${c.ambiguo ? ', a menos que a conversa não deixe claro entre os clientes acima' : ''}. Para o resto da ficha (descrição, repositórios, Drive, acessos, entregas, reuniões), use ver_projeto com o id. Os links de chamados e de acompanhamento são do próprio cliente e podem ir neste grupo; os acessos da equipe (logins) não.`;
}
