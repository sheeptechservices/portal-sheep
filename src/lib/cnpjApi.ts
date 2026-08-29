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
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

export async function lookupCNPJ(cnpj: string): Promise<CNPJData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  try {
    const res = await fetch(`/api/cnpj-lookup?cnpj=${digits}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
