import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getAnthropicCredential } from './_credentials.js';
import { getDiretrizesAtivas, buildDiretrizesBloco, type DiretrizCategoria } from './_diretrizes.js';
import { suportaStructuredOutputs } from './_extracao-schema.js';

// Schema das regras candidatas extraídas de um markdown de metodologia.
const SUGESTOES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sugestoes'],
  properties: {
    sugestoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categoria', 'escopo', 'instrucao', 'exemplo', 'secao', 'confianca'],
        properties: {
          categoria: {
            type: 'string',
            enum: ['extracao', 'interpretacao', 'decisao'],
            description: 'extracao = como ler os documentos; interpretacao = como avaliar/ler os dados; decisao = política de taxa, limite, exigências.',
          },
          escopo: { type: 'string', description: '"global", ou "segmento:xxx" / "produto:xxx" quando a regra só valer nesse caso.' },
          instrucao: { type: 'string', description: 'A regra em UMA frase imperativa, autossuficiente, sem referência ao documento de origem.' },
          exemplo: { type: 'string', description: 'Exemplo concreto citado no texto, ou string vazia se não houver.' },
          secao: { type: 'string', description: 'Título/trecho do markdown de onde a regra saiu, para o operador conferir.' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'], description: 'Quão claramente o texto original expressa isso como regra (baixa se foi inferência sua).' },
        },
      },
    },
  },
} as const;

// Chamada padrão à API de mensagens da Anthropic → texto da 1ª parte
async function anthropicText(cred: { apiKey: string; model: string }, system: string, userContent: string, maxTokens = 4096): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cred.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cred.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userContent }] }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[ai-parecer] anthropic error', response.status, errText.slice(0, 300));
    return { ok: false, status: response.status, text: '' };
  }
  const data = await response.json() as { content?: Array<{ text?: string }> };
  return { ok: true, status: 200, text: data.content?.[0]?.text ?? '' };
}

function parseJson(text: string): any {
  try { return JSON.parse(text); } catch { /* tenta extrair */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
};

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

const SYSTEM = `Você é um analista de crédito sênior da DUX Factoring, especializado em antecipação de recebíveis (factoring). Sua função é emitir uma OPINIÃO DE CRÉDITO consultiva e embasada para a etapa de Decisão.

IMPORTANTE:
- Você NÃO toma a decisão final - quem decide é o operador humano. Você entrega uma recomendação fundamentada que ele vai conferir.
- Baseie-se ESTRITAMENTE nos dados fornecidos (cadastro, DEPS, balanço/faturamento, lastro, motor de risco). NUNCA invente números.
- Quando um dado essencial estiver ausente, aponte isso como ponto de atenção e reflita na confiança.
- Cite as fontes concretas na argumentação (ex.: "score DEPS 720 do sacado", "protestos de R$ 18k = 6% do faturamento", "lastro vencido há 12 dias").
- Seja objetivo e técnico. Nada de floreio.

SOBRE OS DADOS DA DEPS:
O contexto traz \`deps\` (resumo) e \`deps_completo\` (dossiê da consulta inteira, por parte). Quando \`deps_completo\` existir, é a fonte preferencial - use assim:
- \`parecer_da_deps\`: a política de crédito da PRÓPRIA DEPS já rodada, com cada regra e o motivo de falha. Não é a nossa decisão e não substitui a sua análise, mas uma regra obrigatória reprovada é fato relevante e deve ser endereçada explicitamente (concordando ou divergindo com justificativa).
- \`smart.pontos_positivos\` / \`pontos_negativos\`: traga o \`impacto_politica_pct\` ao citar - é o peso do fator, não só a presença dele.
- \`smart.limite_sugerido\` e \`smart.faixas_de_limite\`: referência externa para o limite. Se você sugerir um limite fora dessa faixa, justifique a divergência.
- \`pendencias_restricoes.ocorrencias\`: sempre confira informante, valor e \`data_debito\`. Pendência antiga e única pesa diferente de recorrência recente - diga qual é o caso.
- \`pontualidade_mensal\`: leia a TENDÊNCIA (melhora/piora nos meses recentes), não só a média.
- \`quadro_societario\`: \`data_entrada\` recente de sócio e \`tem_restricao: true\` são pontos de atenção. \`empresas_dos_socios\` revela exposição do grupo.
- \`blocos_sem_ocorrencia\`: a DEPS foi consultada e NÃO achou nada nesses itens. Isso é sinal POSITIVO - trate como ausência confirmada de restrição, nunca como dado faltante.
- \`risco_instituicoes_financeiras\`: conceitos (CRÍTICO/ATENÇÃO/EXCELENTE) do comportamento junto a bancos; \`indicadores_sem_informacao\` são lacunas reais.
- \`_truncado\`: avisa que alguma lista foi cortada por tamanho - reflita isso na confiança.
Se \`deps_completo\` vier null para uma parte, a consulta é antiga (só o resumo foi guardado) ou não foi feita: aponte como limitação da análise.`;

const PARECER_SHAPE = `{
  "recomendacao": "aprovado" | "condicionantes" | "reprovado",
  "confianca": "alta" | "media" | "baixa",
  "taxa_sugerida": "x,xx (% a.m., use vírgula decimal) ou null",
  "limite_sugerido": número em reais (sem R$, sem separador de milhar) ou null,
  "tipo_operacao": "ANUÊNCIA" | "ESCROW" | "COMISSIONÁRIA" | null,
  "resumo": "2 a 4 linhas com a conclusão principal",
  "pontos_fortes": ["fatores que favorecem a aprovação, com dados"],
  "pontos_atencao": ["fatores de risco ou dados faltantes, com dados"],
  "condicionantes_sugeridas": [
    {"texto": "descrição da condicionante", "resp": "Cedente" | "Sacado" | "DUX", "tipo": "Condicionante" | "Adequação" | "Bloqueante"}
  ],
  "alertas": ["red flags críticos que exigem atenção imediata (pode ser vazio)"],
  "argumentacao": "texto corrido de 6 a 12 linhas, técnico e embasado, explicando o raciocínio que levou à recomendação, cruzando cedente x sacado x lastro x restrições e justificando taxa, limite e tipo de operação."
}`;

const OUTPUT_INSTRUCTIONS = `Retorne APENAS JSON válido (sem markdown, sem backticks), no formato:

${PARECER_SHAPE}`;

// ── Ajuste incremental do parecer (correção do operador) ─────────────────────
const ADJUST_SYSTEM = `${SYSTEM}

MODO DE AJUSTE INCREMENTAL:
Já existe um parecer emitido. O operador humano apontou uma correção. Seu trabalho NÃO é reanalisar tudo do zero - é ajustar CIRURGICAMENTE apenas o que a correção afeta, preservando o restante da análise que continua válido.

REGRAS:
- Se a correção for VAGA ou AMBÍGUA (não deixa claro a qual documento, campo ou valor se refere, ou qual o valor/interpretação correta), NÃO adivinhe: faça uma pergunta objetiva ao operador, referenciando os dados concretos disponíveis (ex.: "Você se refere ao faturamento do Balanço (R$ X) ou da Declaração (R$ Y)? O valor correto é anual ou mensal?").
- Se a correção for clara, aplique-a de forma INCREMENTAL: altere SOMENTE os campos do parecer impactados pela mudança, cruzando a nova informação com os demais dados (que permanecem iguais). Não reescreva campos não afetados.
- Uma correção pode cascatear: se muda um dado que afeta risco/taxa/limite/tipo, atualize também esses campos derivados e a argumentação - mas apenas esses.
- Nunca invente números. Baseie-se nos dados fornecidos e na correção do operador.`;

const ADJUST_OUTPUT = `Retorne APENAS JSON válido (sem markdown, sem backticks). Escolha UMA das duas formas:

1) Se precisar de esclarecimento:
{ "acao": "perguntar", "pergunta": "pergunta objetiva referenciando os dados concretos" }

2) Se puder aplicar a correção:
{
  "acao": "ajustar",
  "patch": { <apenas as chaves do parecer que mudaram, com os novos valores, no mesmo formato do parecer> },
  "campos_alterados": ["lista dos nomes das chaves alteradas"],
  "impacto": ["breve lista do que foi afetado, ex.: 'risco reavaliado para elevado', 'taxa ajustada'"],
  "nota": "1 a 2 linhas explicando o que mudou e por quê"
}

O parecer completo tem este formato (para referência das chaves do patch):
${PARECER_SHAPE}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });

  let db;
  let sessao;
  try {
    db = getDb();
    sessao = await getAdminSession(db, sessionToken);
    if (!sessao) return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    console.error('[ai-parecer] session error', err);
    return res.status(500).json({ error: 'Erro interno' });
  }

  // Dois usos na mesma rota: `markdown: true` é a importação de metodologia da
  // aba Diretrizes; o resto é o parecer da análise. Permissões diferentes.
  const recusa = await exigir(db, sessao.usuario, req.body?.markdown === true ? 'credito:diretrizes' : 'credito:parecer');
  if (recusa) return res.status(recusa.status).json(recusa.body);

  // Parecer da IA tem custo de token: fica registrado quem pediu.
  await registrarAuditoria(db, sessao.usuario, req.body?.markdown === true ? 'ai-parecer:diretrizes' : 'ai-parecer');

  const cred = await getAnthropicCredential(db);
  if (!cred) {
    return res.status(400).json({ error: 'Integração com a Anthropic não configurada. Adicione a chave da API em Configurações › Integrações.' });
  }

  // ── MODO MARKDOWN: transforma a metodologia escrita do analista em regras ────
  // O documento do analista é prosa (títulos, tabelas, observações). Aqui a IA
  // só PROPÕE regras candidatas - quem decide o que entra é o operador na tela.
  if (req.body?.markdown === true) {
    const texto = String(req.body?.texto ?? '').trim();
    if (!texto) return res.status(400).json({ error: 'Markdown vazio.' });
    if (texto.length > 200_000) return res.status(400).json({ error: 'Documento muito longo (máx. ~200 mil caracteres).' });
    try {
      const ativas = await getDiretrizesAtivas(db);
      const jaExistem = ativas.length
        ? `\n\nREGRAS JÁ CADASTRADAS (não repita nenhuma equivalente):\n${ativas.map(d => `- [${d.categoria}] ${d.instrucao}`).join('\n')}`
        : '';
      const sys = `Você é um curador da base de regras de crédito da DUX Factoring. Recebe a metodologia escrita por um analista de crédito (em markdown) e a converte em REGRAS OPERACIONAIS que serão injetadas no prompt da IA de análise.

COMO CONVERTER:
- Cada regra deve ser UMA frase imperativa, autossuficiente e verificável ("Recompra sempre exige aval do sócio"), nunca uma paráfrase vaga do texto ("considerar o aval").
- Classifique em: "extracao" (como ler/identificar dados nos documentos), "interpretacao" (como avaliar os dados lidos) ou "decisao" (política: taxa, limite, tipo de operação, exigências).
- Use escopo "global" salvo quando o texto restringir a um segmento ou produto - aí use "segmento:xxx" ou "produto:xxx".
- Se o texto trouxer números, faixas ou limiares, PRESERVE-OS na regra - é o que a torna aplicável.
- NÃO invente política que o texto não afirma. Se for uma inferência sua, marque confiança "baixa".
- Ignore o que for contexto, histórico, explicação de conceito ou instrução para humano (ex.: "abrir o sistema X") - só interessa o que muda uma análise.
- Prefira poucas regras boas a muitas redundantes. Não divida uma mesma política em várias linhas.${jaExistem}`;

      const usr = `=== METODOLOGIA DO ANALISTA (markdown) ===\n${texto}\n\nExtraia as regras operacionais deste documento.`;

      const body: any = {
        model: cred.model,
        max_tokens: 8192,
        system: sys,
        messages: [{ role: 'user', content: usr }],
      };
      if (suportaStructuredOutputs(cred.model)) {
        body.output_config = { format: { type: 'json_schema', schema: SUGESTOES_SCHEMA } };
      }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': cred.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => '');
        console.error('[ai-parecer markdown]', r.status, errText.slice(0, 300));
        return res.status(502).json({ error: `Erro na API da Anthropic (${r.status}).` });
      }
      const data = await r.json() as { content?: Array<{ text?: string }> };
      const parsed = parseJson(data.content?.map(b => b.text ?? '').join('') ?? '') ?? {};
      const lista = Array.isArray(parsed.sugestoes) ? parsed.sugestoes : [];
      const validas = ['extracao', 'interpretacao', 'decisao'];
      const sugestoes = lista
        .map((s: any) => ({
          categoria: String(s?.categoria ?? ''),
          escopo: String(s?.escopo ?? 'global').trim() || 'global',
          instrucao: String(s?.instrucao ?? '').trim(),
          exemplo: String(s?.exemplo ?? '').trim(),
          secao: String(s?.secao ?? '').trim(),
          confianca: String(s?.confianca ?? 'media'),
        }))
        .filter((s: any) => s.instrucao && validas.includes(s.categoria));
      return res.status(200).json({ ok: true, sugestoes, model: cred.model });
    } catch (err: any) {
      console.error('[ai-parecer markdown]', err);
      return res.status(500).json({ error: err?.message ?? 'Erro ao ler o documento.' });
    }
  }

  // ── MODO CONFLITO: checagem assistida por IA de uma regra candidata ──────────
  if (req.body?.conflito === true) {
    const categoria = String(req.body?.categoria ?? '') as DiretrizCategoria;
    const escopo = String(req.body?.escopo ?? 'global');
    const instrucao = String(req.body?.instrucao ?? '').trim();
    if (!instrucao) return res.status(400).json({ error: 'Regra candidata vazia.' });
    try {
      // Candidatos: regras ativas da mesma categoria (a IA julga sobreposição de escopo)
      const ativas = await getDiretrizesAtivas(db, categoria ? [categoria] : undefined);
      if (ativas.length === 0) return res.status(200).json({ ok: true, conflitos: [] });

      const lista = ativas.map(d => `#${d.id} [${d.escopo}] ${d.instrucao}`).join('\n');
      const sys = 'Você é um curador da base de regras de crédito da DUX. Sua tarefa é detectar contradições entre uma regra NOVA e as regras já existentes. Duas regras só conflitam se, no MESMO escopo (ou escopos sobrepostos), levarem a conclusões opostas. Regras de escopo mais específico apenas ESPECIALIZAM as gerais - isso NÃO é conflito. Considere sinônimos e paráfrases.';
      const usr = [
        `REGRA NOVA (categoria: ${categoria}, escopo: ${escopo}):`,
        instrucao,
        '',
        'REGRAS EXISTENTES ATIVAS:',
        lista,
        '',
        'Retorne APENAS JSON válido: { "conflitos": [ { "id": <id da regra conflitante>, "motivo": "por que conflita, em 1 linha" } ] }. Se não houver conflito, retorne { "conflitos": [] }.',
      ].join('\n');

      const r = await anthropicText(cred, sys, usr, 1024);
      if (!r.ok) return res.status(502).json({ error: `Erro na API da Anthropic (${r.status}).` });
      const parsed = parseJson(r.text) ?? { conflitos: [] };
      const idsValidos = new Set(ativas.map(d => d.id));
      const conflitos = (Array.isArray(parsed.conflitos) ? parsed.conflitos : [])
        .map((c: any) => ({ id: Number(c.id), motivo: String(c.motivo ?? '') }))
        .filter((c: any) => idsValidos.has(c.id))
        .map((c: any) => ({ ...c, instrucao: ativas.find(d => d.id === c.id)?.instrucao ?? '', escopo: ativas.find(d => d.id === c.id)?.escopo ?? '' }));
      return res.status(200).json({ ok: true, conflitos });
    } catch (err: any) {
      console.error('[ai-parecer conflito]', err);
      return res.status(500).json({ error: err?.message ?? 'Erro ao checar conflitos.' });
    }
  }

  const ctx = req.body?.contexto;
  if (!ctx || typeof ctx !== 'object') {
    return res.status(400).json({ error: 'Contexto da análise ausente.' });
  }

  // Modo AJUSTE: correção incremental de um parecer já emitido
  const isAjuste = req.body?.ajuste === true;
  const parecerAtual = req.body?.parecer_atual;
  const mensagens: Array<{ autor: string; texto: string }> = Array.isArray(req.body?.mensagens) ? req.body.mensagens : [];

  // Injeta as diretrizes da casa (interpretação + decisão) no system prompt
  const diretrizes = await getDiretrizesAtivas(db, ['interpretacao', 'decisao']);
  const bloco = buildDiretrizesBloco(diretrizes);
  const baseSystem = isAjuste ? ADJUST_SYSTEM : SYSTEM;
  const system = bloco ? `${baseSystem}\n\n${bloco}` : baseSystem;
  const userContent = isAjuste
    ? [
        'Ajuste o parecer existente conforme a correção do operador, de forma incremental.',
        '',
        '=== PARECER ATUAL (JSON) ===',
        JSON.stringify(parecerAtual ?? {}, null, 2),
        '',
        '=== DADOS DA ANÁLISE (JSON) ===',
        'Prefixos: `ced-*` = cedente, `sac-*` = sacado, `lastro-*` = lastro, `dec-*` = decisão do operador.',
        JSON.stringify(ctx, null, 2),
        '',
        '=== CONVERSA DE AJUSTE (mais recente por último) ===',
        mensagens.length ? mensagens.map(m => `[${m.autor}] ${m.texto}`).join('\n') : '(nenhuma)',
        '',
        ADJUST_OUTPUT,
      ].join('\n')
    : [
        'Analise a operação abaixo e emita a opinião de crédito.',
        '',
        'Os campos do formulário usam prefixos: `ced-*` = cedente, `sac-*` = sacado, `lastro-*` = lastro/recebível, `dec-*` = campos de decisão já preenchidos pelo operador (se houver).',
        'O bloco `deps_completo` traz o dossiê integral da consulta DEPS de cada parte - priorize-o sobre o `deps` resumido.',
        '',
        '=== DADOS DA ANÁLISE (JSON) ===',
        JSON.stringify(ctx, null, 2),
        '',
        OUTPUT_INSTRUCTIONS,
      ].join('\n');

  if (isAjuste && (!parecerAtual || typeof parecerAtual !== 'object')) {
    return res.status(400).json({ error: 'Parecer atual ausente para ajuste.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cred.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cred.model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ai-parecer] anthropic error', response.status, errText.slice(0, 300));
      return res.status(502).json({ error: `Erro na API da Anthropic (${response.status}).` });
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    if (!parsed) {
      return res.status(502).json({ error: 'A resposta da IA não pôde ser interpretada.' });
    }

    if (isAjuste) {
      // acao: 'perguntar' → pede esclarecimento; 'ajustar' → patch dos campos afetados
      return res.status(200).json({ ok: true, ajuste: parsed, model: cred.model });
    }

    return res.status(200).json({ ok: true, parecer: parsed, model: cred.model });
  } catch (err: any) {
    console.error('[ai-parecer]', err);
    return res.status(500).json({ error: err?.message ?? 'Erro ao gerar parecer.' });
  }
}
