/**
 * Importa as candidaturas exportadas do sistema antigo para o banco de talentos.
 *
 * Lê os PDFs com `ler-candidaturas.mjs` e grava uma linha em `talentos_externos`
 * por candidatura, mais uma linha em `talento_habilidades` por habilidade
 * declarada.
 *
 * Roda duas vezes sem duplicar: a chave é o `id_origem` (o "#11" da ficha) e,
 * para quem já estava cadastrado à mão no portal, o e-mail. Encontrando um dos
 * dois, atualiza a linha em vez de criar outra - e não mexe na `situacao`, que
 * a essa altura é decisão de quem está conduzindo a conversa, não do arquivo.
 *
 * Uso:
 *   node scripts/importar-candidaturas.mjs "<pasta>"           (ensaio: não grava)
 *   node scripts/importar-candidaturas.mjs "<pasta>" --apply   (grava)
 *
 * `--url=file:teste.db` aponta para outra base - é como o ensaio é conferido
 * antes de encostar na de produção.
 */
import { createClient } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { lerCandidaturas } from './ler-candidaturas.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');
const PASTA = process.argv[2];
if (!PASTA) {
  console.error('Uso: node scripts/importar-candidaturas.mjs "<pasta>" [--apply]');
  process.exit(1);
}

const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const urlManual = process.argv.find(a => a.startsWith('--url='))?.slice(6);
const db = urlManual
  ? createClient({ url: urlManual })
  : createClient({ url: envVars.TURSO_DATABASE_URL, authToken: envVars.TURSO_AUTH_TOKEN });

/** O status do sistema antigo vira a situação da casa. "Aprovada" já é uma
 *  conversa em andamento; "Visualizada" é alguém que chegou e ninguém respondeu
 *  ainda. O rótulo original fica em `status_origem`, então nada se perde. */
const SITUACAO = { Aprovada: 'conversando', Visualizada: 'novo' };

/** As colunas que a candidatura preenche. `situacao` e `criado_em` ficam de
 *  fora da atualização de propósito - ver o cabeçalho. */
const CAMPOS = [
  'nome', 'email', 'telefone', 'interesse', 'origem',
  'nascimento', 'sexo', 'cidade', 'estado', 'uf', 'linkedin', 'github',
  'vaga', 'modelo_trabalho', 'contratacao',
  'resumo', 'senioridade', 'tempo_experiencia', 'nivel_ingles', 'outro_idioma',
  'possui_cnpj', 'regime_fiscal', 'case_sucesso',
  'indicado_por', 'indicado_por_email',
  'id_origem', 'status_origem', 'candidatura_em', 'atualizado_origem_em',
];

function paraLinha(c) {
  return {
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    // O papel principal é o que a pessoa quer fazer aqui, que é o que a coluna
    // `interesse` sempre guardou.
    interesse: c.papel,
    origem: c.indicado_por ? 'Indicação' : 'Candidatura (sistema antigo)',
    nascimento: c.nascimento,
    sexo: c.sexo,
    cidade: c.cidade,
    estado: c.estado,
    uf: c.uf,
    linkedin: c.linkedin,
    github: c.github,
    vaga: c.vaga,
    modelo_trabalho: c.modelo,
    contratacao: c.contratacao,
    resumo: c.resumo,
    senioridade: c.senioridade,
    tempo_experiencia: c.experiencia,
    nivel_ingles: c.ingles,
    outro_idioma: c.outro_idioma,
    possui_cnpj: c.possui_cnpj,
    regime_fiscal: c.regime_fiscal,
    case_sucesso: c.case_sucesso,
    indicado_por: c.indicado_por,
    indicado_por_email: c.indicado_por_email,
    id_origem: c.id_origem,
    status_origem: c.status_origem,
    candidatura_em: c.candidatura_em,
    atualizado_origem_em: c.atualizado_origem_em,
  };
}

async function rodar() {
  const candidaturas = await lerCandidaturas(PASTA);
  console.log(`${candidaturas.length} candidaturas lidas de ${PASTA}\n`);

  const existentes = await db.execute(
    'SELECT id, nome, email, id_origem FROM talentos_externos',
  );
  const porOrigem = new Map();
  const porEmail = new Map();
  for (const r of existentes.rows) {
    if (r.id_origem) porOrigem.set(String(r.id_origem), r);
    if (r.email) porEmail.set(String(r.email).toLowerCase(), r);
  }

  let novos = 0, atualizados = 0, habilidades = 0;
  for (const c of candidaturas) {
    const linha = paraLinha(c);
    const achado = (c.id_origem && porOrigem.get(c.id_origem))
      || (c.email && porEmail.get(c.email));
    const id = achado ? String(achado.id) : randomUUID();
    const acao = achado ? 'atualiza' : 'cria';
    if (achado) atualizados++; else novos++;
    habilidades += c.habilidades.length;

    console.log(`${acao.padEnd(8)} #${c.id_origem ?? '?'} ${c.nome}`);
    console.log(`         ${linha.interesse ?? '-'} | ${linha.senioridade ?? '-'} | ${linha.tempo_experiencia ?? '-'}`
      + ` | ${[linha.cidade, linha.uf].filter(Boolean).join('/') || 'sem local'}`
      + ` | ${c.habilidades.length} habilidades`
      + `${achado ? '' : ` | situação ${SITUACAO[c.status_origem] ?? 'novo'}`}`);

    if (!APPLY) continue;

    if (achado) {
      await db.execute({
        sql: `UPDATE talentos_externos SET ${CAMPOS.map(k => `${k} = ?`).join(', ')} WHERE id = ?`,
        args: [...CAMPOS.map(k => linha[k] ?? null), id],
      });
    } else {
      const colunas = [...CAMPOS, 'id', 'situacao', 'criado_em', 'criado_por_nome'];
      await db.execute({
        sql: `INSERT INTO talentos_externos (${colunas.join(', ')})
              VALUES (${colunas.map(() => '?').join(', ')})`,
        args: [
          ...CAMPOS.map(k => linha[k] ?? null),
          id,
          SITUACAO[c.status_origem] ?? 'novo',
          // A data da candidatura é quando esta pessoa chegou até a casa. Usar
          // "hoje" faria 24 pessoas parecerem ter chegado no mesmo minuto.
          c.candidatura_em ?? new Date().toISOString(),
          'Importação do sistema antigo',
        ],
      });
    }

    // As habilidades são substituídas, e não somadas: o arquivo é a fonte, e
    // rodar de novo não pode empilhar a mesma habilidade duas vezes.
    await db.execute({
      sql: 'DELETE FROM talento_habilidades WHERE tipo = ? AND pessoa_id = ?',
      args: ['externo', id],
    });
    for (const h of c.habilidades) {
      await db.execute({
        sql: `INSERT INTO talento_habilidades (tipo, pessoa_id, nome, tempo, nivel)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT (tipo, pessoa_id, nome) DO UPDATE
                SET tempo = excluded.tempo, nivel = excluded.nivel`,
        args: ['externo', id, h.nome, h.tempo, h.nivel],
      });
    }
  }

  console.log(`\n${novos} a criar, ${atualizados} a atualizar, ${habilidades} habilidades.`);
  console.log(APPLY ? 'Gravado.' : 'Ensaio: nada foi gravado. Rode com --apply para valer.');
}

rodar().catch(e => { console.error(e); process.exit(1); });
