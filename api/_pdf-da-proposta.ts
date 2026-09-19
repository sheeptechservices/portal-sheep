// ─────────────────────────────────────────────────────────────────────────────
//  A proposta em PDF.
//
//  A proposta só sai do portal em PDF, nunca em HTML: HTML é arquivo que se
//  edita num bloco de notas, abre diferente em cada lugar e não é o que se
//  manda a um cliente. O PDF é montado aqui, por um Chrome sem tela, a partir
//  do mesmo HTML da prévia - com a folha de impressão que o modelo já traz:
//  um slide por página, em 1280x720, sem os controles de navegação. O texto
//  sai selecionável e os links, clicáveis.
//
//  Na Vercel o Chrome é o `@sparticuz/chromium`, feito para função serverless.
//  Em desenvolvimento, que roda no Windows, é o Chrome (ou o Edge) da máquina:
//  o binário do pacote é de Linux.
//
//  O HTML vem da tela, então o navegador daqui não busca nada fora de uma
//  lista fechada - as fontes do Google e as CDNs públicas de que um protótipo
//  embutido pode depender. Sem a lista, uma proposta seria uma porta para o
//  servidor acessar qualquer endereço, inclusive os de dentro da rede.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from 'fs';
import puppeteer, { type Browser } from 'puppeteer-core';

/** Os únicos endereços que a página pode buscar, além do que já vem dentro
 *  dela. */
const LIBERADOS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'unpkg.com',
]);

/** O Chrome da máquina, em desenvolvimento. `CHROME_PATH` vence os padrões. */
function chromeLocal(): string | null {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidatos.find(c => !!c && existsSync(c)) ?? null;
}

async function abrirNavegador(): Promise<Browser> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import('@sparticuz/chromium')).default;
    // Sem WebGL: slide não usa, e desligar poupa a extração da parte gráfica.
    chromium.setGraphicsMode = false;
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
      executablePath: await chromium.executablePath(),
      headless: 'shell',
    });
  }
  const local = chromeLocal();
  if (!local) {
    throw new Error('Nenhum Chrome encontrado nesta máquina. Defina CHROME_PATH com o caminho do executável.');
  }
  return puppeteer.launch({ executablePath: local, headless: true });
}

/** Páginas de um PDF, contadas pelos objetos `/Type /Page` (e não `/Pages`,
 *  que é a árvore que os agrupa). */
function contarPaginas(pdf: Uint8Array): number {
  const texto = Buffer.from(pdf).toString('latin1');
  return (texto.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

export async function htmlEmPdf(html: string): Promise<
  | { ok: true; pdf: Uint8Array; paginas: number; slides: number }
  | { ok: false; status: number; erro: string }
> {
  let navegador: Browser | null = null;
  try {
    navegador = await abrirNavegador();
    const pagina = await navegador.newPage();
    await pagina.setViewport({ width: 1280, height: 720 });

    // WebSocket, WebRTC e afins não passam pela interceptação de pedidos, então
    // saem de cena antes de qualquer script da página rodar - em todos os
    // quadros, inclusive o do protótipo.
    await pagina.evaluateOnNewDocument(() => {
      const w = window as any;
      for (const nome of ['WebSocket', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'WebTransport']) {
        try { delete w[nome]; w[nome] = undefined; } catch { /* segue */ }
      }
    });
    await pagina.setRequestInterception(true);
    pagina.on('request', pedido => {
      const url = pedido.url();
      if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
        void pedido.continue();
        return;
      }
      let host = '';
      try {
        const u = new URL(url);
        host = u.protocol === 'https:' ? u.hostname : '';
      } catch { /* endereço torto: bloqueado */ }
      if (LIBERADOS.has(host)) void pedido.continue();
      else void pedido.abort('blockedbyclient');
    });

    await pagina.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    // A fonte e o que um protótipo busque de CDN chegam depois do `load`. A
    // espera tem teto: um recurso que não responde não segura o PDF.
    await pagina.waitForNetworkIdle({ idleTime: 400, timeout: 15_000 }).catch(() => {});
    // A fonte da casa chega do Google: sem esperar por ela, o PDF sai com a
    // fonte do sistema no lugar.
    await pagina.evaluate(() => document.fonts.ready);
    await pagina.emulateMediaType('print');
    const slides = await pagina.evaluate(() => document.querySelectorAll('.slide').length);

    const pdf = await pagina.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      width: '1280px',
      height: '720px',
      timeout: 60_000,
    });
    const paginas = contarPaginas(pdf);
    // Página a mais é slide que passou do tamanho da tela e se partiu em dois:
    // o arquivo sairia com um slide cortado ao meio para o cliente.
    if (slides && paginas !== slides) {
      return {
        ok: false, status: 422,
        erro: `O PDF saiu com ${paginas} páginas para ${slides} slides: algum slide passou do tamanho da página. Encurte o texto do slide mais cheio e tente de novo.`,
      };
    }
    return { ok: true, pdf, paginas, slides };
  } catch (e: any) {
    console.error('[proposta-pdf]', e?.message ?? e);
    return { ok: false, status: 500, erro: 'Não foi possível montar o PDF. Tente de novo.' };
  } finally {
    await navegador?.close().catch(() => {});
  }
}
