import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getQuery } from './_query.js';

// Normaliza capital social (número ou "1.234,56" / "1234.56") para Number | null
function numBR(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/R\$\s*/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function tryBrasilAPI(digits: string) {
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    razao_social: data.razao_social ?? '',
    nome_fantasia: data.nome_fantasia ?? '',
    descricao_situacao_cadastral: data.descricao_situacao_cadastral ?? '',
    data_inicio_atividade: data.data_inicio_atividade ?? '',
    natureza_juridica: data.natureza_juridica ?? '',
    cnae: [data.cnae_fiscal, data.cnae_fiscal_descricao].filter(Boolean).join(' - '),
    capital_social: numBR(data.capital_social),
    porte: data.porte ?? '',
    socios: Array.isArray(data.qsa) ? data.qsa.map((s: any) => s.nome_socio).filter(Boolean) : [],
    logradouro: [data.logradouro, data.numero].filter(Boolean).join(', '),
    complemento: data.complemento ?? '',
    bairro: data.bairro ?? '',
    municipio: data.municipio ?? '',
    uf: data.uf ?? '',
    cep: (data.cep ?? '').replace(/\D/g, ''),
  };
}

async function tryReceitaWS(digits: string) {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status === 'ERROR') return null;
  const ap = Array.isArray(data.atividade_principal) ? data.atividade_principal[0] : null;
  return {
    razao_social: data.nome ?? '',
    nome_fantasia: data.fantasia ?? '',
    descricao_situacao_cadastral: data.situacao ?? '',
    data_inicio_atividade: data.abertura ?? '',
    natureza_juridica: data.natureza_juridica ?? '',
    cnae: ap ? [ap.code, ap.text].filter(Boolean).join(' - ') : '',
    capital_social: numBR(data.capital_social),
    porte: data.porte ?? '',
    socios: Array.isArray(data.qsa) ? data.qsa.map((s: any) => s.nome).filter(Boolean) : [],
    logradouro: [data.logradouro, data.numero].filter(Boolean).join(', '),
    complemento: data.complemento ?? '',
    bairro: data.bairro ?? '',
    municipio: data.municipio ?? '',
    uf: data.uf ?? '',
    cep: (data.cep ?? '').replace(/\D/g, ''),
  };
}

async function tryCNPJa(digits: string) {
  const res = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  const est = data.estabelecimento ?? {};
  // CNPJ.ws retorna natureza_juridica como objeto { id, descricao }; priorizamos o código para match exato
  const nj = data.natureza_juridica;
  const natureza_juridica = nj?.id ?? nj?.descricao ?? '';
  const ap = est.atividade_principal;
  return {
    razao_social: data.razao_social ?? '',
    nome_fantasia: est.nome_fantasia ?? '',
    descricao_situacao_cadastral: est.situacao_cadastral ?? '',
    data_inicio_atividade: est.data_inicio_atividade ?? '',
    natureza_juridica,
    cnae: ap ? [ap.subclasse ?? ap.id, ap.descricao].filter(Boolean).join(' - ') : '',
    capital_social: numBR(data.capital_social),
    porte: data.porte?.descricao ?? '',
    socios: Array.isArray(data.socios) ? data.socios.map((s: any) => s.nome).filter(Boolean) : [],
    logradouro: [est.logradouro, est.numero].filter(Boolean).join(', '),
    complemento: est.complemento ?? '',
    bairro: est.bairro ?? '',
    municipio: est.cidade?.ibge_id ? '' : (est.municipio ?? ''),
    uf: est.estado?.sigla ?? '',
    cep: (est.cep ?? '').replace(/\D/g, ''),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Consulta paga a terceiros, saindo da infraestrutura da Sheep: sem sessão
  // isto é um proxy aberto para qualquer um na internet.
  const token = String(req.headers['x-admin-session'] ?? '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  const sessao = await getAdminSession(db, token).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });

  // Quem consulta CNPJ é a tela do Funil.
  const recusa = await exigir(db, sessao.usuario, ['oportunidades:ver']);
  if (recusa) return res.status(recusa.status).json(recusa.body);

  const digits = String(getQuery(req).get('cnpj') ?? '').replace(/\D/g, '');
  if (digits.length !== 14) return res.status(400).json({ error: 'CNPJ inválido' });

  for (const provider of [tryBrasilAPI, tryReceitaWS, tryCNPJa]) {
    try {
      const result = await provider(digits);
      if (result) return res.status(200).json(result);
    } catch {}
  }

  return res.status(404).json({ error: 'CNPJ não encontrado' });
}
