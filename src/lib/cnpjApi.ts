export interface CNPJData {
  razao_social: string;
  nome_fantasia: string;
  descricao_situacao_cadastral: string;
  data_inicio_atividade: string;
  natureza_juridica?: string;
  cnae?: string;
  capital_social?: number | null;
  porte?: string;
  socios?: string[];
  logradouro?: string;
  /** Vem separado do logradouro: "APT 1002", "SALA 3". */
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

/** Consulta o cadastro público de um CNPJ. O endpoint pede sessão, então o
 *  token vai junto - sem ele a resposta é 401. */
export async function lookupCNPJ(cnpj: string, token?: string): Promise<CNPJData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  try {
    const res = await fetch(`/api/cnpj-lookup?cnpj=${digits}`, {
      headers: token ? { 'x-admin-session': token } : undefined,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
