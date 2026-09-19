// ─────────────────────────────────────────────────────────────────────────────
//  A proposta sai do portal só em PDF.
//
//  O HTML é montado aqui, pelo mesmo montador da prévia, e o servidor o
//  converte com um Chrome sem tela (`/api/proposta-pdf`). HTML não sai mais:
//  é arquivo que se edita num bloco de notas e abre diferente em cada lugar,
//  e não é o que se manda a um cliente. A prévia dentro do portal continua em
//  HTML, porque ali ela é para ver, e não para mandar.
// ─────────────────────────────────────────────────────────────────────────────

/** Pede o PDF ao servidor e baixa com o nome dado (sem a extensão). */
export async function baixarPdfDaProposta(html: string, nome: string, token?: string)
  : Promise<{ ok: true } | { ok: false; erro: string }> {
  let sessao = token ?? '';
  if (!sessao) {
    try { sessao = localStorage.getItem('dux_admin_token') ?? ''; } catch { /* sem armazenamento */ }
  }
  let res: Response;
  try {
    res = await fetch('/api/proposta-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': sessao },
      body: JSON.stringify({ html }),
    });
  } catch {
    return { ok: false, erro: 'A conexão caiu. Tente de novo.' };
  }
  if (!res.ok) {
    const dados = await res.json().catch(() => null);
    return { ok: false, erro: dados?.error ?? 'Não foi possível montar o PDF.' };
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { ok: true };
}
