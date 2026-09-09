// ─────────────────────────────────────────────────────────────────────────────
//  Monta a proposta: injeta os slides no template e confere antes de entregar.
//
//  As verificações são as mesmas do `montar.cjs` da skill, e existem porque
//  erro aqui é silencioso e caro: uma `<div>` sem fechar faz o navegador
//  aninhar os slides seguintes dentro do anterior, e a proposta chega quebrada
//  no cliente sem ninguém perceber até ele abrir.
//
//  Por isso montar devolve os problemas em vez de gravar assim mesmo. Um deck
//  com `{{CLIENTE_NOME}}` na capa, ou com os números da LPA sobrando, é pior do
//  que deck nenhum.
// ─────────────────────────────────────────────────────────────────────────────
import { slidesDaProposta } from './slides';
import {
  CTA_WHATSAPP, FECHO, PASSOS_DO_FECHAMENTO, type DadosProposta,
} from './tipos';

export interface Conferencia {
  problemas: string[];
  avisos: string[];
  slides: number;
}

export type Montagem =
  | { ok: true; html: string; conferencia: Conferencia }
  | { ok: false; conferencia: Conferencia };

/** Sem comentários, `<style>` nem `<script>`: analisa só o HTML visível. */
function soHtml(s: string): string {
  return s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');
}

export function conferir(html: string): Conferencia {
  const problemas: string[] = [];
  const avisos: string[] = [];

  // 1) Placeholder esquecido aparece literalmente como {{ALGO}} na tela do cliente.
  const sobrando = html.match(/\{\{[A-Z_0-9]+\}\}/g);
  if (sobrando) {
    problemas.push(`placeholders não preenchidos: ${[...new Set(sobrando)].join(', ')}`);
  }

  const limpo = soHtml(html);

  // 2) Balanço de <div>. Foi isto que já quebrou os slides finais uma vez.
  const abre = (limpo.match(/<div\b/g) || []).length;
  const fecha = (limpo.match(/<\/div>/g) || []).length;
  if (abre !== fecha) {
    problemas.push(`divs desbalanceadas: ${abre} abertas x ${fecha} fechadas`);
  }

  const slides = limpo.split(/<div class="slide/).slice(1);

  // 3) Todo slide precisa do rodapé, que é onde vive a barra de progresso.
  const semRodape = slides.filter(s => !s.includes('class="sf"')).length;
  if (semRodape > 0) problemas.push(`${semRodape} slide(s) sem o rodapé`);

  // 4) `data-secao` alimenta a Agenda, que se monta sozinha. Sem o atributo o
  //    slide some do índice, e o navegador não reclama. A capa fica de fora.
  const semSecao = slides.slice(1)
    .filter(s => s.includes('class="sh"') && !s.includes('data-secao')).length;
  if (semSecao > 0) {
    problemas.push(`${semSecao} slide(s) sem data-secao (somem da Agenda sem avisar)`);
  }

  // 5) Os slides de exemplo do template trazem os números de OUTRO cliente.
  const exemplos = (limpo.match(/data-exemplo\b/g) || []).length;
  if (exemplos > 0) {
    problemas.push(`${exemplos} slide(s) de exemplo do template ainda no arquivo`);
  }

  // 6) Travessão no texto visível. Regra da casa: passa cara de texto gerado.
  const visivel = limpo.replace(/<[^>]+>/g, ' ');
  const travessoes = (visivel.match(/[—–]/g) || []).length;
  if (travessoes > 0) {
    problemas.push(`${travessoes} travessão(ões) no texto visível - trocar por vírgula, dois-pontos ou "·"`);
  }

  // 7) Link que troca a aba. O template corrige por JS, mas escrever certo
  //    desde o começo evita depender disso.
  const links = limpo.match(/<a\s[^>]*href="(?!#|mailto:|tel:|javascript:)[^"]*"[^>]*>/gi) || [];
  const semBlank = links.filter(l => !/target="_blank"/i.test(l)).length;
  if (semBlank > 0) avisos.push(`${semBlank} link(s) sem target="_blank"`);

  return { problemas, avisos, slides: slides.length };
}

/** Troca um trecho entre dois marcadores, preservando os marcadores. */
function entre(html: string, ini: string, fim: string, novo: string): string | null {
  const i = html.indexOf(ini);
  const f = html.indexOf(fim);
  if (i < 0 || f < 0 || f < i) return null;
  return html.slice(0, i + ini.length) + '\n' + novo + '\n  ' + html.slice(f);
}

/** O que o template pede nos `{{...}}`. */
function placeholders(d: DadosProposta): Record<string, string> {
  return {
    CLIENTE_NOME: d.cliente,
    SUBTITULO: d.subtitulo,
    PREPARADO_POR: d.preparadoPor,
    APRESENTADO_POR: d.apresentadoPor,
    CLOSING_SUB: FECHO,
    CLOSING_STEP_1: PASSOS_DO_FECHAMENTO[0],
    CLOSING_STEP_2: PASSOS_DO_FECHAMENTO[1],
    CLOSING_STEP_3: PASSOS_DO_FECHAMENTO[2],
    WHATSAPP_CTA_LINK: CTA_WHATSAPP,
    ANO: String(new Date().getFullYear()),
    VALIDADE_DIAS: String(d.validadeDias),
  };
}

/**
 * O deck pronto, ou a lista do que impede de entregá-lo.
 *
 * `template` é o `base.v3.template.html`, lido de `/propostas/`. Ele não vem
 * embutido no código: são 83 kB que só quem monta uma proposta precisa baixar.
 */
function armar(template: string, d: DadosProposta): string | null {
  let html = entre(template, '<!-- INICIO_CONTEUDO -->', '<!-- FIM_CONTEUDO -->',
    slidesDaProposta(d));
  if (!html) return null;

  // O escalador do iframe do protótipo. Só entra quando há protótipo: sem ele o
  // bloco de módulos fica vazio, como no template.
  if (d.entregas.some(e => e.prototipo)) {
    const comScript = entre(html, '// INICIO_SCRIPT_MODULOS', '// FIM_SCRIPT_MODULOS', ESCALADOR);
    if (comScript) html = comScript;
  }

  for (const [chave, valor] of Object.entries(placeholders(d))) {
    html = html.split(`{{${chave}}}`).join(valor);
  }
  return html;
}

export function montarProposta(template: string, d: DadosProposta): Montagem {
  const html = armar(template, d);
  if (!html) {
    return {
      ok: false,
      conferencia: { problemas: ['o template não tem os marcadores de conteúdo'], avisos: [], slides: 0 },
    };
  }
  const conferencia = conferir(html);
  if (conferencia.problemas.length) return { ok: false, conferencia };
  return { ok: true, html, conferencia };
}

/**
 * O mesmo deck, mas sem porteiro: a prévia mostra a proposta pela metade
 * enquanto ela está sendo escrita.
 *
 * As conferências continuam valendo na hora de entregar - é lá que elas
 * importam. Aqui elas atrapalhariam: quem está no primeiro campo ainda não tem
 * investimento nem cronograma, e não é erro, é o começo.
 */
export function montarPrevia(template: string, d: DadosProposta): string | null {
  return armar(template, d);
}

/**
 * Encaixa o protótipo no slide.
 *
 * O iframe é desenhado no tamanho real (1440 de largura, na LPA) e reduzido por
 * `transform`, e não por `zoom`: assim o conteúdo dentro dele continua achando
 * que está numa tela grande, e o layout não quebra. Quando nem reduzindo cabe,
 * a moldura vira uma janela com rolagem lateral e a dica aparece.
 */
const ESCALADOR = `
(function () {
  function encaixar() {
    document.querySelectorAll('[data-biframe]').forEach(function (moldura) {
      var quadro = moldura.querySelector('[data-biframe-src]');
      if (!quadro) return;
      var largura = quadro.offsetWidth || 1440;
      var altura = quadro.offsetHeight || 900;
      var escala = moldura.clientWidth / largura;
      quadro.style.transform = 'scale(' + escala + ')';
      moldura.style.height = Math.round(altura * escala) + 'px';
      var dica = moldura.parentElement && moldura.parentElement.querySelector('[data-biframe-dica]');
      if (dica) {
        var estreito = escala < 0.34;
        dica.hidden = !estreito;
        dica.style.display = estreito ? 'flex' : 'none';
      }
    });
  }
  window.addEventListener('resize', encaixar);
  window.addEventListener('load', encaixar);
  encaixar();
})();
`;
