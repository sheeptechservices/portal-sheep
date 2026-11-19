// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: números, gráficos e relatórios das tarefas.
//
//  "Gráfico da tendência de tarefas do mês", "rank de quem mais concluiu, com
//  foto", "relatório completo em PDF". Três ferramentas:
//
//  - dados_de_tarefas: busca as tarefas no portal e faz as contas aqui, no
//    código (por dia, semana, pessoa, projeto, etapa ou prioridade). Contar
//    centenas de tarefas "de cabeça" é onde o modelo erra; aqui não erra.
//  - gerar_grafico: a imagem com a identidade da Sheep (graficos.mjs).
//  - gerar_relatorio: o relatório em PDF ou Word, com seções, tabelas e
//    gráficos.
//
//  Os arquivos vão para a pasta de mídias, e o modelo põe na resposta a linha
//  [[arquivo:caminho]]: quem manda no WhatsApp é o bot (index.mjs). Nada aqui
//  escreve no portal.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const PORTAL_MCP_URL = process.env.PORTAL_MCP_URL ?? '';
const PORTAL_MCP_TOKEN = process.env.PORTAL_MCP_TOKEN ?? '';
const MIDIA_DIR = resolve(process.env.MIDIA_DIR ?? '/app/trabalho/midia');
/** Teto de tarefas lidas numa conta: 25 páginas de 200. */
const TAREFAS_MAX = 5000;

export const AGRUPAMENTOS = ['dia', 'semana', 'responsavel', 'projeto', 'status', 'prioridade'];

const FERRAMENTAS = [
  {
    name: 'dados_de_tarefas',
    title: 'Números das tarefas',
    description: 'Conta as tarefas do portal num período, agrupadas por dia, semana, responsável, projeto, etapa ou '
      + 'prioridade. Traz criadas e concluídas no período, abertas e atrasadas agora, e as pessoas com a foto. As '
      + 'contas são exatas: use estes números nos gráficos e relatórios, em vez de contar com listar_tarefas.',
    inputSchema: {
      type: 'object',
      properties: {
        de: { type: 'string', description: 'Começo do período (AAAA-MM-DD), no horário de Brasília.' },
        ate: { type: 'string', description: 'Fim do período (AAAA-MM-DD), incluído. Padrão: hoje.' },
        agrupar: { type: 'string', enum: AGRUPAMENTOS, description: 'Como agrupar. Padrão: dia.' },
        projeto: { type: 'string', description: 'Só deste projeto (id de listar_projetos).' },
        responsavel: { type: 'string', description: 'Só deste responsável (id ou e-mail).' },
      },
      required: ['de'],
    },
  },
  {
    name: 'gerar_grafico',
    title: 'Gerar gráfico',
    description: 'Gera a imagem de um gráfico com a identidade da Sheep (logo, limão e preto). Tipos: linha '
      + '(tendência no tempo), barras (comparar categorias), ranking (pessoas ou itens em ordem, com foto) e rosca '
      + '(partes de um todo). Devolve o caminho do PNG: para mandar, ponha na resposta a linha [[arquivo:caminho]].',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['linha', 'barras', 'ranking', 'rosca'] },
        projeto: { type: 'string', description: 'Quando o material é de um cliente: o id do projeto (de listar_projetos). A logo do cliente entra ao lado da Sheep.' },
        titulo: { type: 'string', description: 'O título grande, curto.' },
        subtitulo: { type: 'string', description: 'Uma linha explicando o recorte (período, filtro).' },
        rotulo: { type: 'string', description: 'A palavrinha em limão acima do título. Padrão: Portal Sheep.' },
        rotulos: { type: 'array', items: { type: 'string' }, description: 'linha e barras: os rótulos do eixo X (dias, projetos).' },
        series: {
          type: 'array',
          description: 'linha e barras: cada série com nome e um valor por rótulo.',
          items: { type: 'object', properties: { nome: { type: 'string' }, valores: { type: 'array', items: { type: 'number' } } }, required: ['nome', 'valores'] },
        },
        itens: {
          type: 'array',
          description: 'ranking e rosca: nome, valor; no ranking também detalhe (linha menor) e foto (URL de dados_de_tarefas).',
          items: { type: 'object', properties: { nome: { type: 'string' }, valor: { type: 'number' }, detalhe: { type: 'string' }, foto: { type: 'string' } }, required: ['nome', 'valor'] },
        },
        destaques: {
          type: 'array',
          description: 'Até 4 números em destaque acima do gráfico, como "150 / criadas no mês".',
          items: { type: 'object', properties: { valor: { type: 'string' }, rotulo: { type: 'string' } }, required: ['valor', 'rotulo'] },
        },
      },
      required: ['tipo', 'titulo'],
    },
  },
  {
    name: 'gerar_relatorio',
    title: 'Gerar relatório',
    description: 'Gera um relatório completo em PDF ou Word (.docx) com a identidade da Sheep: capa, números em '
      + 'destaque e seções com texto, tabela e gráfico. Devolve o caminho: para mandar, ponha na resposta a linha '
      + '[[arquivo:caminho]].',
    inputSchema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: ['pdf', 'docx'] },
        projeto: { type: 'string', description: 'Quando o material é de um cliente: o id do projeto (de listar_projetos). A logo do cliente entra ao lado da Sheep.' },
        titulo: { type: 'string' },
        subtitulo: { type: 'string', description: 'O recorte: período, projeto, pessoa.' },
        rotulo: { type: 'string', description: 'A palavrinha acima do título. Padrão: Relatório.' },
        destaques: {
          type: 'array',
          items: { type: 'object', properties: { valor: { type: 'string' }, rotulo: { type: 'string' } }, required: ['valor', 'rotulo'] },
        },
        secoes: {
          type: 'array',
          description: 'As seções, em ordem. texto aceita **negrito**, *itálico* e linhas "- " para lista; tabela tem '
            + 'colunas e linhas (listas de textos); grafico tem o mesmo formato de gerar_grafico.',
          items: {
            type: 'object',
            properties: {
              titulo: { type: 'string' },
              texto: { type: 'string' },
              tabela: { type: 'object', properties: { colunas: { type: 'array', items: { type: 'string' } }, linhas: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } },
              grafico: { type: 'object' },
            },
            required: ['titulo'],
          },
        },
      },
      required: ['formato', 'titulo', 'secoes'],
    },
  },
  {
    name: 'gerar_peca',
    title: 'Gerar peça visual',
    description: 'Gera uma imagem PNG livre com a identidade da Sheep: comunicado, anúncio, convite, card de novidade, post, '
      + 'aviso, agenda, boas-vindas. O fundo com os feixes de luz, a logo (e a do cliente, com projeto), a fonte e as '
      + 'cores vêm prontos; você escreve só o conteúdo, em HTML, com as classes do kit, e escolhe o layout. '
      + 'Kit: cartao (contêiner de vidro escuro; cartao limao = contêiner limão com texto preto), rotulo (palavrinha em '
      + 'caixa alta limão), h1 ou titulo, h2, h3, sub (linha de apoio), p ou texto, em ou destaque (trecho em limão), '
      + 'selo (etiqueta limão; selo vazado), lista (ul.lista com li, marcador limão), passos (ol.passos, cada li com '
      + '<b>título</b><span>detalhe</span>, número em círculo limão), grade dois|tres|quatro (colunas), linha '
      + '(itens lado a lado), numero (número grande, com <small>legenda</small>), botao (chamada limão; botao vazado), '
      + 'divisor, icone (svg 24x24 de traço, fill none, stroke currentColor, stroke-width 1.8; icone grande), centro '
      + '(centraliza). Atributo style vale para ajustes finos de espaço e tamanho; a cor é a da marca. Sem emoji, sem '
      + 'imagem de fora. Em story e retrato, empilhe os blocos (grade dois no máximo); em paisagem e banner, use a largura. Devolve o caminho e se o conteúdo passou do espaço (transbordou): se passou, encurte e gere de '
      + 'novo. Para mandar, ponha na resposta a linha [[arquivo:caminho]].',
    inputSchema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: ['quadrado', 'retrato', 'story', 'paisagem', 'banner'],
          description: 'quadrado 1080x1080 (WhatsApp, feed), retrato 1080x1350 (feed do Instagram e LinkedIn), story 1080x1920, paisagem 1920x1080 (apresentação, e-mail), banner 1500x500 (capa).' },
        html: { type: 'string', description: 'O conteúdo, em HTML com as classes do kit. A logo e o fundo já vêm: não repita.' },
        titulo: { type: 'string', description: 'Nome do arquivo.' },
        projeto: { type: 'string', description: 'Quando a peça é de um cliente: o id do projeto (de listar_projetos). A logo dele entra ao lado da Sheep.' },
        rodape: { type: 'string', description: 'Linha pequena no pé (site, contato, data). Sem ela, a peça sai sem rodapé.' },
      },
      required: ['formato', 'html', 'titulo'],
    },
  },
  {
    name: 'gerar_transcricao',
    title: 'Gerar transcrição',
    description: 'Gera a transcrição de uma reunião em PDF ou Word (.docx), com a identidade da Sheep, buscando o texto '
      + 'no portal. Dá para ajustar sem reescrever: remover (os números n das falas, de transcricao_da_reuniao), '
      + 'trocar (textos ou nomes, de e para), titulo, resumo no topo e a minutagem. Devolve o caminho: para '
      + 'mandar, ponha na resposta a linha [[arquivo:caminho]].',
    inputSchema: {
      type: 'object',
      properties: {
        reuniao: { type: 'integer', description: 'Id da reunião no portal (de listar_reunioes).' },
        fireflies_id: { type: 'string', description: 'Id da reunião no Fireflies (de buscar_no_fireflies), no lugar de reuniao, para a que não foi anexada ao portal.' },
        formato: { type: 'string', enum: ['pdf', 'docx'] },
        titulo: { type: 'string', description: 'Padrão: o assunto da reunião.' },
        resumo: { type: 'string', description: 'Texto que entra antes da transcrição, numa seção Resumo. Aceita **negrito** e linhas "- ".' },
        remover: { type: 'array', items: { type: 'integer' }, description: 'Os números (n) das falas que saem do documento.' },
        trocar: {
          type: 'array',
          description: 'Trocas de texto em todas as falas e nos nomes de quem falou, na ordem dada.',
          items: { type: 'object', properties: { de: { type: 'string' }, para: { type: 'string' } }, required: ['de', 'para'] },
        },
        minutagem: { type: 'boolean', description: 'O minuto antes de cada fala. Padrão: sim.' },
      },
      required: ['formato'],
    },
  },
];

// ── Os números ──────────────────────────────────────────────────────────────

/** Brasília não tem horário de verão: o dia local é o instante menos 3 horas. */
const diaLocal = (iso) => (iso ? new Date(Date.parse(iso) - 3 * 3600_000).toISOString().slice(0, 10) : null);
const hojeLocal = () => diaLocal(new Date().toISOString());
const dataValida = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? '')) && !Number.isNaN(Date.parse(d));
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

function diasEntre(de, ate) {
  const dias = [];
  for (let t = Date.parse(`${de}T00:00:00Z`); t <= Date.parse(`${ate}T00:00:00Z`); t += 86400_000) dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}

/** A segunda-feira da semana do dia. */
function segundaDe(d) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

/** As contas, sobre a lista de tarefas como o portal devolve. Exportada para
 *  os testes. `pessoas` traz a foto de cada um. */
export function agregar(tarefas, { de, ate, agrupar = 'dia', pessoas = [], hoje = hojeLocal() }) {
  const noPeriodo = (d) => !!d && d >= de && d <= ate;
  const fechada = (t) => !!t.concluida_em;
  const atrasada = (t) => !fechada(t) && !!t.prazo && String(t.prazo).slice(0, 10) < hoje;
  const totais = {
    criadas_no_periodo: tarefas.filter(t => noPeriodo(diaLocal(t.criado_em))).length,
    concluidas_no_periodo: tarefas.filter(t => noPeriodo(diaLocal(t.concluida_em))).length,
    abertas_agora: tarefas.filter(t => !fechada(t)).length,
    atrasadas_agora: tarefas.filter(atrasada).length,
  };
  const base = { periodo: { de, ate, de_br: ddmm(de), ate_br: ddmm(ate) }, agrupado_por: agrupar, totais, tarefas_lidas: tarefas.length };

  if (agrupar === 'dia' || agrupar === 'semana') {
    const chave = agrupar === 'dia' ? (d) => d : segundaDe;
    const ordem = [...new Set(diasEntre(de, ate).map(chave))];
    const conta = (campo) => {
      const m = new Map(ordem.map(k => [k, 0]));
      for (const t of tarefas) {
        const d = diaLocal(t[campo]);
        if (noPeriodo(d)) m.set(chave(d), (m.get(chave(d)) ?? 0) + 1);
      }
      return ordem.map(k => m.get(k));
    };
    return {
      ...base,
      rotulos: ordem.map(k => (agrupar === 'dia' ? ddmm(k) : `sem. ${ddmm(k)}`)),
      series: [{ nome: 'Criadas', valores: conta('criado_em') }, { nome: 'Concluídas', valores: conta('concluida_em') }],
    };
  }

  // Por pessoa, projeto, etapa ou prioridade: uma linha por grupo, com as
  // quatro contas, da que mais concluiu para a que menos.
  const fotoDe = new Map(pessoas.map(p => [String(p.id), p.foto ?? null]));
  const grupos = new Map();
  const somar = (id, nome, t, extra = {}) => {
    const g = grupos.get(id) ?? { id, nome, concluidas_no_periodo: 0, criadas_no_periodo: 0, abertas_agora: 0, atrasadas_agora: 0, ...extra };
    if (noPeriodo(diaLocal(t.concluida_em))) g.concluidas_no_periodo += 1;
    if (noPeriodo(diaLocal(t.criado_em))) g.criadas_no_periodo += 1;
    if (!fechada(t)) g.abertas_agora += 1;
    if (atrasada(t)) g.atrasadas_agora += 1;
    grupos.set(id, g);
  };
  for (const t of tarefas) {
    if (agrupar === 'responsavel') {
      const donos = Array.isArray(t.responsaveis) && t.responsaveis.length ? t.responsaveis : [{ id: '', nome: 'Sem responsável' }];
      for (const p of donos) somar(String(p.id ?? ''), p.nome ?? 'Sem nome', t, { email: p.email ?? null, foto: fotoDe.get(String(p.id)) ?? null });
    } else if (agrupar === 'projeto') {
      somar(String(t.projeto_id ?? ''), t.projeto_nome ?? 'Sem projeto', t);
    } else {
      const v = String(t[agrupar] ?? '') || 'Sem valor';
      somar(v, v, t);
    }
  }
  const linhas = [...grupos.values()].sort((a, b) => b.concluidas_no_periodo - a.concluidas_no_periodo || b.abertas_agora - a.abertas_agora);
  return { ...base, grupos: linhas };
}

/** Uma chamada ao MCP do portal, que responde em JSON ou em SSE. */
async function portal(nome, argumentos) {
  const r = await fetch(PORTAL_MCP_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PORTAL_MCP_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argumentos } }),
    signal: AbortSignal.timeout(90_000),
  });
  const cru = await r.text();
  if (!r.ok) throw new Error(`o portal recusou (${r.status})`);
  const json = r.headers.get('content-type')?.includes('text/event-stream')
    ? cru.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop()
    : cru;
  const resp = JSON.parse(json ?? '{}');
  if (resp.error) throw new Error(resp.error.message ?? 'erro no portal');
  const texto = (resp.result?.content ?? []).map(c => c.text).filter(Boolean).join('\n');
  if (resp.result?.isError) throw new Error(texto || 'o portal não aceitou');
  return JSON.parse(texto || 'null');
}

async function dadosDeTarefas(a) {
  if (!dataValida(a.de)) throw new Error('de precisa ser uma data AAAA-MM-DD');
  const ate = a.ate ?? hojeLocal();
  if (!dataValida(ate)) throw new Error('ate precisa ser uma data AAAA-MM-DD');
  if (ate < a.de) throw new Error('o fim do período vem antes do começo');
  const agrupar = a.agrupar ?? 'dia';
  if (!AGRUPAMENTOS.includes(agrupar)) throw new Error(`agrupar precisa ser ${AGRUPAMENTOS.join(', ')}`);
  if ((agrupar === 'dia' && diasEntre(a.de, ate).length > 370)) throw new Error('período longo demais para agrupar por dia: use semana');
  const tarefas = [];
  let cursor;
  do {
    const pagina = await portal('listar_tarefas', {
      incluir_concluidas: true, limite: 200, ...(cursor ? { cursor } : {}),
      ...(a.projeto ? { projeto: a.projeto } : {}), ...(a.responsavel ? { responsavel: a.responsavel } : {}),
    });
    tarefas.push(...(pagina?.tarefas ?? []));
    cursor = pagina?.proximo ?? null;
  } while (cursor && tarefas.length < TAREFAS_MAX);
  const pessoas = agrupar === 'responsavel' ? await portal('listar_pessoas', {}).catch(() => []) : [];
  return { ...agregar(tarefas, { de: a.de, ate, agrupar, pessoas }), ...(cursor ? { aviso: `li só as ${tarefas.length} tarefas mais recentes` } : {}) };
}

// ── A logo do cliente ───────────────────────────────────────────────────────

const TIPOS_DE_LOGO = { svg: 'image/svg+xml', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** O cliente do projeto, com a logo já embutida (data URI), para a peça não
 *  buscar nada fora na hora de desenhar. Sem projeto, ou projeto sem logo, a
 *  peça sai só com a da Sheep. */
async function clienteDoProjeto(projetoId) {
  if (!projetoId) return null;
  const r = await portal('listar_projetos', {}).catch(() => null);
  const proj = (r?.projetos ?? []).find(x => String(x.id) === String(projetoId));
  if (!proj) throw new Error(`não achei o projeto ${projetoId} em listar_projetos`);
  if (!proj.logo?.url) return { nome: proj.cliente ?? proj.nome, logo: null };
  try {
    const resp = await fetch(proj.logo.url, { signal: AbortSignal.timeout(10_000) });
    const ext = String(proj.logo.url).toLowerCase().split('?')[0].split('.').pop();
    const tipo = (resp.headers.get('content-type') ?? '').split(';')[0] || TIPOS_DE_LOGO[ext];
    if (!resp.ok || !String(tipo).startsWith('image/')) return { nome: proj.cliente ?? proj.nome, logo: null };
    const b = Buffer.from(await resp.arrayBuffer());
    return { nome: proj.cliente ?? proj.nome, detalhe: !!proj.logo.detalhe, logo: `data:${tipo};base64,${b.toString('base64')}` };
  } catch {
    return { nome: proj.cliente ?? proj.nome, logo: null };
  }
}

// ── Os arquivos ─────────────────────────────────────────────────────────────

/** Nome de arquivo legível a partir do título. */
const nomeDoArquivo = (titulo) => String(titulo ?? 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'arquivo';

function gravar(conteudo, titulo, ext) {
  const caminho = join(MIDIA_DIR, `${Date.now()}-${randomBytes(4).toString('hex')}-${nomeDoArquivo(titulo)}.${ext}`);
  writeFileSync(caminho, conteudo, { mode: 0o600 });
  return caminho;
}

async function gerarGrafico(a) {
  const { graficoEmPng } = await import('./graficos.mjs');
  const cliente = await clienteDoProjeto(a.projeto);
  const caminho = gravar(await graficoEmPng({ ...a, cliente }), a.titulo, 'png');
  return { caminho, para_mandar: `[[arquivo:${caminho}]]` };
}

async function gerarPeca(a) {
  const { pecaEmPng, FORMATOS_DE_PECA } = await import('./graficos.mjs');
  if (!FORMATOS_DE_PECA[a.formato]) throw new Error(`formato precisa ser ${Object.keys(FORMATOS_DE_PECA).join(', ')}`);
  if (!String(a.html ?? '').trim()) throw new Error('a peça precisa de conteúdo em html');
  const cliente = await clienteDoProjeto(a.projeto);
  const r = await pecaEmPng({ ...a, cliente });
  const caminho = gravar(r.png, a.titulo, 'png');
  return {
    caminho, para_mandar: `[[arquivo:${caminho}]]`, tamanho: `${r.largura}x${r.altura}`,
    ...(r.transbordou ? { transbordou: true, aviso: 'o conteúdo passou do espaço da peça: encurte o texto ou tire um bloco e gere de novo' } : {}),
  };
}

async function gerarRelatorio(a) {
  if (!['pdf', 'docx'].includes(a.formato)) throw new Error('formato precisa ser pdf ou docx');
  if (!Array.isArray(a.secoes) || !a.secoes.length) throw new Error('o relatório precisa de ao menos uma seção');
  const g = await import('./graficos.mjs');
  const rel = { ...a, cliente: await clienteDoProjeto(a.projeto) };
  const conteudo = a.formato === 'pdf' ? await g.relatorioEmPdf(rel) : await g.relatorioEmDocx(rel);
  const caminho = gravar(conteudo, a.titulo, a.formato);
  return { caminho, para_mandar: `[[arquivo:${caminho}]]` };
}

/** "18/11/2026 às 14:30", no relógio de Brasília, de uma data que pode vir
 *  com hora ou só com o dia. */
function quandoFoi(v) {
  if (!v) return null;
  const so = /^\d{4}-\d{2}-\d{2}$/.test(String(v));
  const d = new Date(so ? `${v}T12:00:00-03:00` : v);
  if (Number.isNaN(d.getTime())) return String(v);
  const f = (o) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', ...o }).format(d);
  return so ? f({ day: '2-digit', month: '2-digit', year: 'numeric' })
    : `${f({ day: '2-digit', month: '2-digit', year: 'numeric' })} às ${f({ hour: '2-digit', minute: '2-digit' })}`;
}

/** A transcrição, com o que foi pedido na conversa: sem as falas removidas,
 *  com as trocas feitas e as falas seguidas da mesma pessoa juntas num bloco. */
export function montarTranscricao(falas, { remover = [], trocar = [], minutagem = true } = {}) {
  const fora = new Set(remover.map(Number));
  const troca = (s) => trocar.reduce((t, x) => (x?.de ? t.split(String(x.de)).join(String(x.para ?? '')) : t), String(s ?? ''));
  const blocosDeFala = [];
  for (const f of falas) {
    if (fora.has(Number(f.n))) continue;
    // Asterisco solto viraria negrito no documento: some do que foi dito.
    const texto = troca(f.texto).replace(/\*/g, '').trim();
    if (!texto) continue;
    const quem = troca(f.quem).replace(/\*/g, '').trim() || 'Alguém';
    const ultimo = blocosDeFala[blocosDeFala.length - 1];
    if (ultimo && ultimo.quem === quem) ultimo.textos.push(texto);
    else blocosDeFala.push({ quem, inicio: f.inicio, textos: [texto] });
  }
  const paragrafos = blocosDeFala.map(b => `**${minutagem && b.inicio ? `[${b.inicio}] ` : ''}${b.quem}:** ${b.textos.join(' ')}`);
  return { texto: paragrafos.join('\n\n'), blocos: blocosDeFala.length, falas: blocosDeFala.reduce((n, b) => n + b.textos.length, 0) };
}

async function gerarTranscricao(a) {
  if (!['pdf', 'docx'].includes(a.formato)) throw new Error('formato precisa ser pdf ou docx');
  const doPortal = a.reuniao != null && a.reuniao !== '';
  if (doPortal && !Number.isInteger(Number(a.reuniao))) throw new Error('reuniao precisa ser o id da reunião, de listar_reunioes');
  if (!doPortal && !String(a.fireflies_id ?? '').trim()) throw new Error('diga a reunião: reuniao (id no portal) ou fireflies_id (de buscar_no_fireflies)');
  const t = await portal('transcricao_da_reuniao', doPortal
    ? { reuniao: Number(a.reuniao), limite: 5000 }
    : { fireflies_id: String(a.fireflies_id).trim(), limite: 5000 });
  const montada = montarTranscricao(t?.falas ?? [], {
    remover: Array.isArray(a.remover) ? a.remover : [], trocar: Array.isArray(a.trocar) ? a.trocar : [], minutagem: a.minutagem !== false,
  });
  if (!montada.falas) throw new Error('não sobrou fala nenhuma depois dos cortes');
  const trocaNoTitulo = (s) => (Array.isArray(a.trocar) ? a.trocar : []).reduce((x, y) => (y?.de ? x.split(String(y.de)).join(String(y.para ?? '')) : x), String(s ?? ''));
  const titulo = a.titulo || t?.reuniao?.assunto || t?.titulo || 'Reunião';
  const participantes = (Array.isArray(t?.participantes) ? t.participantes : []).map(trocaNoTitulo).filter(Boolean);
  const subtitulo = [quandoFoi(t?.data ?? t?.reuniao?.data), t?.duracao_minutos ? `${Math.round(t.duracao_minutos)} min` : null,
    participantes.length ? `Participantes: ${participantes.join(', ')}` : null].filter(Boolean).join(' | ');
  const secoes = [];
  if (a.resumo) secoes.push({ titulo: 'Resumo', texto: String(a.resumo) });
  secoes.push({ titulo: 'Transcrição', texto: montada.texto });
  const g = await import('./graficos.mjs');
  const rel = { rotulo: 'Transcrição', titulo, subtitulo, secoes, cliente: await clienteDoProjeto(t?.reuniao?.projeto?.id).catch(() => null) };
  const conteudo = a.formato === 'pdf' ? await g.relatorioEmPdf(rel) : await g.relatorioEmDocx(rel);
  const caminho = gravar(conteudo, `Transcrição - ${titulo}`, a.formato);
  return {
    caminho, para_mandar: `[[arquivo:${caminho}]]`,
    falas_no_documento: montada.falas, falas_removidas: (t?.falas ?? []).length - montada.falas, total_de_falas: t?.total_de_falas ?? null,
  };
}

// ── O protocolo ─────────────────────────────────────────────────────────────

const EXECUTAR = { dados_de_tarefas: dadosDeTarefas, gerar_grafico: gerarGrafico, gerar_relatorio: gerarRelatorio, gerar_peca: gerarPeca, gerar_transcricao: gerarTranscricao };
const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'relatorios', version: '1.0.0' },
    } });
  }
  if (id === undefined) return;
  if (method === 'ping') return enviar({ id, result: {} });
  if (method === 'tools/list') return enviar({ id, result: { tools: FERRAMENTAS } });
  if (method === 'tools/call') {
    const executar = EXECUTAR[params?.name];
    if (!executar) return enviar({ id, error: { code: -32602, message: `ferramenta desconhecida: ${params?.name}` } });
    try {
      const r = await executar(params.arguments ?? {});
      return enviar({ id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } });
    } catch (e) {
      return enviar({ id, result: { content: [{ type: 'text', text: `Não deu: ${e?.message ?? e}` }], isError: true } });
    }
  }
  return enviar({ id, error: { code: -32601, message: `método não suportado: ${method}` } });
}

// Importado pelos testes só pela função de contas; servidor de verdade só
// quando rodado direto.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  createInterface({ input: process.stdin }).on('line', (l) => {
    if (!l.trim()) return;
    let pedido;
    try { pedido = JSON.parse(l); } catch { return; }
    void tratar(pedido);
  });
}
