// ─────────────────────────────────────────────────────────────────────────────
//  A proposta aberta pelo link, do lado de fora.
//
//  Sem sessão: quem abre é o cliente, e o que prova que ele pode ver é o token
//  que só existe no link que a casa mandou. Por isso a resposta é a mais
//  estreita possível - os campos da apresentação, que é exatamente o que o
//  slide mostra, e nada da linha que os guarda (autor, lead, rascunho, versões).
//
//  A proposta subida de fora não tem campos: o que ela tem é o arquivo. Para
//  ela a resposta é a descrição do arquivo, e as partes descem uma a uma pelo
//  mesmo token - inteiro ele não caberia numa resposta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';

/** O token é a única credencial da página: 32 hexadecimais, e nada além. */
export const tokenDeProposta = (v: unknown) => /^[0-9a-f]{32}$/.test(String(v ?? ''));

/** O que o link mostra: os campos do gerador, ou o arquivo subido de fora. */
export type PropostaDoLink =
  | { dados: unknown }
  | { arquivo: { nome: string; tipo: string; partes: number; cliente: string } };

/** A proposta daquele link, ou nulo. Token malformado, inexistente ou de
 *  proposta apagada respondem igual: dizer "existiu" já seria contar demais. */
export async function propostaPublica(db: Client, token: string): Promise<PropostaDoLink | null> {
  if (!tokenDeProposta(token)) return null;
  // A coluna nasce no esquema do portal, que roda na primeira ação com sessão.
  // Antes disso nenhum token existe, então a falha da consulta é a mesma
  // resposta de um link que não vale.
  const r = await db.execute({
    sql: 'SELECT * FROM propostas_geradas WHERE token_publico = ?',
    args: [token],
  }).catch(() => null);
  const linha = r?.rows[0] as Record<string, unknown> | undefined;
  if (!linha) return null;
  if (Number(linha.externa ?? 0) === 1) {
    return {
      arquivo: {
        nome: String(linha.arquivo_nome ?? 'proposta'),
        tipo: String(linha.arquivo_tipo ?? 'application/octet-stream'),
        partes: Number(linha.arquivo_partes ?? 0),
        cliente: String(linha.cliente ?? ''),
      },
    };
  }
  if (linha.dados == null) return null;
  try {
    return { dados: JSON.parse(String(linha.dados)) };
  } catch {
    return null;
  }
}

/** Uma parte do arquivo da proposta daquele link, ou nulo. */
export async function partePublica(db: Client, token: string, ordem: number): Promise<string | null> {
  if (!tokenDeProposta(token) || !Number.isInteger(ordem) || ordem < 0) return null;
  const r = await db.execute({
    sql: `SELECT a.base64 FROM propostas_geradas p
          JOIN proposta_arquivo_partes a ON a.envio = p.arquivo_envio AND a.ordem = ?
          WHERE p.token_publico = ? AND p.externa = 1`,
    args: [ordem, token],
  }).catch(() => null);
  const base64 = r?.rows[0]?.base64;
  return base64 == null ? null : String(base64);
}
