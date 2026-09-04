// Casos de teste do controle de acesso, contra um SQLite de verdade.
//
//   node scripts/test-permissoes.mjs
//
// O `_permissoes.ts` é o ponto onde um erro não aparece na tela: uma permissão
// invertida libera silenciosamente, e um papel "configurado sem nada" confundido
// com "nunca configurado" libera tudo. Daí os casos serem explícitos.
//
// O módulo é TypeScript e importa outros por caminho `.js`, então é empacotado
// pelo esbuild (que já vem com o Vite) num arquivo temporário antes de rodar.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@libsql/client';
import { build } from 'esbuild';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'dux-perm-'));
const bundle = join(temp, 'permissoes.mjs');

try {
  // API do esbuild, e não a CLI: o caminho do projeto tem espaços, e no Windows
  // chamar a CLI exigiria shell (que concatena os argumentos) ou o .exe de
  // plataforma. A API resolve os dois de uma vez.
  await build({
    absWorkingDir: raiz,
    entryPoints: ['api/_permissoes.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@libsql/client'],
    logLevel: 'silent',
  });

  const P = await import(pathToFileURL(bundle).href);
  await rodar(P);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

async function rodar(P) {
  const db = createClient({ url: 'file::memory:' });
  await P.ensurePermissoesSchema(sql => db.execute(sql).then(() => {}));

  const membro = { id: 'u1', email: 'ana@wearedux.com', nome: 'Ana', foto_url: null, papel: 'membro' };
  const master = { id: 'u2', email: 'bruno@wearedux.com', nome: 'Bruno', foto_url: null, papel: 'master' };
  const admin = { id: 'u3', email: 'guilhermezaidan@wearedux.com', nome: 'Gui', foto_url: null, papel: 'admin' };

  let falhas = 0;
  const eq = (nome, obtido, esperado) => {
    if (obtido === esperado) { console.log(`  ok     ${nome}`); return; }
    falhas++;
    console.log(`  FALHA  ${nome}: obtido=${String(obtido)} esperado=${String(esperado)}`);
  };
  const titulo = t => console.log(`\n${t}`);

  titulo('1. Papel nunca configurado: membro alcança tudo (ligar o módulo não tira acesso de ninguém)');
  let perm = await P.permissoesDoUsuario(db, membro);
  eq('membro = TUDO', perm, P.TUDO);
  eq('pode excluir solicitação', P.podeAcao(perm, 'delete_submission'), true);
  eq('pode mexer no cofre de credenciais', P.podeAcao(perm, 'save_anthropic_key'), true);

  titulo('2. Master e admin ignoram a matriz');
  eq('master = TUDO', await P.permissoesDoUsuario(db, master), P.TUDO);
  eq('admin = TUDO', await P.permissoesDoUsuario(db, admin), P.TUDO);
  eq('sem sessão não pode nada', P.podeAcao(await P.permissoesDoUsuario(db, null), 'board'), false);

  titulo('3. Configurado: vale só o que está marcado');
  await P.salvarMatrizPapel(db, 'membro', [
    'oportunidades:ver', 'oportunidades:comentar', 'oportunidades:mover',
    'onboarding:ver', 'cadastros:ver',
  ], admin);
  P.invalidarCachePermissoes();
  perm = await P.permissoesDoUsuario(db, membro);
  eq('não é mais TUDO', perm === P.TUDO, false);
  eq('ver kanban', P.podeAcao(perm, 'board'), true);
  eq('comentar', P.podeAcao(perm, 'comment'), true);
  eq('mover de etapa', P.podeAcao(perm, 'move'), true);
  eq('excluir solicitação NÃO', P.podeAcao(perm, 'delete_submission'), false);
  eq('criar solicitação NÃO', P.podeAcao(perm, 'create_submission'), false);
  eq('excluir comentário NÃO', P.podeAcao(perm, 'delete_comment'), false);
  eq('cofre de credenciais NÃO', P.podeAcao(perm, 'save_anthropic_key'), false);
  eq('liquidez NÃO', P.pode(perm, 'liquidez:ver'), false);
  eq('DEPS pago NÃO', P.pode(perm, ['oportunidades:deps']), false);

  titulo('4. Ações sempre livres continuam livres');
  for (const a of ['me', 'perfil', 'quick_search']) eq(a, P.podeAcao(perm, a), true);

  titulo('5. Ação de admin nunca passa pela matriz');
  for (const a of ['usuarios', 'set_papel', 'set_usuario_ativo', 'permissoes', 'set_permissoes_papel']) {
    eq(`${a} (membro)`, P.podeAcao(perm, a), false);
  }

  titulo('6. Ação não mapeada é recusada, não liberada');
  eq('acao_que_ninguem_mapeou', P.podeAcao(perm, 'acao_que_ninguem_mapeou'), false);

  titulo('7. `exigir` devolve 403 com o motivo, e null quando pode');
  const recusa = await P.exigir(db, membro, 'liquidez:ver');
  eq('status 403', recusa?.status, 403);
  eq('nomeia a permissão que faltou', recusa?.body?.permissao, 'liquidez:ver');
  eq('liberado devolve null', await P.exigir(db, membro, 'oportunidades:ver'), null);
  eq('master passa em tudo', await P.exigir(db, master, 'liquidez:excluir'), null);

  titulo('8. Configurado sem nada bloqueia tudo (não é o mesmo que nunca configurado)');
  await P.salvarMatrizPapel(db, 'membro', [], admin);
  P.invalidarCachePermissoes();
  perm = await P.permissoesDoUsuario(db, membro);
  eq('não voltou a ser TUDO', perm === P.TUDO, false);
  eq('nem o kanban', P.podeAcao(perm, 'board'), false);
  eq('me segue livre', P.podeAcao(perm, 'me'), true);

  titulo('9. Chave inventada pela tela é descartada na gravação');
  const m = await P.salvarMatrizPapel(db, 'membro', ['oportunidades:ver', 'inventada:tudo', 'usuarios:gerenciar'], admin);
  eq('só a válida sobrou', m.chaves.join(','), 'oportunidades:ver');
  eq('marcou como configurado', m.configurado, true);

  titulo('10. Metadados da última alteração');
  P.invalidarCachePermissoes();
  const matriz = await P.matrizDoPapel(db, 'membro');
  eq('guardou quem mexeu', matriz.atualizado_por_nome, 'Gui');
  eq('guardou quando', typeof matriz.atualizado_em === 'string', true);

  titulo('11. Catálogo e mapa coerentes');
  const doMapa = Object.values(P.PERMISSAO_DA_ACAO).flat().filter(v => v !== P.LIVRE && v !== P.SO_ADMIN);
  eq('toda chave do mapa existe no catálogo', doMapa.every(c => P.CHAVES.has(c)), true);
  eq('todo grupo tem uma ação de acesso', P.CATALOGO.every(g => g.acoes.some(a => a.acesso)), true);

  console.log(falhas === 0 ? '\nOK - todos os casos passaram.' : `\n${falhas} FALHA(S).`);
  if (falhas) process.exit(1);
}
