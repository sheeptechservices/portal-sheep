import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getAnthropicCredential } from './_credentials.js';
import { getDiretrizesAtivas, buildDiretrizesBloco } from './_diretrizes.js';
import { DOC_SCHEMA, SINTESE_SCHEMA, suportaStructuredOutputs } from './_extracao-schema.js';

export const config = {
  api: { bodyParser: { sizeLimit: '40mb' } },
};

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

// Armazenamento temporário dos documentos da interpretação por IA, em CHUNKS.
// Cada arquivo é fatiado em pedaços pequenos e enviado 1 pedaço por requisição
// (evita o limite de body da função Vercel, mesmo com arquivos > 4,5 MB).
// A interpretação lê os pedaços de UM arquivo por vez, remonta e limpa.
async function ensureAnaliseTemp(db: ReturnType<typeof getDb>) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS analise_temp_chunks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      file_id    TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      filename   TEXT NOT NULL,
      chunk      TEXT NOT NULL,
      criado_em  TEXT NOT NULL
    )
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Leitura HÍBRIDA, um documento por chamada.
//
//  Antes: uma única chamada recebia TODOS os documentos e devolvia ~60 campos
//  num JSON só. Isso trocava dados de cedente e sacado (relatórios de crédito
//  têm template idêntico - só o CNPJ diferencia), estourava max_tokens com
//  muitos anexos e não dava como saber o que conferir.
//
//  Agora, por documento: a imagem/PDF vai junto com (1) o texto extraído no
//  navegador (camada de texto do PDF ou OCR do tesseract) e (2) as âncoras de
//  identidade da operação. O modelo reconcilia as duas leituras, atribui cada
//  campo à parte certa e devolve confiança + fonte por campo.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_EXTRACAO = `Você é um analista de crédito da DUX Factoring especializado em antecipação de recebíveis. Sua tarefa é EXTRAIR dados de UM documento por vez - com fidelidade absoluta.

REGRAS CRÍTICAS:
- NUNCA invente. Se um dado não está no documento, simplesmente não o inclua na lista de campos.
- Você recebe DUAS leituras do mesmo documento: a IMAGEM/PDF e um TEXTO extraído localmente (camada de texto do PDF ou OCR). Elas erram de formas diferentes.
  · Quando concordarem, a confiança é alta.
  · Quando DISCORDAREM num número (score, valor, CNPJ, data), confie na IMAGEM (o OCR troca dígitos), rebaixe a confiança e registre em "divergencias".
  · Quando o texto vier vazio ou ilegível, use apenas a imagem e rebaixe a confiança.
- ATRIBUIÇÃO DE PARTE é o ponto mais sensível: relatórios de crédito de cedente e de sacado têm o MESMO template. Decida por CNPJ/razão social confrontados com as âncoras da operação, nunca pela ordem ou pela aparência. Se o CNPJ do documento não casar com nenhuma âncora, use a chave da parte que o próprio documento indicar e rebaixe a confiança.
- Numa Nota Fiscal, o PRESTADOR é o cedente e o TOMADOR é o sacado.
- Preserve o formato brasileiro dos valores (1.234,56) e das datas (dd/mm/aaaa).
- Para relatórios de crédito (DEPs Smart, Quod VerifiQ, Serasa) extraia tudo que houver: score, classificação, protestos (quantidade E valor), pendências, ações judiciais (quantidade E valor), pontualidade, faturamento presumido, limite.
- Confiança "baixa" é informação útil, não fracasso: o operador usa isso para saber o que conferir. Prefira marcar baixa a arriscar um palpite.`;

const SYSTEM_SINTESE = `Você é um analista de crédito da DUX Factoring. Recebe os dados JÁ EXTRAÍDOS de uma operação de antecipação de recebíveis (consolidados de vários documentos) e produz o resumo da leitura.

- Baseie-se ESTRITAMENTE nos dados recebidos. Não invente números.
- Aponte como documentos faltantes apenas os itens do kit obrigatório que realmente não aparecem: CNH/RG, Contrato Social, Comprovante de Endereço, Balanço/DRE, Faturamento, IRPJ/DEFIS, Dados Bancários, Relatório de Crédito.
- Se algum campo veio com confiança baixa ou divergência, mencione isso como ponto de atenção.`;

interface IncomingFile { filename: string; base64: string }

function stripDataUrl(b64: string): string {
  const comma = b64.indexOf(',');
  return b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
}

// Tipos de imagem aceitos pela API da Anthropic
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Decide como enviar o arquivo: imagens viram blocos `image`, PDFs viram
// `document`. Qualquer outro formato (docx, xlsx, txt…) NÃO é enviado como
// binário - rotular um .docx de application/pdf quebra a API -, então a leitura
// desse arquivo fica só com o texto extraído localmente.
function detectMedia(b64: string, filename: string): { kind: 'image' | 'document' | 'nenhum'; media_type: string } {
  let mt = '';
  if (b64.startsWith('data:')) {
    const end = b64.indexOf(';') !== -1 ? b64.indexOf(';') : b64.indexOf(',');
    if (end > 5) mt = b64.slice(5, end).toLowerCase();
  }
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (!mt) {
    if (ext === 'jpg' || ext === 'jpeg') mt = 'image/jpeg';
    else if (ext === 'png') mt = 'image/png';
    else if (ext === 'gif') mt = 'image/gif';
    else if (ext === 'webp') mt = 'image/webp';
    else if (ext === 'pdf') mt = 'application/pdf';
  }
  if (IMAGE_TYPES.includes(mt)) return { kind: 'image', media_type: mt };
  if (mt === 'application/pdf' || ext === 'pdf') return { kind: 'document', media_type: 'application/pdf' };
  return { kind: 'nenhum', media_type: mt };
}

function parseJsonSolto(text: string): any {
  try { return JSON.parse(text); } catch { /* tenta extrair */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* ignore */ } }
  return null;
}

// Chamada à API de mensagens. `schema` liga structured outputs quando o modelo
// suporta; se a API recusar o parâmetro, refaz sem ele e cai no parse solto.
async function anthropicJson(
  cred: { apiKey: string; model: string },
  system: any[],
  content: any[],
  maxTokens: number,
  schema?: object,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const usarSchema = !!schema && suportaStructuredOutputs(cred.model);

  async function chamar(comSchema: boolean) {
    const body: any = {
      model: cred.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
    };
    if (comSchema) body.output_config = { format: { type: 'json_schema', schema } };
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cred.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
  }

  let response = await chamar(usarSchema);
  if (!response.ok && usarSchema && response.status === 400) {
    // Modelo/conta sem structured outputs - repete sem o parâmetro.
    const errText = await response.text().catch(() => '');
    console.warn('[analise-credito] output_config recusado, refazendo sem schema:', errText.slice(0, 200));
    response = await chamar(false);
  }
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    console.error('[analise-credito] anthropic error', response.status, errText.slice(0, 300));
    return { ok: false, status: 502, error: `Erro na API da Anthropic (${response.status})` };
  }

  const data = await response.json() as { content?: Array<{ text?: string }>; stop_reason?: string };
  if (data.stop_reason === 'refusal') {
    return { ok: false, status: 502, error: 'A IA recusou processar este documento.' };
  }
  const text = data.content?.map(b => b.text ?? '').join('') ?? '';
  const parsed = parseJsonSolto(text);
  if (!parsed) return { ok: false, status: 502, error: 'Resposta da IA não pôde ser interpretada' };
  return { ok: true, data: parsed };
}

// Bloco de âncoras: quem é cedente e quem é sacado NESTA operação. É o que
// impede a troca de atribuição entre relatórios de template idêntico.
function blocoAncoras(a: any): string {
  const l = (rot: string, v: any) => (v && String(v).trim() ? `- ${rot}: ${String(v).trim()}` : null);
  const linhas = [
    l('CEDENTE (quem antecipa / prestador na NF) - razão social', a?.cedente_nome),
    l('CEDENTE - CNPJ/CPF', a?.cedente_cnpj),
    l('SACADO (quem deve / tomador na NF) - razão social', a?.sacado_nome),
    l('SACADO - CNPJ/CPF', a?.sacado_cnpj),
    l('Valor informado na solicitação', a?.valor),
  ].filter(Boolean);
  if (!linhas.length) {
    return '=== ÂNCORAS DA OPERAÇÃO ===\n(nenhuma solicitação vinculada - decida a parte pelo próprio documento e rebaixe a confiança da atribuição)';
  }
  return ['=== ÂNCORAS DA OPERAÇÃO (use para decidir de quem é o documento) ===', ...linhas].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth - mesma sessão do admin
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });
  let db;
  let sessao;
  try {
    db = getDb();
    sessao = await getAdminSession(db, sessionToken);
    if (!sessao) return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    console.error('[analise-credito] session error', err);
    return res.status(500).json({ error: 'Erro interno' });
  }

  // A rota inteira é a análise nova, upload de pedaço incluído: sem permissão
  // não faz sentido nem aceitar o arquivo.
  const recusa = await exigir(db, sessao.usuario, 'credito:nova');
  if (recusa) return res.status(recusa.status).json(recusa.body);

  const action = String(req.body?.action ?? '');
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';

  await ensureAnaliseTemp(db);

  // Upload de UM pedaço (chunk) de um arquivo - mantém cada body pequeno.
  if (action === 'upload') {
    const { fileId, filename, seq, chunk } = req.body ?? {};
    if (!sessionId || !fileId || typeof chunk !== 'string' || seq == null) {
      return res.status(400).json({ error: 'Requisição de upload inválida' });
    }
    await db.execute({
      sql: 'INSERT INTO analise_temp_chunks (session_id, file_id, seq, filename, chunk, criado_em) VALUES (?,?,?,?,?,?)',
      args: [sessionId, String(fileId), Number(seq), String(filename ?? ''), chunk, new Date().toISOString()],
    });
    return res.status(200).json({ ok: true });
  }

  // Leitura de documento pela IA tem custo de token: fica registrado quem pediu.
  await registrarAuditoria(db, sessao.usuario, `analise-credito:${action || 'extracao'}`, sessionId || null);

  const cred = await getAnthropicCredential(db);
  if (!cred) return res.status(400).json({ error: 'Integração com a Anthropic não configurada. Adicione a chave da API em Configurações › Integrações.' });

  // Limpa sessões abandonadas (>1h) de forma oportunista.
  await db.execute({
    sql: 'DELETE FROM analise_temp_chunks WHERE criado_em < ?',
    args: [new Date(Date.now() - 3600_000).toISOString()],
  }).catch(() => {});

  // ── Extração de UM documento ───────────────────────────────────────────────
  if (action === 'interpret_file') {
    const fileId = req.body?.fileId != null ? String(req.body.fileId) : '';
    const textoLocal = String(req.body?.texto ?? '').trim();
    const metodoTexto = String(req.body?.texto_metodo ?? '');
    const ancoras = req.body?.ancoras ?? null;

    // Arquivo remontado da sessão temporária (novo fluxo) ou inline (legado).
    let arquivo: IncomingFile | null = null;
    if (sessionId && fileId) {
      const rows = await db.execute({
        sql: 'SELECT filename, chunk FROM analise_temp_chunks WHERE session_id = ? AND file_id = ? ORDER BY seq ASC',
        args: [sessionId, fileId],
      });
      if (rows.rows.length) {
        arquivo = {
          filename: String(rows.rows[0].filename ?? 'documento'),
          base64: rows.rows.map(r => String(r.chunk)).join(''),
        };
      }
      // Consome os pedaços deste arquivo (evita órfãos mesmo se a IA falhar).
      await db.execute({
        sql: 'DELETE FROM analise_temp_chunks WHERE session_id = ? AND file_id = ?',
        args: [sessionId, fileId],
      }).catch(() => {});
    } else if (req.body?.file?.base64) {
      arquivo = { filename: String(req.body.file.filename ?? 'documento'), base64: String(req.body.file.base64) };
    }

    if (!arquivo && !textoLocal) {
      return res.status(400).json({ error: 'Nada para interpretar neste documento' });
    }

    const nome = arquivo?.filename ?? String(req.body?.filename ?? 'documento');
    const media = arquivo ? detectMedia(arquivo.base64, nome) : { kind: 'nenhum' as const, media_type: '' };

    // Diretrizes de EXTRAÇÃO da casa (regras aprendidas com o operador).
    // Ficam no system, junto do prompt estável, para o cache de prompt valer
    // entre as chamadas dos vários documentos.
    const bloco = buildDiretrizesBloco(await getDiretrizesAtivas(db, ['extracao']));
    const system: any[] = [{
      type: 'text',
      text: bloco ? `${SYSTEM_EXTRACAO}\n\n${bloco}` : SYSTEM_EXTRACAO,
      cache_control: { type: 'ephemeral' },
    }];

    const content: any[] = [];
    if (media.kind !== 'nenhum') {
      content.push({
        type: media.kind,
        source: { type: 'base64', media_type: media.media_type, data: stripDataUrl(arquivo!.base64) },
      });
    }
    content.push({ type: 'text', text: `=== DOCUMENTO ===\nArquivo: ${nome}` });
    if (media.kind === 'nenhum') {
      content.push({
        type: 'text',
        text: `(o formato deste arquivo não é imagem nem PDF, então não há leitura visual - use apenas o texto abaixo e rebaixe a confiança)`,
      });
    }
    content.push({
      type: 'text',
      text: textoLocal
        ? `=== TEXTO EXTRAÍDO LOCALMENTE (${metodoTexto === 'ocr' ? 'OCR - pode trocar dígitos' : 'camada de texto do PDF - fiel'}) ===\n${textoLocal.slice(0, 120_000)}`
        : '=== TEXTO EXTRAÍDO LOCALMENTE ===\n(vazio - não foi possível extrair texto; use somente a leitura visual)',
    });
    content.push({ type: 'text', text: blocoAncoras(ancoras) });
    content.push({
      type: 'text',
      text: 'Extraia os dados deste documento seguindo as regras. Inclua em "campos" apenas o que encontrou, com confiança e fonte, e registre em "divergencias" todo campo em que imagem e texto discordarem.',
    });

    const r = await anthropicJson(cred, system, content, 4096, DOC_SCHEMA);
    if (!r.ok) return res.status(r.status).json({ success: false, error: r.error });

    const doc = r.data ?? {};
    return res.status(200).json({
      success: true,
      model: cred.model,
      doc: {
        filename: nome,
        tipo: typeof doc.tipo === 'string' && doc.tipo.trim() ? doc.tipo.trim() : 'Não identificado',
        resumo: String(doc.resumo ?? ''),
        parte: String(doc.parte ?? 'indefinido'),
        confianca_global: String(doc.confianca_global ?? 'media'),
        campos: Array.isArray(doc.campos) ? doc.campos : [],
        divergencias: Array.isArray(doc.divergencias) ? doc.divergencias : [],
        leitura: media.kind === 'nenhum' ? 'somente-texto' : (metodoTexto || 'somente-visual'),
      },
    });
  }

  // ── Síntese: análise textual a partir dos dados já consolidados ────────────
  if (action === 'sintese') {
    const dados = req.body?.dados ?? {};
    const documentos = Array.isArray(req.body?.documentos) ? req.body.documentos : [];
    const avisos = Array.isArray(req.body?.avisos) ? req.body.avisos : [];

    const bloco = buildDiretrizesBloco(await getDiretrizesAtivas(db, ['extracao']));
    const system: any[] = [{
      type: 'text',
      text: bloco ? `${SYSTEM_SINTESE}\n\n${bloco}` : SYSTEM_SINTESE,
      cache_control: { type: 'ephemeral' },
    }];
    const content = [{
      type: 'text',
      text: [
        '=== DOCUMENTOS LIDOS ===',
        documentos.length ? documentos.map((d: any) => `- ${d.filename}: ${d.tipo}${d.parte ? ` (${d.parte})` : ''}`).join('\n') : '(nenhum)',
        '',
        '=== DADOS CONSOLIDADOS (JSON) ===',
        JSON.stringify(dados, null, 2),
        '',
        '=== PONTOS DE BAIXA CONFIANÇA / DIVERGÊNCIA ===',
        avisos.length ? avisos.map((a: any) => `- ${a}`).join('\n') : '(nenhum)',
      ].join('\n'),
    }];

    const r = await anthropicJson(cred, system, content, 2048, SINTESE_SCHEMA);
    if (!r.ok) return res.status(r.status).json({ success: false, error: r.error });
    const s = r.data ?? {};
    return res.status(200).json({
      success: true,
      model: cred.model,
      analise: String(s.analise ?? ''),
      documentos_faltantes: Array.isArray(s.documentos_faltantes) ? s.documentos_faltantes : [],
      adequacoes_sugeridas: Array.isArray(s.adequacoes_sugeridas) ? s.adequacoes_sugeridas : [],
    });
  }

  return res.status(400).json({ error: 'Ação desconhecida' });
}
