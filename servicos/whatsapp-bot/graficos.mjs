// ─────────────────────────────────────────────────────────────────────────────
//  Gráficos e relatórios com a identidade da Sheep: a logo, o limão #E9FC00,
//  o preto #121316 e a fonte Inter.
//
//  O gráfico é desenhado aqui mesmo, em SVG, a partir dos números (nada de
//  biblioteca de gráfico baixada de fora), e vira imagem num Chromium sem tela.
//  O relatório em PDF é uma página HTML impressa pelo mesmo Chromium; o Word
//  sai pelo pacote `docx`, com os gráficos dentro como imagem.
//
//  Duas versões de cada gráfico: a escura, que é a imagem mandada no WhatsApp
//  (o fundo preto da marca com o limão por cima), e a clara, que vai dentro do
//  relatório, feito para ser impresso.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';

const CHROMIUM = process.env.CHROMIUM_BIN || '/usr/bin/chromium';
const LOGO = readFileSync(fileURLToPath(new URL('./marca/logo-sheep.png', import.meta.url)));
const LOGO_URI = `data:image/png;base64,${LOGO.toString('base64')}`;
/** O fundo das peças da marca: o preto com os feixes de luz limão, a arte
 *  original da Sheep sem as logos. Duas versões, a larga (16:9) e a quadrada;
 *  a página usa a que mais se parece com o formato da peça. */
const fundo = (arq) => `data:image/jpeg;base64,${readFileSync(fileURLToPath(new URL(`./marca/${arq}`, import.meta.url))).toString('base64')}`;
const FUNDO_LARGO = fundo('fundo-luzes-largo.jpg');
const FUNDO_QUADRADO = fundo('fundo-luzes-quadrado.jpg');

const LIMAO = '#E9FC00';
const PRETO = '#121316';
const TEMAS = {
  escuro: {
    fundo: PRETO, texto: '#E7EEEA', fraco: '#8E9590', grade: 'rgba(255,255,255,0.07)', eixo: 'rgba(255,255,255,0.16)',
    series: [LIMAO, '#E7EEEA', '#7C8A82', '#B9C900', '#4E5A54', '#C6CEC9'],
    barra: LIMAO, textoNaBarra: PRETO, area: 'rgba(233,252,0,0.14)',
  },
  claro: {
    fundo: '#FFFFFF', texto: PRETO, fraco: '#6B716D', grade: '#E8EAE6', eixo: '#C9CDC8',
    series: [PRETO, '#9DB100', '#7C8A82', '#C9D300', '#4E5A54', '#B7BDB9'],
    barra: LIMAO, textoNaBarra: PRETO, area: 'rgba(233,252,0,0.35)',
  },
};

/** Texto seguro dentro do SVG e do HTML. */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numero = (v) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(v) || 0);
const iniciais = (nome) => String(nome ?? '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';

/** Marcas do eixo: números redondos que cobrem do zero ao maior valor. */
function marcas(maximo, quantas = 5) {
  if (!(maximo > 0)) return { teto: 1, passos: [0, 1] };
  const bruto = maximo / quantas;
  const ordem = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * ordem).find(p => p >= bruto) ?? 10 * ordem;
  const teto = Math.ceil(maximo / passo) * passo;
  const passos = [];
  for (let v = 0; v <= teto + passo / 2; v += passo) passos.push(Number(v.toFixed(6)));
  return { teto, passos };
}

/** Rótulos do eixo X sem embolar: mostra um a cada tantos, sempre o último. */
function rotulosVisiveis(total, largura, porRotulo = 64) {
  const cabem = Math.max(2, Math.floor(largura / porRotulo));
  const salto = Math.max(1, Math.ceil(total / cabem));
  return (i) => i % salto === 0 || i === total - 1;
}

function legenda(series, t, x, y) {
  let cx = x;
  return series.map((s, i) => {
    const cor = s.cor || t.series[i % t.series.length];
    const g = `<g transform="translate(${cx},${y})"><rect width="14" height="14" rx="4" fill="${cor}"/>`
      + `<text x="22" y="12" font-size="15" fill="${t.texto}">${esc(s.nome)}</text></g>`;
    cx += 40 + String(s.nome ?? '').length * 8.5;
    return g;
  }).join('');
}

// ── Os quatro gráficos ──────────────────────────────────────────────────────

function svgLinha(spec, t, L, A) {
  const series = (spec.series ?? []).filter(s => Array.isArray(s.valores));
  const rotulos = spec.rotulos ?? [];
  const n = Math.max(rotulos.length, ...series.map(s => s.valores.length), 1);
  const m = { e: 64, d: 36, t: 40, b: 64 };
  const w = L - m.e - m.d;
  const h = A - m.t - m.b;
  const { teto, passos } = marcas(Math.max(0, ...series.flatMap(s => s.valores.map(Number))));
  const X = (i) => m.e + (n === 1 ? w / 2 : (i * w) / (n - 1));
  const Y = (v) => m.t + h - (Number(v) / teto) * h;
  const mostra = rotulosVisiveis(n, w);
  let svg = passos.map(p => `<line x1="${m.e}" x2="${m.e + w}" y1="${Y(p)}" y2="${Y(p)}" stroke="${t.grade}"/>`
    + `<text x="${m.e - 12}" y="${Y(p) + 5}" text-anchor="end" font-size="14" fill="${t.fraco}">${numero(p)}</text>`).join('');
  svg += rotulos.map((r, i) => (mostra(i)
    ? `<text x="${X(i)}" y="${m.t + h + 28}" text-anchor="middle" font-size="14" fill="${t.fraco}">${esc(r)}</text>` : '')).join('');
  series.forEach((s, k) => {
    const cor = s.cor || t.series[k % t.series.length];
    const pts = s.valores.map((v, i) => `${X(i)},${Y(v)}`);
    if (k === 0 && pts.length > 1) {
      svg += `<polygon points="${X(0)},${Y(0)} ${pts.join(' ')} ${X(s.valores.length - 1)},${Y(0)}" fill="${t.area}"/>`;
    }
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${cor}" stroke-width="${k === 0 ? 4 : 3}" stroke-linejoin="round" stroke-linecap="round"/>`;
    if (s.valores.length <= 40) {
      svg += s.valores.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="${k === 0 ? 5 : 4}" fill="${t.fundo}" stroke="${cor}" stroke-width="3"/>`).join('');
    }
    const ult = s.valores.length - 1;
    if (ult >= 0) {
      svg += `<text x="${X(ult) + 10}" y="${Y(s.valores[ult]) - 10}" font-size="16" font-weight="700" fill="${cor}">${numero(s.valores[ult])}</text>`;
    }
  });
  svg += `<line x1="${m.e}" x2="${m.e + w}" y1="${Y(0)}" y2="${Y(0)}" stroke="${t.eixo}" stroke-width="1.5"/>`;
  if (series.length > 1) svg += legenda(series, t, m.e, A - 22);
  return svg;
}

function svgBarras(spec, t, L, A) {
  const series = (spec.series ?? []).filter(s => Array.isArray(s.valores));
  const rotulos = spec.rotulos ?? [];
  const n = Math.max(rotulos.length, 1);
  const m = { e: 64, d: 24, t: 40, b: series.length > 1 ? 76 : 56 };
  const w = L - m.e - m.d;
  const h = A - m.t - m.b;
  const { teto, passos } = marcas(Math.max(0, ...series.flatMap(s => s.valores.map(Number))));
  const Y = (v) => m.t + h - (Number(v) / teto) * h;
  const faixa = w / n;
  const largura = Math.min(64, (faixa * 0.7) / Math.max(series.length, 1));
  let svg = passos.map(p => `<line x1="${m.e}" x2="${m.e + w}" y1="${Y(p)}" y2="${Y(p)}" stroke="${t.grade}"/>`
    + `<text x="${m.e - 12}" y="${Y(p) + 5}" text-anchor="end" font-size="14" fill="${t.fraco}">${numero(p)}</text>`).join('');
  const mostra = rotulosVisiveis(n, w, 70);
  rotulos.forEach((r, i) => {
    const centro = m.e + faixa * i + faixa / 2;
    series.forEach((s, k) => {
      const v = Number(s.valores[i] ?? 0);
      const x = centro - (largura * series.length) / 2 + k * largura;
      const cor = s.cor || (series.length === 1 ? t.barra : t.series[k % t.series.length]);
      svg += `<rect x="${x + 2}" y="${Y(v)}" width="${largura - 4}" height="${Math.max(0, Y(0) - Y(v))}" rx="6" fill="${cor}"`
        + `${cor === LIMAO && t.fundo !== PRETO ? ` stroke="${PRETO}" stroke-width="1"` : ''}/>`;
      if (n <= 16) svg += `<text x="${x + largura / 2}" y="${Y(v) - 8}" text-anchor="middle" font-size="14" font-weight="700" fill="${t.texto}">${numero(v)}</text>`;
    });
    if (mostra(i)) svg += `<text x="${centro}" y="${m.t + h + 26}" text-anchor="middle" font-size="14" fill="${t.fraco}">${esc(String(r).slice(0, 14))}</text>`;
  });
  svg += `<line x1="${m.e}" x2="${m.e + w}" y1="${Y(0)}" y2="${Y(0)}" stroke="${t.eixo}" stroke-width="1.5"/>`;
  if (series.length > 1) svg += legenda(series, t, m.e, A - 22);
  return svg;
}

function svgRanking(spec, t, L, A, fotos) {
  const itens = (spec.itens ?? []).slice(0, 15);
  const linha = Math.min(64, (A - 20) / Math.max(itens.length, 1));
  const max = Math.max(1, ...itens.map(i => Number(i.valor) || 0));
  const xNome = 120;
  const xBarra = 420;
  const wBarra = L - xBarra - 110;
  const r = Math.min(24, linha * 0.38);
  let svg = '';
  itens.forEach((it, i) => {
    const cy = 10 + linha * i + linha / 2;
    const foto = fotos.get(i);
    svg += `<text x="22" y="${cy + 7}" font-size="20" font-weight="800" fill="${i < 3 ? (t.fundo === PRETO ? LIMAO : PRETO) : t.fraco}">${i + 1}º</text>`;
    svg += foto
      ? `<clipPath id="c${i}"><circle cx="${xNome - 38}" cy="${cy}" r="${r}"/></clipPath>`
        + `<image href="${foto}" x="${xNome - 38 - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" clip-path="url(#c${i})" preserveAspectRatio="xMidYMid slice"/>`
      : `<circle cx="${xNome - 38}" cy="${cy}" r="${r}" fill="${LIMAO}"/>`
        + `<text x="${xNome - 38}" y="${cy + 6}" text-anchor="middle" font-size="${Math.round(r * 0.75)}" font-weight="800" fill="${PRETO}">${esc(iniciais(it.nome))}</text>`;
    svg += `<circle cx="${xNome - 38}" cy="${cy}" r="${r}" fill="none" stroke="${i === 0 ? LIMAO : t.eixo}" stroke-width="2.5"/>`;
    svg += `<text x="${xNome}" y="${cy + 6}" font-size="18" font-weight="600" fill="${t.texto}">${esc(String(it.nome ?? '').slice(0, 26))}</text>`;
    if (it.detalhe) svg += `<text x="${xNome}" y="${cy + 26}" font-size="13" fill="${t.fraco}">${esc(String(it.detalhe).slice(0, 40))}</text>`;
    const w = Math.max(6, (Number(it.valor) / max) * wBarra);
    svg += `<rect x="${xBarra}" y="${cy - linha * 0.22}" width="${wBarra}" height="${linha * 0.44}" rx="${linha * 0.22}" fill="${t.grade}"/>`;
    svg += `<rect x="${xBarra}" y="${cy - linha * 0.22}" width="${w}" height="${linha * 0.44}" rx="${linha * 0.22}" fill="${i === 0 ? LIMAO : (t.fundo === PRETO ? '#B9C900' : '#D7E600')}"/>`;
    svg += `<text x="${xBarra + wBarra + 16}" y="${cy + 7}" font-size="20" font-weight="800" fill="${t.texto}">${numero(it.valor)}</text>`;
  });
  return svg;
}

function svgRosca(spec, t, L, A) {
  const fatias = (spec.itens ?? []).filter(f => Number(f.valor) > 0).slice(0, 8);
  const total = fatias.reduce((s, f) => s + Number(f.valor), 0) || 1;
  const cx = A / 2 + 20;
  const cy = A / 2;
  const raio = A / 2 - 20;
  const largura = raio * 0.38;
  let ang = -Math.PI / 2;
  let svg = '';
  fatias.forEach((f, i) => {
    const parte = (Number(f.valor) / total) * Math.PI * 2;
    const a2 = ang + parte;
    const ponto = (a, rr) => `${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`;
    const grande = parte > Math.PI ? 1 : 0;
    const cor = f.cor || t.series[i % t.series.length];
    const rm = raio - largura / 2;
    svg += parte >= Math.PI * 2 - 1e-6
      ? `<circle cx="${cx}" cy="${cy}" r="${rm}" fill="none" stroke="${cor}" stroke-width="${largura}"/>`
      : `<path d="M ${ponto(ang, rm)} A ${rm} ${rm} 0 ${grande} 1 ${ponto(a2, rm)}" fill="none" stroke="${cor}" stroke-width="${largura}"/>`;
    ang = a2;
  });
  svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="44" font-weight="800" fill="${t.texto}">${numero(total)}</text>`;
  svg += `<text x="${cx}" y="${cy + 32}" text-anchor="middle" font-size="15" fill="${t.fraco}">${esc(spec.rotulo_total ?? 'no total')}</text>`;
  const xl = cx + raio + 60;
  const passo = Math.min(48, (A - 40) / Math.max(fatias.length, 1));
  fatias.forEach((f, i) => {
    const y = 30 + passo * i;
    const cor = f.cor || t.series[i % t.series.length];
    svg += `<rect x="${xl}" y="${y}" width="18" height="18" rx="5" fill="${cor}"/>`
      + `<text x="${xl + 30}" y="${y + 15}" font-size="18" fill="${t.texto}">${esc(String(f.nome ?? '').slice(0, 28))}</text>`
      + `<text x="${L - 30}" y="${y + 15}" text-anchor="end" font-size="18" font-weight="700" fill="${t.texto}">${numero(f.valor)}`
      + ` <tspan fill="${t.fraco}" font-weight="400">(${Math.round((Number(f.valor) / total) * 100)}%)</tspan></text>`;
  });
  return svg;
}

export const TIPOS = ['linha', 'barras', 'ranking', 'rosca'];

/** Baixa as fotos do ranking e devolve como data URI: o navegador que
 *  desenha não busca nada fora. Foto que não vier vira as iniciais. */
async function fotosDoRanking(spec) {
  const fotos = new Map();
  if (spec.tipo !== 'ranking') return fotos;
  await Promise.all((spec.itens ?? []).slice(0, 15).map(async (it, i) => {
    if (!/^https:\/\//.test(String(it.foto ?? ''))) return;
    try {
      const r = await fetch(it.foto, { signal: AbortSignal.timeout(8000) });
      const tipo = r.headers.get('content-type') ?? '';
      if (!r.ok || !tipo.startsWith('image/')) return;
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 2 * 1024 * 1024) return;
      fotos.set(i, `data:${tipo.split(';')[0]};base64,${b.toString('base64')}`);
    } catch { /* fica com as iniciais */ }
  }));
  return fotos;
}

/** O SVG do gráfico, no tamanho pedido, no tema pedido. */
export async function svgDoGrafico(spec, tema = 'escuro', L = 1120, A = 470) {
  if (!TIPOS.includes(spec.tipo)) throw new Error(`tipo de gráfico precisa ser ${TIPOS.join(', ')}`);
  const t = TEMAS[tema];
  const fotos = await fotosDoRanking(spec);
  // O ranking cresce com o número de pessoas, em vez de sobrar espaço embaixo.
  const altura = spec.tipo === 'ranking' ? Math.max(160, 20 + Math.min(15, (spec.itens ?? []).length) * 62) : A;
  const corpo = spec.tipo === 'linha' ? svgLinha(spec, t, L, altura)
    : spec.tipo === 'barras' ? svgBarras(spec, t, L, altura)
      : spec.tipo === 'ranking' ? svgRanking(spec, t, L, altura, fotos)
        : svgRosca(spec, t, L, altura);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${altura}" width="${L}" height="${altura}" font-family="Inter, Arial, sans-serif">${corpo}</svg>`;
}

const quandoAgora = () => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date());

// ── O navegador sem tela ────────────────────────────────────────────────────

async function comNavegador(tarefa) {
  const nav = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  });
  try {
    const pagina = await nav.newPage();
    // Tudo o que a página precisa vem dentro dela: nada é buscado fora.
    await pagina.setRequestInterception(true);
    pagina.on('request', (req) => (req.url().startsWith('data:') || req.url() === 'about:blank' ? req.continue() : req.abort()));
    return await tarefa(pagina);
  } finally {
    await nav.close();
  }
}

// ── A moldura escura: as luzes da marca e as logos ──────────────────────────
//  O fundo das peças da Sheep: o preto com os feixes de luz limão em diagonal,
//  a própria arte da marca sem as logos (marca/fundo-luzes-*.jpg), para seguir
//  a referência à risca em vez de imitar com gradiente. As logos vão em branco: a da Sheep e, quando o material é de
//  um cliente, a dele, separadas por um traço fino. O conteúdo fica em cartões
//  de vidro escuro, como os do portal, para a luz ficar atrás e não disputar
//  a leitura com o gráfico.

const CSS_LUZES = `
  .palco { position: relative; overflow: hidden; color: #E7EEEA; font-family: Inter, Arial, sans-serif;
    background: #050A08 url(${FUNDO_LARGO}) center / cover no-repeat; }
  .palco.alto { background-image: url(${FUNDO_QUADRADO}); }
  .marcas { display: flex; align-items: center; gap: 22px; }
  .marcas .sheep { height: 44px; filter: invert(1); display: block; }
  .marcas .traco { width: 1.5px; height: 46px; background: linear-gradient(180deg, transparent, rgba(233,252,0,.8), transparent); }
  .marcas .cliente { max-height: 40px; max-width: 190px; display: block; }
  .marcas .cliente.branca { filter: brightness(0) invert(1); }
  .marcas .chip { background: #fff; border-radius: 12px; padding: 7px 12px; display: flex; align-items: center; }
  .marcas .chip .cliente { max-height: 38px; }
  .vidro { position: relative; background: rgba(9, 15, 12, .80); border: 1px solid rgba(255,255,255,.08); border-radius: 22px;
    backdrop-filter: blur(26px); -webkit-backdrop-filter: blur(26px); }
`;

/** A logo do cliente na moldura escura. Vira branca, como nas peças da marca,
 *  quando dá: logo com desenho interno (`detalhe`) ou com fundo chapado viraria
 *  um borrão branco, e aí ela entra com as cores dela num cartão claro. Quem
 *  decide o fundo chapado é o script da página, olhando os cantos da imagem. */
function marcasHtml(cliente) {
  const sheep = `<img class="sheep" src="${LOGO_URI}" alt="">`;
  if (!cliente?.logo) return `<div class="marcas">${sheep}</div>`;
  return `<div class="marcas">${sheep}<span class="traco"></span>`
    + `<span class="logo-do-cliente" data-detalhe="${cliente.detalhe ? '1' : ''}"><img class="cliente" src="${cliente.logo}" alt="${esc(cliente.nome)}"></span></div>`;
}

/** Roda na página antes da foto: decide branca ou cartão claro. */
const SCRIPT_LOGO = `<script>
  (async () => {
    // Logo comum vira silhueta branca (o filtro do CSS). Logo com desenho
    // interno, ou com fundo chapado, viraria um borrão: ela vira branca
    // vazada, pixel a pixel - o que tem cor fica branco, o que é claro fica
    // transparente, e o fundo escuro aparece pelos vãos, como na versão
    // branca da LPA. Se nem isso der, entra com as cores dela num cartão claro.
    // Peça mais alta que larga (ou quase quadrada) usa o fundo quadrado.
    for (const palco of document.querySelectorAll('.palco')) {
      const r = palco.getBoundingClientRect();
      if (r.width / Math.max(r.height, 1) < 1.3) palco.classList.add('alto');
    }
    for (const caixa of document.querySelectorAll('.logo-do-cliente')) {
      const img = caixa.querySelector('img');
      try { await img.decode(); } catch {}
      try {
        const escala = Math.max(1, 400 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const c = document.createElement('canvas');
        c.width = Math.round((img.naturalWidth || 200) * escala); c.height = Math.round((img.naturalHeight || 100) * escala);
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, c.width, c.height);
        const dados = g.getImageData(0, 0, c.width, c.height);
        const px = dados.data;
        const alfa = (x, y) => px[(y * c.width + x) * 4 + 3];
        const w = c.width - 1, h = c.height - 1;
        const chapada = [alfa(0, 0), alfa(w, 0), alfa(0, h), alfa(w, h)].filter(v => v > 200).length >= 3;
        if (caixa.dataset.detalhe !== '1' && !chapada) { img.classList.add('branca'); continue; }
        for (let i = 0; i < px.length; i += 4) {
          const luz = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
          const forca = Math.min(1, Math.max(0, (0.82 - luz) / 0.2));
          px[i] = px[i + 1] = px[i + 2] = 255;
          px[i + 3] = Math.round(px[i + 3] * forca);
        }
        g.putImageData(dados, 0, 0);
        img.src = c.toDataURL('image/png');
        try { await img.decode(); } catch {}
      } catch {
        const chip = document.createElement('span'); chip.className = 'chip'; img.replaceWith(chip); chip.appendChild(img);
      }
    }
    window.__pronto = true;
  })();
</script>`;

/** O cartão do gráfico em PNG: a imagem que vai no WhatsApp. */
export async function graficoEmPng(spec) {
  const svg = await svgDoGrafico(spec, 'escuro');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    body { width: 1200px; background: #050A08; }
    ${CSS_LUZES}
    .palco { padding: 40px 40px 30px; }
    .topo { position: relative; display: flex; justify-content: space-between; align-items: center; margin-bottom: 26px; }
    .cabeca { padding: 26px 30px 24px; margin-bottom: 16px; }
    .rotulo { font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${LIMAO}; margin-bottom: 10px; }
    h1 { font-size: 36px; line-height: 1.15; font-weight: 700; letter-spacing: -.015em; color: #F4F7F5; }
    .sub { margin-top: 8px; font-size: 17px; color: #A9B1AC; }
    .destaques { display: flex; gap: 0; margin-top: 22px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.07); }
    .destaque { flex: 1; padding-right: 18px; }
    .destaque + .destaque { padding-left: 22px; border-left: 1px solid rgba(255,255,255,.07); }
    .destaque span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #8E9590; margin-bottom: 6px; }
    .destaque b { font-size: 28px; font-weight: 700; color: #F4F7F5; font-variant-numeric: tabular-nums; }
    .painel { padding: 26px 24px 18px; }
    .painel svg { display: block; width: 100%; height: auto; }
    .pe { position: relative; margin-top: 16px; display: flex; justify-content: space-between; font-size: 13px; color: #B8C0BB;
      text-shadow: 0 1px 10px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8); }
  </style></head><body><div class="palco">
    
    <div class="topo">${marcasHtml(spec.cliente)}</div>
    <div class="vidro cabeca"><div class="rotulo">${esc(spec.rotulo ?? 'Portal Sheep')}</div><h1>${esc(spec.titulo)}</h1>${spec.subtitulo ? `<div class="sub">${esc(spec.subtitulo)}</div>` : ''}
      ${Array.isArray(spec.destaques) && spec.destaques.length
        ? `<div class="destaques">${spec.destaques.slice(0, 4).map(d => `<div class="destaque"><span>${esc(d.rotulo)}</span><b>${esc(d.valor)}</b></div>`).join('')}</div>` : ''}
    </div>
    <div class="vidro painel">${svg}</div>
    <div class="pe"><span>${esc(spec.fonte ?? 'Fonte: Portal Sheep')} | gerado em ${quandoAgora()}</span><span>Sheep Technology</span></div>
  </div>${SCRIPT_LOGO}</body></html>`;
  return comNavegador(async (p) => {
    await p.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForFunction('window.__pronto === true', { timeout: 10_000 });
    const alvo = await p.$('.palco');
    return Buffer.from(await alvo.screenshot({ type: 'png' }));
  });
}

// ── A peça livre: comunicado, anúncio, convite, card de novidade ────────────
//  O desenho é livre e a identidade é fixa. Quem chama escreve o conteúdo em
//  HTML com as peças do kit abaixo (cartão de vidro, rótulo, título, selo,
//  lista, passos, números, botão); a moldura - o fundo com os feixes, a logo,
//  a fonte, as cores - vem sempre daqui, e não há como trocá-la.

/** Os formatos: o tamanho final em pixels, a letra base (tudo no kit é em
 *  rem) e o respiro da borda. */
export const FORMATOS_DE_PECA = {
  quadrado: { largura: 1080, altura: 1080, base: 30, borda: 64 },
  retrato: { largura: 1080, altura: 1350, base: 30, borda: 68 },
  story: { largura: 1080, altura: 1920, base: 33, borda: 84 },
  paisagem: { largura: 1920, altura: 1080, base: 34, borda: 84 },
  banner: { largura: 1500, altura: 500, base: 23, borda: 48 },
};

const CSS_KIT = `
  .conteudo { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: safe center; gap: 1rem; overflow: hidden; }
  .cartao { position: relative; background: rgba(9, 15, 12, .80); border: 1px solid rgba(255,255,255,.08); border-radius: 1.1rem;
    backdrop-filter: blur(26px); -webkit-backdrop-filter: blur(26px); padding: 1.4rem 1.6rem; display: flex; flex-direction: column; gap: .7rem; }
  .cartao.limao { background: ${LIMAO}; border-color: ${LIMAO}; color: ${PRETO}; }
  .cartao.limao h1, .cartao.limao h2, .cartao.limao h3, .cartao.limao p, .cartao.limao .texto { color: ${PRETO}; }
  .rotulo { font-size: .6rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: ${LIMAO}; }
  h1, .titulo { font-size: 2.3rem; line-height: 1.06; font-weight: 800; letter-spacing: -.025em; color: #F4F7F5; }
  h2 { font-size: 1.35rem; line-height: 1.18; font-weight: 700; letter-spacing: -.015em; color: #F4F7F5; }
  h3 { font-size: .95rem; line-height: 1.25; font-weight: 700; color: #F4F7F5; }
  p, .texto { font-size: .82rem; line-height: 1.5; color: #B8C0BB; }
  .sub { font-size: 1rem; line-height: 1.4; color: #A9B1AC; }
  em, .destaque { font-style: normal; color: ${LIMAO}; }
  b, strong { font-weight: 700; color: #F4F7F5; }
  .selo { display: inline-flex; align-self: flex-start; align-items: center; gap: .4rem; padding: .32rem .85rem; border-radius: 999px;
    background: ${LIMAO}; color: ${PRETO}; font-size: .58rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
  .selo.vazado { background: transparent; color: ${LIMAO}; border: 1.5px solid ${LIMAO}; }
  .lista { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .55rem; }
  .lista li { position: relative; padding-left: 1.15rem; font-size: .85rem; line-height: 1.45; color: #E7EEEA; }
  .lista li::before { content: ''; position: absolute; left: 0; top: .52em; width: .42rem; height: .42rem; border-radius: 50%; background: ${LIMAO}; }
  .passos { list-style: none; padding: 0; margin: 0; counter-reset: passo; display: flex; flex-direction: column; gap: .85rem; }
  .passos li { counter-increment: passo; display: grid; grid-template-columns: 1.8rem 1fr; column-gap: .85rem; row-gap: .15rem; align-items: start; }
  .passos li::before { content: counter(passo); grid-row: span 2; width: 1.8rem; height: 1.8rem; border-radius: 50%; background: ${LIMAO}; color: ${PRETO};
    font-size: .8rem; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .passos li b, .passos li strong { font-size: .92rem; color: #F4F7F5; }
  .passos li span { font-size: .74rem; line-height: 1.4; color: #A9B1AC; }
  .grade { display: grid; gap: .9rem; }
  .grade.dois { grid-template-columns: repeat(2, 1fr); }
  .grade.tres { grid-template-columns: repeat(3, 1fr); }
  .grade.quatro { grid-template-columns: repeat(4, 1fr); }
  .linha { display: flex; gap: .9rem; align-items: center; }
  .numero { font-size: 2.4rem; font-weight: 800; line-height: 1; letter-spacing: -.02em; color: #F4F7F5; font-variant-numeric: tabular-nums; }
  .numero small { display: block; margin-top: .4rem; font-size: .56rem; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #8E9590; }
  .botao { display: inline-flex; align-self: flex-start; align-items: center; gap: .5rem; padding: .7rem 1.4rem; border-radius: 999px;
    background: ${LIMAO}; color: ${PRETO}; font-size: .8rem; font-weight: 800; }
  .botao.vazado { background: transparent; color: ${LIMAO}; border: 1.5px solid ${LIMAO}; }
  .divisor { height: 1px; background: rgba(255,255,255,.08); }
  .icone { width: 1.6rem; height: 1.6rem; color: ${LIMAO}; flex-shrink: 0; }
  .icone.grande { width: 2.6rem; height: 2.6rem; }
  svg { stroke-linecap: round; stroke-linejoin: round; }
  .centro { text-align: center; align-items: center; }
  .centro .selo, .centro .botao { align-self: center; }
  .rodape { position: relative; display: flex; justify-content: space-between; gap: 1rem; font-size: .52rem; color: #B8C0BB;
    text-shadow: 0 1px 10px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8); }
`;

/** O HTML de quem chama, sem o que não é conteúdo: script, quadro embutido,
 *  folha de estilo própria (a identidade é a daqui), evento, link para
 *  javascript e emoji (a marca usa ícone de traço, nunca emoji). */
export function limparHtmlDaPeca(html) {
  return String(html ?? '')
    // Primeiro as que embrulham conteúdo, inteiras com o que vai dentro; depois
    // qualquer abertura ou fechamento solto que tenha sobrado.
    .replace(/<\s*(script|style|iframe|object|embed|form|textarea|button|noscript|template)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base|form|input|textarea|button|noscript|template)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
    .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, '');
}

/** A peça livre em PNG, no tamanho exato do formato. Devolve também se o
 *  conteúdo passou do espaço, para quem chama encurtar. */
export async function pecaEmPng(spec) {
  const f = FORMATOS_DE_PECA[spec.formato] ?? FORMATOS_DE_PECA.quadrado;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; }
    html { font-size: ${f.base}px; }
    body { width: ${f.largura}px; height: ${f.altura}px; background: #050A08; overflow: hidden; }
    ${CSS_LUZES}
    .palco { width: ${f.largura}px; height: ${f.altura}px; padding: ${f.borda}px; display: flex; flex-direction: column; gap: 1.1rem; }
    .topo { position: relative; display: flex; justify-content: space-between; align-items: center; }
    .marcas .sheep { height: ${Math.round(f.base * 1.55)}px; }
    .marcas .cliente { max-height: ${Math.round(f.base * 1.4)}px; }
    ${CSS_KIT}
  </style></head><body><div class="palco">
    <div class="topo">${marcasHtml(spec.cliente)}</div>
    <main class="conteudo">${limparHtmlDaPeca(spec.html)}</main>
    ${spec.rodape ? `<div class="rodape"><span>${esc(spec.rodape)}</span><span>Sheep Technology</span></div>` : ''}
  </div>${SCRIPT_LOGO}</body></html>`;
  return comNavegador(async (p) => {
    await p.setViewport({ width: f.largura, height: f.altura, deviceScaleFactor: 1 });
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForFunction('window.__pronto === true', { timeout: 10_000 });
    const transbordou = await p.evaluate(() => {
      const c = document.querySelector('.conteudo');
      return !!c && (c.scrollHeight > c.clientHeight + 2 || c.scrollWidth > c.clientWidth + 2);
    });
    const alvo = await p.$('.palco');
    return { png: Buffer.from(await alvo.screenshot({ type: 'png' })), transbordou, largura: f.largura, altura: f.altura };
  });
}

/** A logo do cliente em PNG, para o Word, que não abre WebP nem SVG. */
async function logoEmPng(dataUri) {
  return comNavegador(async (p) => {
    await p.setViewport({ width: 600, height: 300, deviceScaleFactor: 2 });
    await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><img id="l" src="${dataUri}" style="max-height:120px;max-width:480px;display:block"></body></html>`, { waitUntil: 'load' });
    const alvo = await p.$('#l');
    const caixa = await alvo.boundingBox();
    return { png: Buffer.from(await alvo.screenshot({ type: 'png', omitBackground: true })), largura: caixa.width, altura: caixa.height };
  });
}

// ── O relatório ─────────────────────────────────────────────────────────────

/** **negrito** e *itálico*, do texto do modelo para HTML. */
const inlineHtml = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<i>$2</i>');

/** Blocos de um texto: parágrafos e listas ("- item"). */
function blocos(texto) {
  const saida = [];
  let lista = null;
  let par = [];
  const fechaPar = () => { if (par.length) { saida.push({ tipo: 'p', texto: par.join(' ') }); par = []; } };
  for (const bruta of String(texto ?? '').split('\n')) {
    const l = bruta.trim();
    const item = l.match(/^[-•]\s+(.*)$/);
    if (item) {
      fechaPar();
      if (!lista) { lista = { tipo: 'lista', itens: [] }; saida.push(lista); }
      lista.itens.push(item[1]);
    } else if (!l) {
      fechaPar();
      lista = null;
    } else {
      lista = null;
      par.push(l);
    }
  }
  fechaPar();
  return saida;
}

/** O relatório em PDF, A4, para imprimir e mandar adiante. */
export async function relatorioEmPdf(rel) {
  const secoes = [];
  for (const s of rel.secoes ?? []) {
    let html = `<section><h2>${esc(s.titulo)}</h2>`;
    for (const b of blocos(s.texto)) {
      html += b.tipo === 'p' ? `<p>${inlineHtml(b.texto)}</p>` : `<ul>${b.itens.map(i => `<li>${inlineHtml(i)}</li>`).join('')}</ul>`;
    }
    if (s.tabela?.colunas?.length) {
      html += `<table><thead><tr>${s.tabela.colunas.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>`
        + (s.tabela.linhas ?? []).map(l => `<tr>${l.map(c => `<td>${inlineHtml(c)}</td>`).join('')}</tr>`).join('') + '</tbody></table>';
    }
    if (s.grafico?.tipo) {
      html += `<figure>${await svgDoGrafico(s.grafico, 'claro', 1040, 420)}${s.grafico.titulo ? `<figcaption>${esc(s.grafico.titulo)}</figcaption>` : ''}</figure>`;
    }
    secoes.push(`${html}</section>`);
  }
  const destaques = Array.isArray(rel.destaques) && rel.destaques.length
    ? `<div class="destaques">${rel.destaques.slice(0, 4).map(d => `<div class="destaque"><b>${esc(d.valor)}</b><span>${esc(d.rotulo)}</span></div>`).join('')}</div>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, Arial, sans-serif; color: ${PRETO}; font-size: 11pt; line-height: 1.55; }
    ${CSS_LUZES}
    .capa { border-radius: 16px; padding: 26px 28px 24px; margin-bottom: 22px; }
    .capa .marcas .sheep { height: 30px; }
    .capa .marcas .traco { height: 34px; }
    .capa .marcas .cliente { max-height: 36px; max-width: 160px; }
    .capa .marcas .chip .cliente { max-height: 26px; }
    .capa .texto { position: relative; margin-top: 18px; padding: 16px 18px; }
    .capa .rotulo { font-size: 9pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${LIMAO}; }
    .capa h1 { margin: 6px 0 0; font-size: 22pt; line-height: 1.15; font-weight: 700; color: #F4F7F5; }
    .capa .sub { margin-top: 6px; color: #B8C0BB; font-size: 11pt; }
    .capa .data { margin-top: 10px; color: #8E9590; font-size: 9pt; }
    .destaques { display: flex; gap: 10px; margin: 0 0 18px; }
    .destaque { flex: 1; border: 1px solid #E3E6E1; border-left: 5px solid ${LIMAO}; border-radius: 10px; padding: 10px 12px; }
    .destaque b { display: block; font-size: 17pt; font-weight: 800; }
    .destaque span { font-size: 9pt; color: #6B716D; }
    section { margin-bottom: 18px; break-inside: auto; }
    h2 { font-size: 14pt; margin: 18px 0 8px; padding-left: 10px; border-left: 5px solid ${LIMAO}; break-after: avoid; }
    p { margin: 0 0 8px; }
    ul { margin: 0 0 10px; padding-left: 20px; }
    li { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; font-size: 9.5pt; }
    th { background: ${LIMAO}; color: ${PRETO}; text-align: left; padding: 7px 8px; font-weight: 700; }
    td { padding: 6px 8px; border-bottom: 1px solid #E8EAE6; vertical-align: top; }
    tr { break-inside: avoid; }
    figure { margin: 10px 0 14px; break-inside: avoid; }
    figure svg { width: 100%; height: auto; display: block; }
    figcaption { font-size: 9pt; color: #6B716D; margin-top: 4px; text-align: center; }
  </style></head><body>
    <div class="palco capa">
      ${marcasHtml(rel.cliente)}
      <div class="vidro texto"><div class="rotulo">${esc(rel.rotulo ?? 'Relatório')}</div>
        <h1>${esc(rel.titulo)}</h1>${rel.subtitulo ? `<div class="sub">${esc(rel.subtitulo)}</div>` : ''}<div class="data">Gerado em ${quandoAgora()} | Portal Sheep</div></div></div>
    ${destaques}${secoes.join('')}
  ${SCRIPT_LOGO}</body></html>`;
  return comNavegador(async (p) => {
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForFunction('window.__pronto === true', { timeout: 10_000 });
    return Buffer.from(await p.pdf({
      format: 'A4', printBackground: true, displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8px;color:#8E9590;font-family:Arial;padding:0 16mm;display:flex;justify-content:space-between">`
        + `<span>${esc(rel.titulo)}</span><span>Sheep Technology | <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    }));
  });
}

/** Trechos de texto com **negrito** e *itálico* para o Word. */
function runs(texto, base = {}) {
  const partes = [];
  const re = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*/g;
  let ultimo = 0;
  let m;
  const s = String(texto ?? '');
  while ((m = re.exec(s))) {
    if (m.index > ultimo) partes.push(new TextRun({ ...base, text: s.slice(ultimo, m.index) }));
    partes.push(new TextRun({ ...base, text: m[1] ?? m[2], bold: m[1] ? true : base.bold, italics: m[2] ? true : base.italics }));
    ultimo = re.lastIndex;
  }
  if (ultimo < s.length) partes.push(new TextRun({ ...base, text: s.slice(ultimo) }));
  return partes;
}

/** O gráfico claro em PNG, para entrar no Word. */
async function graficoClaroEmPng(spec) {
  const svg = await svgDoGrafico(spec, 'claro', 1040, 420);
  return comNavegador(async (p) => {
    await p.setViewport({ width: 1040, height: 900, deviceScaleFactor: 2 });
    await p.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: 'load' });
    const alvo = await p.$('svg');
    const caixa = await alvo.boundingBox();
    return { png: Buffer.from(await alvo.screenshot({ type: 'png' })), largura: caixa.width, altura: caixa.height };
  });
}

/** O relatório em Word (.docx), para editar e mandar adiante. */
export async function relatorioEmDocx(rel) {
  const borda = { style: BorderStyle.SINGLE, size: 4, color: 'E8EAE6' };
  // A logo do cliente, quando o relatório é dele, ao lado da Sheep, com as
  // cores dela: no Word a página é clara, e a versão branca sumiria.
  const doCliente = rel.cliente?.logo ? await logoEmPng(rel.cliente.logo).catch(() => null) : null;
  const marcas = [new ImageRun({ type: 'png', data: LOGO, transformation: { width: 168, height: 48 } })];
  if (doCliente) {
    const altura = 44;
    marcas.push(new TextRun({ text: '      |      ', color: 'C9CDC8', size: 32 }));
    marcas.push(new ImageRun({ type: 'png', data: doCliente.png,
      transformation: { width: Math.min(200, Math.round((doCliente.largura / doCliente.altura) * altura)), height: altura } }));
  }
  const filhos = [
    new Paragraph({ children: marcas, spacing: { after: 240 } }),
    new Paragraph({ children: [new TextRun({ text: String(rel.rotulo ?? 'Relatório').toUpperCase(), bold: true, size: 18, color: '6B716D' })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: rel.titulo ?? '', bold: true, size: 48, color: '121316' })], spacing: { after: 80 } }),
  ];
  if (rel.subtitulo) filhos.push(new Paragraph({ children: [new TextRun({ text: rel.subtitulo, size: 24, color: '4E5A54' })] }));
  filhos.push(new Paragraph({
    children: [new TextRun({ text: `Gerado em ${quandoAgora()} | Portal Sheep`, size: 18, color: '8E9590' })],
    border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: 'E9FC00', space: 6 } }, spacing: { after: 280 },
  }));
  if (Array.isArray(rel.destaques) && rel.destaques.length) {
    const ds = rel.destaques.slice(0, 4);
    filhos.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({
        children: ds.map(d => new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F6F2' },
          borders: { top: borda, bottom: borda, right: borda, left: { style: BorderStyle.SINGLE, size: 24, color: 'E9FC00' } },
          children: [
            new Paragraph({ children: [new TextRun({ text: String(d.valor ?? ''), bold: true, size: 32 })] }),
            new Paragraph({ children: [new TextRun({ text: String(d.rotulo ?? ''), size: 18, color: '6B716D' })] }),
          ],
        })),
      })],
    }));
    filhos.push(new Paragraph({ text: '' }));
  }
  for (const s of rel.secoes ?? []) {
    filhos.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: s.titulo ?? '', bold: true, size: 28, color: '121316' })],
      border: { left: { style: BorderStyle.SINGLE, size: 36, color: 'E9FC00', space: 8 } },
      spacing: { before: 280, after: 120 },
    }));
    for (const b of blocos(s.texto)) {
      if (b.tipo === 'p') filhos.push(new Paragraph({ children: runs(b.texto), spacing: { after: 120 } }));
      else for (const i of b.itens) filhos.push(new Paragraph({ children: runs(i), numbering: { reference: 'marcadores', level: 0 } }));
    }
    if (s.tabela?.colunas?.length) {
      const cab = new TableRow({
        tableHeader: true,
        children: s.tabela.colunas.map(c => new TableCell({
          shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E9FC00' },
          children: [new Paragraph({ children: [new TextRun({ text: String(c), bold: true, size: 19 })] })],
        })),
      });
      const corpo = (s.tabela.linhas ?? []).map(l => new TableRow({
        children: l.map(c => new TableCell({
          borders: { top: borda, bottom: borda, left: borda, right: borda },
          children: [new Paragraph({ children: runs(String(c ?? ''), { size: 19 }) })],
        })),
      }));
      filhos.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [cab, ...corpo] }));
      filhos.push(new Paragraph({ text: '' }));
    }
    if (s.grafico?.tipo) {
      const g = await graficoClaroEmPng(s.grafico);
      const largura = 600;
      filhos.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ type: 'png', data: g.png, transformation: { width: largura, height: Math.round((g.altura / g.largura) * largura) } })],
      }));
      if (s.grafico.titulo) {
        filhos.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: s.grafico.titulo, size: 18, color: '6B716D' })], spacing: { after: 200 } }));
      }
    }
  }
  const doc = new Document({
    creator: 'Sheep Technology',
    title: rel.titulo ?? 'Relatório',
    styles: { default: { document: { run: { font: 'Inter', size: 22, color: '121316' } } } },
    numbering: {
      config: [{ reference: 'marcadores', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 260 } } } }] }],
    },
    sections: [{
      headers: { default: new Header({ children: [] }) },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'Sheep Technology | ', size: 16, color: '8E9590' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '8E9590' })],
          })],
        }),
      },
      children: filhos,
    }],
  });
  return Packer.toBuffer(doc);
}
