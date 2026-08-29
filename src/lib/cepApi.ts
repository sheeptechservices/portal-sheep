export interface CEPData {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

// Consulta CEP com múltiplos provedores em cascata (fallback/segurança).
// Ordem: ViaCEP → BrasilAPI → OpenCEP. Retorna null se todos falharem.
export async function lookupCEP(cep: string): Promise<CEPData | null> {
  const digits = (cep || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const timeout = () => AbortSignal.timeout(6000);

  // 1) ViaCEP
  try {
    const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: timeout() });
    if (r.ok) {
      const d = await r.json();
      if (!d.erro && (d.logradouro || d.localidade)) {
        return { logradouro: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', estado: d.uf || '' };
      }
    }
  } catch { /* tenta o próximo */ }

  // 2) BrasilAPI
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${digits}`, { signal: timeout() });
    if (r.ok) {
      const d = await r.json();
      if (d.street || d.city) {
        return { logradouro: d.street || '', bairro: d.neighborhood || '', cidade: d.city || '', estado: d.state || '' };
      }
    }
  } catch { /* tenta o próximo */ }

  // 3) OpenCEP
  try {
    const r = await fetch(`https://opencep.com/v1/${digits}`, { signal: timeout() });
    if (r.ok) {
      const d = await r.json();
      if (d.logradouro || d.localidade) {
        return { logradouro: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', estado: d.uf || '' };
      }
    }
  } catch { /* nada mais a tentar */ }

  return null;
}
