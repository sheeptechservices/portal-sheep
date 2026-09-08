// ─────────────────────────────────────────────────────────────────────────────
//  Leitura de um fluxo de eventos (SSE) vindo de uma função nossa.
//
//  Um evento é um bloco de linhas terminado em linha em branco, e a que
//  interessa começa com `data:`. O cuidado que a leitura ingênua não tem: o
//  pedaço que chega pela rede não respeita fronteira de evento - ele corta no
//  meio de um JSON tanto quanto entre dois -, então o resto de cada leitura
//  espera o próximo pedaço em vez de ser jogado no `JSON.parse`.
//
//  Não usa `EventSource` de propósito: aquilo só faz GET e não manda cabeçalho,
//  e aqui é POST com a sessão no cabeçalho.
// ─────────────────────────────────────────────────────────────────────────────

/** Lê o corpo até o fim, chamando `aoEvento` para cada `data:` que chegar
 *  inteiro. Linha que não for JSON válido é ignorada, e não derruba o fluxo. */
export async function lerEventos(
  corpo: ReadableStream<Uint8Array>,
  aoEvento: (dado: any) => void,
): Promise<void> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let sobra = '';
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    sobra += decodificador.decode(value, { stream: true });
    const partes = sobra.split('\n\n');
    sobra = partes.pop() ?? '';
    for (const parte of partes) {
      const linha = parte.split('\n').find(l => l.startsWith('data:'));
      if (!linha) continue;
      try { aoEvento(JSON.parse(linha.slice(5))); } catch { /* linha quebrada: segue */ }
    }
  }
}
