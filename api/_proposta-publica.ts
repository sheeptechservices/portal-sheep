// ─────────────────────────────────────────────────────────────────────────────
//  A proposta aberta pelo link, do lado de fora.
//
//  Sem sessão: quem abre é o cliente, e o que prova que ele pode ver é o token
//  que só existe no link que a casa mandou. Por isso a resposta é a mais
//  estreita possível - os campos da apresentação, que é exatamente o que o
//  slide mostra, e nada da linha que os guarda (autor, lead, rascunho, versões).
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';

/** O token é a única credencial da página: 32 hexadecimais, e nada além. */
export const tokenDeProposta = (v: unknown) => /^[0-9a-f]{32}$/.test(String(v ?? ''));

/** Os campos da proposta daquele link, ou nulo. Token malformado, inexistente
 *  ou de proposta apagada respondem igual: dizer "existiu" já seria contar
 *  demais. */
export async function propostaPublica(db: Client, token: string): Promise<unknown | null> {
  if (!tokenDeProposta(token)) return null;
  // A coluna nasce no esquema do portal, que roda na primeira ação com sessão.
  // Antes disso nenhum token existe, então a falha da consulta é a mesma
  // resposta de um link que não vale.
  const r = await db.execute({
    sql: 'SELECT dados FROM propostas_geradas WHERE token_publico = ?',
    args: [token],
  }).catch(() => null);
  const dados = r?.rows[0]?.dados;
  if (dados == null) return null;
  try {
    return JSON.parse(String(dados));
  } catch {
    return null;
  }
}
