import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigirFerramenta } from './_permissoes.js';
import {
  calcular, gerarPropostaAvista, gerarPropostaParcelada, primeiroNomeRazao,
  type DadosProposta, type Marca, type TipoDocumento,
} from './_docx.js';

// ─────────────────────────────────────────────────────────────────────────────
//  /api/gerar-documento
//  Monta os documentos do Gerador a partir dos templates Word versionados em
//  api/_templates. Porte do /gerar do "DUX Gerador de Propostas".
//
//  A saída é sempre DOCX: a conversão para PDF do original depende do
//  LibreOffice instalado na máquina, que não existe em função serverless.
// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

interface ParcelaEntrada { vencimento: string; valor: number }

interface CorpoProposta {
  tipo: 'avista' | 'parcelado';
  marca: Marca;
  ocultarTaxa?: boolean;
  clienteRazao: string;
  clienteCnpj: string;
  sacadoRazao: string;
  sacadoCnpj: string;
  valorTotal: number;
  valorAntecipado?: number;
  dataEmissao: string;        // dd/mm/aaaa - vai impresso como veio
  dataAntecipacao: string;    // ISO
  taxaMensal: number;
  numeroNf?: string;
  servico: string;
  tipoDocumento?: TipoDocumento;
  parcelas: ParcelaEntrada[];
  /** O lote grava a taxa uma vez por cedente, não a cada documento da remessa. */
  registrarTaxa?: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getDb();
  const token = String(req.headers['x-admin-session'] ?? '');
  const sessao = await getAdminSession(db, token).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });

  const recusaPerm = await exigirFerramenta(db, sessao.usuario, 'gerador:gerar');
  if (recusaPerm) return res.status(recusaPerm.status).json(recusaPerm.body);

  const acao = String((req.query?.action as string) ?? 'proposta');
  if (acao !== 'proposta') {
    return res.status(400).json({ error: `Ação desconhecida: ${acao}` });
  }
  // Documento sai com a marca da casa para um cliente: fica registrado quem gerou.
  await registrarAuditoria(db, sessao.usuario, 'gerar-documento', String(req.body?.clienteRazao ?? ''));

  try {
    const body = req.body as CorpoProposta;

    // ── Validação ───────────────────────────────────────────────────────────
    const faltando = (['clienteRazao', 'sacadoRazao', 'dataAntecipacao'] as const)
      .filter(k => !String(body?.[k] ?? '').trim());
    if (faltando.length) {
      return res.status(400).json({ error: `Campos obrigatórios ausentes: ${faltando.join(', ')}` });
    }
    if (!Number.isFinite(body.valorTotal) || body.valorTotal <= 0) {
      return res.status(400).json({ error: 'Valor total inválido.' });
    }
    if (!Number.isFinite(body.taxaMensal) || body.taxaMensal <= 0) {
      return res.status(400).json({ error: 'Taxa mensal inválida.' });
    }
    const parcelas = (body.parcelas ?? []).filter(p => p?.vencimento);
    if (!parcelas.length) {
      return res.status(400).json({ error: 'Informe ao menos uma data de vencimento.' });
    }
    if (body.tipo === 'avista' && parcelas.length !== 1) {
      return res.status(400).json({ error: 'Proposta à vista aceita uma única parcela.' });
    }
    if (parcelas.some(p => !Number.isFinite(p.valor) || p.valor <= 0)) {
      return res.status(400).json({ error: 'Há parcela sem valor válido.' });
    }

    // O cálculo roda sobre o valor antecipado, que pode ser parcial
    const valorAntecipado = Number.isFinite(body.valorAntecipado) && (body.valorAntecipado as number) > 0
      ? (body.valorAntecipado as number)
      : body.valorTotal;

    const resultado = calcular(body.dataAntecipacao, body.taxaMensal, parcelas);

    const dados: DadosProposta = {
      clienteRazao: body.clienteRazao,
      clienteCnpj: body.clienteCnpj ?? '',
      sacadoRazao: body.sacadoRazao,
      sacadoCnpj: body.sacadoCnpj ?? '',
      valorTotal: body.valorTotal,
      valorAntecipado,
      dataEmissao: body.dataEmissao ?? '',
      numeroNf: body.numeroNf ?? '',
      servico: body.servico ?? '',
      tipoDocumento: body.tipoDocumento ?? 'nf',
    };

    const opcoes = {
      tipo: body.tipo,
      marca: body.marca ?? 'dux',
      ocultarTaxa: !!body.ocultarTaxa,
      dataProposta: new Date().toISOString().slice(0, 10),
    };

    const docx = body.tipo === 'avista'
      ? gerarPropostaAvista(dados, resultado, opcoes)
      : gerarPropostaParcelada(dados, resultado, opcoes);

    // Guarda a taxa para pré-preencher a próxima proposta deste cedente.
    // Best-effort: falha aqui não invalida o documento já gerado.
    try {
      const cnpjCedente = String(body.clienteCnpj ?? '').replace(/\D/g, '');
      if (cnpjCedente && body.registrarTaxa !== false) {
        await db.execute({
          sql: `INSERT INTO taxa_historico (cedente_cnpj, taxa_mensal, atualizado_em)
                VALUES (?, ?, ?)
                ON CONFLICT(cedente_cnpj) DO UPDATE SET taxa_mensal = excluded.taxa_mensal,
                                                        atualizado_em = excluded.atualizado_em`,
          args: [cnpjCedente, body.taxaMensal, new Date().toISOString()],
        });
      }
    } catch (e) {
      console.warn('[gerar-documento] taxa_historico:', e);
    }

    const nome = `[${primeiroNomeRazao(body.clienteRazao)} - ${primeiroNomeRazao(body.sacadoRazao)}] `
      + 'PROPOSTA DE ANTECIPAÇÃO DE RECEBÍVEIS.docx';

    // base64 em JSON: o front monta o download e ainda consegue ler mensagens de erro
    return res.status(200).json({
      ok: true,
      nome,
      base64: docx.toString('base64'),
      resumo: {
        totalBruto: resultado.totalBruto,
        totalJuros: resultado.totalJuros,
        totalLiquido: resultado.totalLiquido,
        taxaDiariaPct: resultado.taxaDiariaPct,
        parcelas: resultado.parcelas.map(p => ({
          n: p.n, vencimento: p.dataVenc, valor: p.valor,
          dias: p.dias, taxa: p.taxa, juros: p.juros, liquido: p.liquido,
        })),
      },
    });
  } catch (e: any) {
    console.error('[gerar-documento]', e);
    return res.status(500).json({ error: e?.message ?? 'Erro ao gerar o documento.' });
  }
}
