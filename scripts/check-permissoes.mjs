// Confere que o controle de acesso está inteiro: toda ação do servidor tem
// permissão declarada, e toda permissão do catálogo tranca alguma coisa.
//
// Existe por um motivo específico: ação não mapeada é RECUSADA para o papel
// `membro` (ver `podeAcao`), então esquecer de mapear uma ação nova não abre um
// buraco de segurança - quebra a função para quem é membro, e quebra em
// produção. Este script transforma esse esquecimento num erro antes do deploy.
//
//   node scripts/check-permissoes.mjs
//
// Lê os fontes como texto de propósito: não precisa de build, nem de banco, nem
// de env var, então roda em qualquer máquina e em CI.

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
// Normaliza a quebra de linha na leitura: os padroes abaixo casam blocos por
// quebra + dois espacos + chave, e num clone com fim de linha do Windows nada
// casava - o mapa de pagina saia vazio e o script acusava divergencia que nao
// existia.
const ler = p => readFileSync(join(raiz, p), 'utf8').replace(/\r\n/g, '\n');

const handler = ler('api/_admin-handler.ts');
const permissoes = ler('api/_permissoes.ts');

/** Recorta um bloco `export const NOME ... \n};` do fonte. */
function bloco(fonte, nome) {
  const i = fonte.indexOf(`export const ${nome}`);
  if (i < 0) throw new Error(`bloco ${nome} não encontrado em _permissoes.ts`);
  const fim = fonte.indexOf('\n};', i);
  return fonte.slice(i, fim < 0 ? undefined : fim);
}

// ── O que o handler despacha ─────────────────────────────────────────────────
const acoes = new Set(
  [...handler.matchAll(/\baction\s*===\s*'([a-z0-9_:-]+)'/g)].map(m => m[1]),
);

// ── O que o mapa declara ─────────────────────────────────────────────────────
const corpoMapa = bloco(permissoes, 'PERMISSAO_DA_ACAO');
const mapeadas = new Set([...corpoMapa.matchAll(/^\s{2}([a-z0-9_]+):/gm)].map(m => m[1]));

// ── O que o catálogo oferece ─────────────────────────────────────────────────
// Uma linha por ação: chave, e as flags que dizem se ela é imponível no servidor.
const corpoCatalogo = bloco(permissoes, 'CATALOGO');
const catalogo = [...corpoCatalogo.matchAll(/\{[^{}]*chave:\s*'([a-z0-9_]+:[a-z0-9_]+)'[^{}]*\}/g)].map(m => ({
  chave: m[1],
  acesso: /\bacesso:\s*true/.test(m[0]),
  apenasUi: /\bapenasUi:\s*true/.test(m[0]),
}));

// ── Onde cada permissão é usada ──────────────────────────────────────────────
// O handler não é o único ponto de imposição: liquidez, relatórios, DEPS, IA,
// gerador e D4Sign são endpoints próprios e trancam pelas próprias chaves.
const fontesApi = readdirSync(join(raiz, 'api'))
  .filter(f => f.endsWith('.ts') && f !== '_permissoes.ts')
  .map(f => ler(`api/${f}`))
  .join('\n');
const usadas = new Set([
  ...[...corpoMapa.matchAll(/'([a-z0-9_]+:[a-z0-9_]+)'/g)].map(m => m[1]),
  ...[...fontesApi.matchAll(/'([a-z0-9_]+:[a-z0-9_]+)'/g)].map(m => m[1]),
]);

const chavesCatalogo = new Set(catalogo.map(c => c.chave));

const semMapa = [...acoes].filter(a => !mapeadas.has(a)).sort();
const inexistentes = [...new Set(
  [...corpoMapa.matchAll(/'([a-z0-9_]+:[a-z0-9_]+)'/g)].map(m => m[1]),
)].filter(c => !chavesCatalogo.has(c)).sort();
// Permissão que não tranca nada em nenhum endpoint. Acesso de página e
// permissão só-de-UI têm licença para isso; as outras são checkbox morto.
const mortas = catalogo
  .filter(c => !c.acesso && !c.apenasUi && !usadas.has(c.chave))
  .map(c => c.chave)
  .sort();

let falhou = false;

if (semMapa.length) {
  falhou = true;
  console.error(`\nFALHA: ${semMapa.length} ação(ões) do handler sem permissão declarada.`);
  console.error('Membro recebe 403 nelas. Mapeie em PERMISSAO_DA_ACAO:\n');
  for (const a of semMapa) console.error(`  ${a}`);
}

if (inexistentes.length) {
  falhou = true;
  console.error(`\nFALHA: ${inexistentes.length} permissão(ões) usadas no mapa que não existem no CATALOGO:\n`);
  for (const c of inexistentes) console.error(`  ${c}`);
}

if (mortas.length) {
  falhou = true;
  console.error(`\nFALHA: ${mortas.length} permissão(ões) do catálogo não trancam nada em endpoint nenhum.`);
  console.error('Ou amarre a uma ação, ou marque `apenasUi: true`, ou remova do catálogo:\n');
  for (const c of mortas) console.error(`  ${c}`);
}

// ── Endpoints próprios continuam trancados? ─────────────────────────────────
// `/api/admin-data` tranca no despacho, de uma vez. Estes têm handler separado e
// precisam chamar `exigir` cada um. A lista existe para que remover um porteiro
// num refactor apareça aqui, e não em produção.
// Descoberto do diretório, e não de uma lista escrita à mão: a lista antiga
// citava arquivos apagados num refactor, e o script inteiro passou a estourar
// antes de conferir qualquer coisa - justamente o que ele existe para evitar.
const SEM_PORTEIRO_PROPRIO = new Set([
  'admin-data.ts',   // tranca no despacho, para todas as ações de uma vez
  'submit.ts',       // formulário público
  'submit-file.ts',  // formulário público
  'submissions.ts',  // formulário público
]);
const proprios = readdirSync(join(raiz, 'api'))
  .filter(f => f.endsWith('.ts') && !f.startsWith('_') && !SEM_PORTEIRO_PROPRIO.has(f));
const semPorteiro = proprios.filter(f => !/\bexigir(Ferramenta)?\(/.test(ler(`api/${f}`))).sort();
if (semPorteiro.length) {
  falhou = true;
  console.error(`\nFALHA: ${semPorteiro.length} endpoint(s) sem chamada a \`exigir\` - a matriz é contornável por eles:\n`);
  for (const f of semPorteiro) console.error(`  api/${f}`);
}

// ── As duas cópias do mapa de página concordam? ─────────────────────────────
// O menu decide o que mostrar antes de qualquer fetch de catálogo, então existe
// uma cópia do mapa página → permissão em `src/admin/papeis.ts`. Divergência ali
// significa menu mostrando o que o servidor recusa (ou escondendo o que libera).
//
// O do servidor é derivado do CATALOGO: para cada grupo que tranca uma página, a
// chave é a ação marcada `acesso: true`.
const mapaServidor = {};
for (const grupo of corpoCatalogo.split(/\n  \{\n/).slice(1)) {
  const page = /^\s*page:\s*'([a-z-]+)'/m.exec(grupo)?.[1];
  if (!page) continue;
  const dentroDasAcoes = grupo.slice(grupo.indexOf('acoes:'));
  const acessoChave = /chave:\s*'([a-z0-9_:]+)'[\s\S]*?acesso:\s*true/.exec(dentroDasAcoes)?.[1];
  mapaServidor[page] = acessoChave;
}

const mapaTela = Object.fromEntries(
  [...ler('src/admin/papeis.ts')
    // Ancora no `export const`: o nome solto também aparece no comentário
    // logo acima da declaracao.
    .split('export const PERMISSAO_DA_PAGINA')[1]
    .split('\n};')[0]
    .matchAll(/'([a-z-]+)':\s*'([a-z0-9_:]+)'/g)].map(m => [m[1], m[2]]),
);

const divergencias = [];
for (const page of new Set([...Object.keys(mapaServidor), ...Object.keys(mapaTela)])) {
  if (mapaServidor[page] !== mapaTela[page]) {
    divergencias.push(`  ${page}: servidor=${mapaServidor[page] ?? '(ausente)'} tela=${mapaTela[page] ?? '(ausente)'}`);
  }
}
if (divergencias.length) {
  falhou = true;
  console.error(`\nFALHA: ${divergencias.length} página(s) com mapa de permissão divergente entre api/_permissoes.ts e src/admin/papeis.ts:\n`);
  for (const d of divergencias) console.error(d);
}

const acesso = catalogo.filter(c => c.acesso).length;
const ui = catalogo.filter(c => c.apenasUi).length;
console.log(
  `\n${acoes.size} ações no handler, ${mapeadas.size} entradas no mapa, ` +
  `${catalogo.length} permissões no catálogo (${acesso} de acesso, ${ui} só de UI), ` +
  `${proprios.length} endpoints com porteiro próprio.`
);
if (falhou) process.exit(1);
console.log('OK - controle de acesso íntegro.');
