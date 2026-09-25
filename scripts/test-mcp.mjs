// Casos de teste do MCP das tarefas, contra um SQLite de verdade.
//
//   node scripts/test-mcp.mjs
//
// Cobre as três travas que não aparecem na tela: o OAuth (PKCE, código de uso
// único, rotação do refresh), o esconderijo (quem não tem o MCP não fica
// sabendo que ele existe) e a vitrine de ferramentas cortada pela permissão.
// Por último, um passeio pelas ferramentas de verdade, sobre o handler inteiro.
//
// Mesmo arranjo do `test-permissoes.mjs`: o TypeScript é empacotado pelo
// esbuild num arquivo temporário antes de rodar.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@libsql/client';
import { build } from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'dux-mcp-'));
const entrada = join(temp, 'entrada.ts');
const bundle = join(temp, 'mcp.mjs');

// O endereço do portal que o emissor e o metadado usam.
process.env.PORTAL_URL = 'https://portal.teste';

try {
  writeFileSync(entrada, [
    `export * as O from ${JSON.stringify(join(raiz, 'api/_mcp/oauth.ts'))};`,
    `export * as R from ${JSON.stringify(join(raiz, 'api/_mcp/protocolo.ts'))};`,
    `export * as F from ${JSON.stringify(join(raiz, 'api/_mcp/ferramentas.ts'))};`,
    `export * as H from ${JSON.stringify(join(raiz, 'api/_admin-handler.ts'))};`,
    `export * as P from ${JSON.stringify(join(raiz, 'api/_permissoes.ts'))};`,
  ].join('\n'));
  await build({
    absWorkingDir: raiz,
    entryPoints: [entrada],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  const M = await import(pathToFileURL(bundle).href);
  await rodar(M);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

async function rodar({ O, R, F, H, P }) {
  const db = createClient({ url: 'file::memory:' });
  await H.ensureAdminSchema(db);

  let falhas = 0;
  const eq = (nome, obtido, esperado) => {
    if (obtido === esperado) { console.log(`  ok     ${nome}`); return; }
    falhas++;
    console.log(`  FALHA  ${nome}: obtido=${String(obtido)} esperado=${String(esperado)}`);
  };
  const titulo = t => console.log(`\n${t}`);
  const recusa = async (promessa) => {
    try { await promessa; return 'passou'; } catch (e) { return e?.codigo ?? e?.message ?? 'erro'; }
  };

  const agora = new Date().toISOString();
  const pessoa = async (id, email, nome, papel, mcp) => {
    await db.execute({
      sql: `INSERT INTO usuarios (id, email, nome, papel, ativo, criado_em, mcp_habilitado)
            VALUES (?,?,?,?,1,?,?)`,
      args: [id, email, nome, papel, agora, mcp ? 1 : 0],
    });
    return { id, email, nome, foto_url: null, papel };
  };
  const admin = await pessoa('u-admin', 'guilhermezaidan@wearedux.com', 'Gui', 'admin', false);
  const ana = await pessoa('u-ana', 'ana@wearedux.com', 'Ana Souza', 'membro', true);
  const bia = await pessoa('u-bia', 'bia@wearedux.com', 'Bia Lima', 'membro', false);
  const caio = await pessoa('u-caio', 'caio@wearedux.com', 'Caio', 'master', false);

  // ── OAuth ────────────────────────────────────────────────────────────────
  titulo('1. redirect_uri aceitos e recusados');
  eq('https', O.redirectAceito('https://claude.ai/api/mcp/auth_callback'), true);
  eq('http no localhost', O.redirectAceito('http://localhost:33418/callback'), true);
  eq('http no 127.0.0.1', O.redirectAceito('http://127.0.0.1:5000/cb'), true);
  eq('esquema de aplicativo', O.redirectAceito('cursor://anysphere.cursor-retrieval/oauth/callback'), true);
  eq('http fora do computador NÃO', O.redirectAceito('http://evil.com/cb'), false);
  eq('javascript: NÃO', O.redirectAceito('javascript:alert(1)'), false);
  eq('com fragmento NÃO', O.redirectAceito('https://a.com/cb#x'), false);

  titulo('2. Registro dinâmico');
  const volta = 'http://localhost:33418/callback';
  const cliente = await O.registrarCliente(db, { client_name: 'Claude Code', redirect_uris: [volta] });
  eq('devolve client_id', typeof cliente.client_id, 'string');
  eq('cliente público', cliente.token_endpoint_auth_method, 'none');
  eq('redirect ruim recusado', await recusa(O.registrarCliente(db, { redirect_uris: ['http://evil.com/cb'] })), 'invalid_redirect_uri');
  eq('cliente com segredo recusado', await recusa(O.registrarCliente(db, {
    redirect_uris: [volta], token_endpoint_auth_method: 'client_secret_post',
  })), 'invalid_client_metadata');

  titulo('3. Pedido de autorização');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const pedidoBom = {
    client_id: cliente.client_id, redirect_uri: volta, response_type: 'code',
    code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz',
  };
  const { pedido, clienteNome } = await O.conferirPedido(db, pedidoBom);
  eq('nome do cliente para a tela', clienteNome, 'Claude Code');
  eq('redirect não registrado recusado', await recusa(O.conferirPedido(db, { ...pedidoBom, redirect_uri: 'http://localhost:1/x' })), 'invalid_request');
  eq('sem PKCE recusado', await recusa(O.conferirPedido(db, { ...pedidoBom, code_challenge: undefined })), 'invalid_request');
  eq('PKCE plain recusado', await recusa(O.conferirPedido(db, { ...pedidoBom, code_challenge_method: 'plain' })), 'invalid_request');
  eq('cliente inexistente recusado', await recusa(O.conferirPedido(db, { ...pedidoBom, client_id: 'x' })), 'invalid_client');

  titulo('4. Código de uso único e PKCE');
  const url1 = new URL(await O.emitirCodigo(db, ana.id, pedido, 'https://portal.teste'));
  eq('volta com state', url1.searchParams.get('state'), 'xyz');
  eq('volta com iss', url1.searchParams.get('iss'), 'https://portal.teste');
  const troca = (code, v = verifier) => O.trocarCodigo(db, {
    grant_type: 'authorization_code', code, code_verifier: v, client_id: cliente.client_id, redirect_uri: volta,
  });
  eq('verifier errado recusado', await recusa(troca(url1.searchParams.get('code'), 'x'.repeat(43))), 'invalid_grant');
  eq('o mesmo código não serve de novo', await recusa(troca(url1.searchParams.get('code'))), 'invalid_grant');

  const url2 = new URL(await O.emitirCodigo(db, ana.id, pedido, 'https://portal.teste'));
  const tokens = await troca(url2.searchParams.get('code'));
  eq('emite Bearer', tokens.token_type, 'Bearer');
  eq('código já trocado não serve de novo', await recusa(troca(url2.searchParams.get('code'))), 'invalid_grant');
  eq('token identifica a Ana', (await O.usuarioDoToken(db, tokens.access_token))?.email, 'ana@wearedux.com');
  eq('token inventado não identifica ninguém', await O.usuarioDoToken(db, 'inventado'), null);

  const url3 = new URL(await O.emitirCodigo(db, bia.id, pedido, 'https://portal.teste'));
  eq('quem não tem MCP não recebe token', await recusa(troca(url3.searchParams.get('code'))), 'invalid_grant');

  titulo('5. Rotação do refresh');
  const novos = await O.renovarToken(db, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: cliente.client_id });
  eq('novo access funciona', (await O.usuarioDoToken(db, novos.access_token))?.id, ana.id);
  eq('access antigo morreu', await O.usuarioDoToken(db, tokens.access_token), null);
  eq('refresh antigo não serve de novo', await recusa(O.renovarToken(db, { refresh_token: tokens.refresh_token })), 'invalid_grant');

  titulo('6. Desligar o MCP corta na hora');
  eq('conexão aparece no Perfil', (await O.conexoesDoUsuario(db, ana.id)).length, 1);
  await db.execute({ sql: 'UPDATE usuarios SET mcp_habilitado = 0 WHERE id = ?', args: [ana.id] });
  eq('token parou de valer', await O.usuarioDoToken(db, novos.access_token), null);
  await db.execute({ sql: 'UPDATE usuarios SET mcp_habilitado = 1 WHERE id = ?', args: [ana.id] });

  // ── O esconderijo ────────────────────────────────────────────────────────
  titulo('7. Quem não tem o MCP não fica sabendo dele');
  const acao = (u, metodo, nome, dados = {}) => metodo === 'GET'
    ? H.handleAdminData('GET', new URLSearchParams({ action: nome, ...dados }), {}, db, u)
    : H.handleAdminData('POST', new URLSearchParams(), { action: nome, ...dados }, db, u);

  eq('me da Ana traz mcp', (await acao(ana, 'GET', 'me')).body.usuario.mcp, true);
  eq('me da Bia não traz o campo', 'mcp' in (await acao(bia, 'GET', 'me')).body.usuario, false);
  const inexistente = await acao(caio, 'GET', 'acao_que_nao_existe');
  const escondido = await acao(caio, 'GET', 'mcp_conexoes');
  eq('master sem MCP: mesmo status de ação inexistente', escondido.status, inexistente.status);
  eq('master sem MCP: mesma mensagem', escondido.body.error, inexistente.body.error);
  eq('lista de usuários do master não traz mcp', 'mcp' in (await acao(caio, 'GET', 'usuarios')).body.usuarios[0], false);
  eq('lista de usuários do admin também não', 'mcp' in (await acao(admin, 'GET', 'usuarios')).body.usuarios[0], false);
  eq('não há ação de ligar pela tela', (await acao(admin, 'POST', 'set_usuario_mcp', { usuario_id: bia.id, mcp: true })).status,
    (await acao(admin, 'POST', 'acao_que_nao_existe')).status);

  titulo('8. A tela de conectar emite o código só para quem tem');
  const autoriza = await acao(ana, 'POST', 'mcp_autorizar', { pedido: pedidoBom });
  eq('Ana recebe a URL de volta', new URL(autoriza.body.redirecionar).searchParams.has('code'), true);
  eq('Bia recebe a resposta de inexistente', (await acao(bia, 'POST', 'mcp_autorizar', { pedido: pedidoBom })).status,
    (await acao(bia, 'POST', 'acao_que_nao_existe')).status);

  // ── Ferramentas ──────────────────────────────────────────────────────────
  titulo('9. A vitrine de ferramentas segue a permissão');
  const ctx = async u => ({ db, usuario: u, permissoes: await P.permissoesDoUsuario(db, u), cache: new Map() });
  const nomes = c => F.SERVIDOR.visiveis(c).map(f => f.name);
  eq('papel não configurado vê excluir_tarefa', nomes(await ctx(ana)).includes('excluir_tarefa'), true);
  await P.salvarMatrizPapel(db, 'membro', ['tarefas:ver', 'tarefas:editar', 'tarefas:comentar'], admin);
  P.invalidarCachePermissoes();
  const ctxAna = await ctx(ana);
  eq('sem tarefas:excluir some excluir_tarefa', nomes(ctxAna).includes('excluir_tarefa'), false);
  eq('comentar continua', nomes(ctxAna).includes('comentar'), true);
  const escondida = await R.atender({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'excluir_tarefa', arguments: { id: 1 } } }, F.SERVIDOR, ctxAna);
  eq('chamar a escondida é "desconhecida"', escondida.error?.code, R.ERRO_PARAMS);

  titulo('10. Passeio pelas ferramentas');
  await db.execute({ sql: `INSERT INTO projetos (id, nome, criado_em) VALUES ('p1', 'Projeto Um', ?)`, args: [agora] });
  await db.execute({ sql: `INSERT INTO projetos (id, nome, criado_em) VALUES ('p2', 'Projeto Dois', ?)`, args: [agora] });
  await db.execute(`INSERT INTO projeto_equipe (projeto_id, usuario_id, papel) VALUES ('p1', 'u-ana', 'Dev')`);
  const chamarF = async (c, name, args) => {
    const r = await R.atender({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: args } }, F.SERVIDOR, c);
    if (r.error) return { erro: r.error.message };
    const bloco = r.result.content[0];
    return r.result.isError ? { erro: bloco.text } : JSON.parse(bloco.text);
  };

  const init = await R.atender({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, F.SERVIDOR, ctxAna);
  eq('initialize ecoa a versão', init.result.protocolVersion, '2025-06-18');
  eq('instruções proíbem travessão', /travessão/.test(init.result.instructions), true);
  eq('notificação não tem resposta', await R.atender({ jsonrpc: '2.0', method: 'notifications/initialized' }, F.SERVIDOR, ctxAna), null);

  const criada = await chamarF(ctxAna, 'criar_tarefa', {
    projeto_id: 'p1', titulo: 'Revisar contrato', descricao: 'Texto **longo**', prioridade: 'alta',
    responsaveis: ['eu'], subtarefas: ['Ler', 'Anotar'],
  });
  eq('criou com id', typeof criada.id, 'number');
  eq('prioridade sem acento vira a do portal', (await chamarF(ctxAna, 'ver_tarefa', { id: criada.id })).prioridade, 'Alta');

  const fora = await chamarF(ctxAna, 'criar_tarefa', { projeto_id: 'p2', titulo: 'Fora da equipe' });
  eq('não cria em projeto fora da equipe', typeof fora.erro, 'string');

  const editada = await chamarF(ctxAna, 'editar_tarefa', { id: criada.id, titulo: 'Revisar contrato v2' });
  eq('editar devolve o id', editada.id, criada.id);
  const vista = await chamarF(ctxAna, 'ver_tarefa', { id: criada.id });
  eq('patch parcial preserva a descrição', vista.descricao, 'Texto **longo**');
  eq('patch parcial preserva o responsável', vista.responsaveis[0]?.id, ana.id);
  eq('subtarefas criadas junto', vista.subtarefas.length, 2);

  const lista = await chamarF(ctxAna, 'listar_tarefas', { responsavel: 'ana@wearedux.com', texto: 'v2' });
  eq('lista com filtro acha a tarefa', lista.tarefas?.[0]?.id, criada.id);
  eq('lista por número', (await chamarF(ctxAna, 'listar_tarefas', { texto: `#${criada.id}` })).total, 1);

  const etapaRuim = await chamarF(ctxAna, 'editar_tarefa', { id: criada.id, status: 'Etapa inventada' });
  eq('etapa inexistente vira erro legível', /não existe/.test(etapaRuim.erro ?? ''), true);

  const coment = await chamarF(ctxAna, 'comentar', { tarefa_id: criada.id, texto: 'Pode revisar?', mencionar: ['ana@wearedux.com'] });
  eq('comentou', typeof coment.id, 'number');
  const comConversa = await chamarF(ctxAna, 'ver_tarefa', { id: criada.id });
  eq('menção entrou no texto', comConversa.comentarios[0]?.texto, '@[Ana Souza](u-ana) Pode revisar?');
  eq('menção gravada', comConversa.comentarios[0]?.mencoes?.[0]?.usuario_id, ana.id);

  const ctxBia = await ctx(bia);
  eq('outro membro não enxerga a tarefa', /não encontrada/.test((await chamarF(ctxBia, 'ver_tarefa', { id: criada.id })).erro ?? ''), true);
  const sub = await H.handleAdminData('GET', new URLSearchParams({ action: 'tarefa_subtarefas', id: String(criada.id) }), {}, db, bia);
  eq('subtarefas de tarefa alheia agora barradas', sub.status >= 400, true);

  console.log(falhas === 0 ? '\nOK - todos os casos passaram.' : `\n${falhas} FALHA(S).`);
  if (falhas) process.exit(1);
}
