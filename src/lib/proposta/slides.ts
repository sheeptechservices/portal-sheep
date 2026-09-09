// ─────────────────────────────────────────────────────────────────────────────
//  Os slides do projeto, escritos a partir do formulário.
//
//  A marcação é a da proposta aprovada SHP-LPA-26-01: mesmas classes, mesmos
//  estilos inline, só o texto muda. Cada slide cabe em uma tela - conteúdo
//  longo vira mais slides, nunca rolagem interna -, e todo slide leva
//  `data-secao` no cabeçalho, que é o que monta a Agenda sozinha.
//
//  O slide de investimento é o único escuro (`slide sd`), e a marcação dele é
//  toda em estilo inline: as cores daquele slide não existem no resto do deck,
//  então não há classe para reaproveitar. Copiar como está é o que faz a opção
//  recomendada ter a borda verde-limão e o brilho.
// ─────────────────────────────────────────────────────────────────────────────
import type {
  DadosProposta, Entrega, Fase, OpcaoInvestimento, PapelDoTime,
} from './tipos';

/** Escapa o que vai para dentro do HTML da proposta. */
export const esc = (v: string) => v
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cabecalho = (secao: string) =>
  `<div class="sh" data-secao="${esc(secao)}"><div class="st">Sheep Technology</div>`
  + '<div class="sn" data-num></div></div>';

const rodape = '<div class="sf"><div class="pt"><div class="pf"></div></div></div>';

const lista = (itens: string[]) =>
  `<ul class="krl">${itens.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

// ── O projeto ───────────────────────────────────────────────────────────────

function slideProjeto(d: DadosProposta): string {
  return `<div class="slide">
    ${cabecalho('O projeto')}
    <div class="title a">O projeto</div>
    <div class="rule a"></div>
    <div class="g2 a">
      <div class="body-text" style="max-width:none">${esc(d.projeto)}</div>
      ${lista(d.ganhos)}
    </div>
    ${rodape}
  </div>`;
}

// ── Entregas ────────────────────────────────────────────────────────────────

/** A entrega sem protótipo: narrativa à esquerda, pontos à direita. */
function slideEntrega(e: Entrega, n: number): string {
  const nome = `Entrega ${n} · ${e.nome}`;
  return `<div class="slide">
    ${cabecalho(nome)}
    <div class="title a">${esc(nome)}</div>
    <div class="rule a"></div>
    <div class="g2 a">
      <div class="body-text" style="max-width:none">${esc(e.resumo)}</div>
      ${lista(e.itens)}
    </div>
    ${rodape}
  </div>`;
}

/**
 * A entrega com protótipo: o produto aparece funcionando dentro do slide.
 *
 * O HTML do protótipo vai no `srcdoc` do iframe, e não num arquivo ao lado: a
 * proposta sai como um arquivo só, que se manda por e-mail e abre em qualquer
 * lugar sem uma pasta de assets junto.
 */
function slideEntregaComPrototipo(e: Entrega, n: number): string {
  const nome = `Entrega ${n} · ${e.nome}`;
  const p = e.prototipo!;
  return `<div class="slide sw">
    ${cabecalho(nome)}
    <div class="title sm a" style="margin-bottom:clamp(3px,0.4vh,6px)">${esc(nome)}</div>
    <div class="body-text a" style="max-width:none;margin-bottom:clamp(6px,0.8vh,11px)">${esc(e.resumo)}</div>
    <div class="a" data-biframe style="position:relative;width:100%;overflow:hidden;border-radius:clamp(7px,0.8vw,12px);border:1px solid #DDE2DA;box-shadow:0 12px 34px rgba(0,0,0,0.10);background:#F5F7F4">
      <iframe data-biframe-src srcdoc="${esc(p.html)}" title="${esc(p.titulo)}" loading="lazy" scrolling="no" style="position:absolute;top:0;left:0;width:${p.largura}px;height:${p.altura}px;border:0;transform-origin:top left"></iframe>
    </div>
    <div data-biframe-dica hidden style="display:none;align-items:center;gap:6px;margin-top:clamp(5px,0.8vh,9px);font-size:clamp(10px,2.6vw,12px);color:var(--gray2)">
      <span>Arraste o painel para o lado para ver o resto.</span>
    </div>
    ${rodape}
  </div>`;
}

// ── Como funciona ───────────────────────────────────────────────────────────

function slideComoFunciona(d: DadosProposta): string {
  const c = d.comoFunciona!;
  const cards = c.passos.map((p, i) => `<div class="card ct">
        <div class="card-num">${i + 1}</div>
        <b>${esc(p.titulo)}</b>
        <div class="body-text" style="max-width:none">${esc(p.texto)}</div>
      </div>`).join('');
  return `<div class="slide sw">
    ${cabecalho('Como funciona')}
    <div class="title sm a" style="margin-bottom:clamp(4px,0.6vh,8px)">Como funciona</div>
    <div class="body-text a" style="max-width:none;margin-bottom:clamp(12px,1.8vh,22px)">${esc(c.linhaFina)}</div>
    <div class="g3 a">${cards}</div>
    <div class="note a" style="margin-top:clamp(12px,1.8vh,22px)">${esc(c.nota)}</div>
    ${rodape}
  </div>`;
}

// ── Cronograma ──────────────────────────────────────────────────────────────

const pct = (v: number) => `${Number((v * 100).toFixed(2))}%`;

/** Onde a barra de uma fase começa e termina, na régua de meses. */
function barra(f: Fase, meses: number): { esq: string; larg: string; dur: string } {
  const de = Math.max(1, Math.min(f.de, meses));
  const ate = Math.max(de, Math.min(f.ate, meses));
  const quantos = ate - de + 1;
  return {
    esq: pct((de - 1) / meses),
    larg: pct(quantos / meses),
    dur: quantos === 1 ? '1 mês' : `${quantos} meses`,
  };
}

function faseDoCronograma(f: Fase, i: number, meses: number): string {
  const b = barra(f, meses);
  // A transversal atravessa o projeto inteiro: textura diagonal na barra, `*`
  // no lugar do número e "contínuo" no rótulo, em vez da contagem de meses.
  const num = f.transversal
    ? '<span class="gantt-num aster">*</span>'
    : `<span class="gantt-num">${String(i + 1).padStart(2, '0')}</span>`;
  const classeFase = f.transversal ? 'gantt-fase cross-fase' : 'gantt-fase';
  const classeBarra = f.transversal ? 'gantt-bar cross' : 'gantt-bar';
  const rotulo = f.transversal ? 'contínuo' : b.dur;
  const periodo = f.de === f.ate ? `Mês ${f.de}` : `Mês ${f.de} a ${f.ate}`;

  return `<div class="${classeFase}" data-fase="${i}" data-nonav>
          <div class="gantt-row">
            <div class="gantt-name">
              <svg class="fase-seta" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5 L7 5 L3.5 8.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
              ${num}${esc(f.nome)}
            </div>
            <div class="gantt-track"><div class="${classeBarra}" style="left:${b.esq};width:${b.larg};animation-delay:.${i + 1}0s"><span>${rotulo}</span></div></div>
            <span class="dica-balao">Clique para ver as entregas</span>
          </div>
          <div class="fase-exp"><div class="fase-exp-in">
            <div class="fd-head"><span class="fd-nome">${esc(f.nome)}</span><span class="fd-dur">${periodo}</span></div>
            <ul class="fd-sub">${f.sub.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
            <div class="fd-rot">Entregas</div>
            <div class="fd-entregas">${f.entregas.map(e => `<span class="fd-entrega">${esc(e)}</span>`).join('')}</div>
          </div></div>
        </div>`;
}

function slideCronograma(d: DadosProposta): string {
  const { meses, fases } = d.cronograma;
  const linhas = Array.from({ length: meses }, (_, i) =>
    `<span style="left:${pct((i + 1) / meses)}"></span>`).join('');
  const colunas = Array.from({ length: meses }, (_, i) =>
    `<div class="gantt-week">Mês ${i + 1}</div>`).join('');
  // Marcos a cada terço do projeto, e a bandeira no fim.
  const marcos = [1 / 3, 2 / 3]
    .map(f => `<span class="marco sprint" style="left:${pct(f)}"></span>`).join('');

  return `<div class="slide">
    ${cabecalho('Cronograma')}
    <div class="title sm a">Cronograma</div>
    <div class="rule a"></div>
    <div class="gantt a">
      <div class="gantt-corpo">
        <div class="gantt-vlines" aria-hidden="true">${linhas}</div>
        <div class="gantt-head">
          <div class="gantt-namecol"></div>
          <div class="gantt-weeks" style="grid-template-columns:repeat(${meses},1fr)">${colunas}</div>
        </div>
        <div class="gantt-marcos">
          <div class="gantt-namecol"></div>
          <div class="gantt-marcos-track">
            ${marcos}
            <span class="marco fim" style="left:100%"></span>
            <svg class="marco-bandeira" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.2 1.5 V14.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="3.4" y="2.2" width="10.4" height="7.2" stroke="currentColor" stroke-width="0.9" fill="none"/><rect x="3.4" y="2.2" width="3.4" height="2.4" fill="currentColor"/><rect x="10.2" y="2.2" width="3.6" height="2.4" fill="currentColor"/><rect x="6.8" y="4.6" width="3.4" height="2.4" fill="currentColor"/><rect x="3.4" y="7" width="3.4" height="2.4" fill="currentColor"/><rect x="10.2" y="7" width="3.6" height="2.4" fill="currentColor"/></svg>
          </div>
        </div>
        ${fases.map((f, i) => faseDoCronograma(f, i, meses)).join('\n        ')}
      </div>
    </div>
    ${rodape}
  </div>`;
}

// ── Investimento ────────────────────────────────────────────────────────────

function cardDeOpcao(o: OpcaoInvestimento): string {
  const moldura = o.recomendada
    ? 'background:rgba(190,255,1,0.05);border:2px solid var(--yellow);box-shadow:0 0 clamp(28px,3vw,44px) rgba(190,255,1,0.09)'
    : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.13)';
  const etiqueta = o.recomendada
    ? 'background:var(--yellow);color:var(--black)'
    : 'background:rgba(255,255,255,0.13);color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.18)';
  const cifrao = o.recomendada ? 'var(--yellow)' : 'rgba(255,255,255,0.45)';
  const corUnidade = o.recomendada ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.5)';
  const bullet = o.recomendada
    ? 'background:rgba(190,255,1,0.06);border-color:rgba(190,255,1,0.28);color:rgba(255,255,255,0.9)'
    : 'background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.11);color:rgba(255,255,255,0.82)';

  const molduraDestaque = o.recomendada
    ? 'background:var(--yd);border:1px solid var(--yb)'
    : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.14)';
  const destaque = o.destaque
    ? `<div style="flex:1;${molduraDestaque};border-radius:clamp(7px,0.8vw,11px);padding:clamp(6px,0.7vw,10px) clamp(9px,1vw,14px)">
            <div style="display:flex;align-items:baseline;gap:clamp(5px,0.55vw,8px)">
              <span style="font-size:clamp(14px,1.55vw,22px);font-weight:800;color:${o.recomendada ? 'var(--yellow)' : '#fff'};line-height:1;white-space:nowrap">${esc(o.destaque.valor)}</span>
              <span style="font-size:clamp(8px,0.8vw,11px);font-weight:700;color:${o.recomendada ? '#fff' : 'rgba(255,255,255,0.8)'};line-height:1.3">${esc(o.destaque.texto)}</span>
            </div>${o.destaque.nota
              ? `\n            <div style="font-size:clamp(7px,0.72vw,10px);color:rgba(255,255,255,0.6);line-height:1.4;margin-top:clamp(2px,0.28vw,4px)">${esc(o.destaque.nota)}</div>`
              : ''}
          </div>`
    : '';

  return `<div style="position:relative;display:flex;flex-direction:column;${moldura};border-radius:clamp(10px,1.1vw,16px);padding:clamp(14px,1.67vw,24px)">
        <div style="position:absolute;top:calc(-1 * clamp(8px,0.85vw,12px));right:clamp(14px,1.67vw,24px);font-size:clamp(7px,0.68vw,10px);font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:clamp(3px,0.36vw,5px) clamp(9px,0.95vw,14px);border-radius:100px;white-space:nowrap;${etiqueta}">${esc(o.rotulo)}</div>
        <div class="eyebrow" style="margin:0">${esc(o.titulo)}</div>
        <div style="display:flex;align-items:center;gap:clamp(9px,1vw,15px);margin-top:clamp(5px,0.7vh,10px)">
          <div style="flex-shrink:0">
            <div class="price-figure" style="color:#fff;font-size:clamp(22px,2.5vw,36px)"><sup style="color:${cifrao}">R$</sup>${esc(o.valor)}</div>
            <div class="price-unit" style="color:${corUnidade};margin-top:clamp(2px,0.3vw,4px)">${esc(o.unidade)}</div>
          </div>
          ${destaque}
        </div>
        <ul class="krl" style="margin-top:clamp(8px,1vh,14px)">${o.bullets
          .map(b => `<li style="${bullet}">${esc(b)}</li>`).join('')}</ul>
      </div>`;
}

function linhaDoTime(p: PapelDoTime, i: number): string {
  const direita = p.naoCobrado
    ? '<span style="margin-left:auto;background:var(--yd);border:1px solid var(--yb);color:var(--yellow);font-size:clamp(6px,0.62vw,9px);font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:clamp(2px,0.24vw,4px) clamp(6px,0.62vw,9px);border-radius:100px;white-space:nowrap">Não cobrado</span>'
    : `<span style="margin-left:auto;font-size:clamp(7px,0.7vw,10px);color:rgba(255,255,255,0.55);font-weight:700;white-space:nowrap">${esc(p.dedicacao)}</span>`;

  return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);border-radius:clamp(9px,1vw,14px);padding:clamp(8px,0.85vw,13px) clamp(12px,1.3vw,19px)">
          <div style="display:flex;align-items:center;gap:clamp(6px,0.65vw,10px)">
            <span style="display:inline-block;background:var(--yellow);color:var(--black);font-weight:800;font-size:clamp(7px,0.66vw,10px);padding:clamp(2px,0.22vw,4px) clamp(6px,0.58vw,9px);border-radius:100px">${String(i + 1).padStart(2, '0')}</span>
            <span style="font-size:clamp(10px,1vw,14px);font-weight:700;color:#fff">${esc(p.papel)}</span>
            ${direita}
          </div>
          <div style="font-size:clamp(8px,0.8vw,11px);color:rgba(255,255,255,0.55);line-height:1.5;margin-top:clamp(5px,0.6vh,9px)">${esc(p.descricao)}</div>
        </div>`;
}

function slideInvestimento(d: DadosProposta): string {
  const { opcoes, time, memoria } = d.investimento;
  // Uma opção só mantém o mesmo layout, ocupando a largura. O time alocado e a
  // memória de cálculo continuam: são eles que sustentam o preço.
  const colunas = opcoes.length > 1 ? '1fr 1fr' : '1fr';

  return `<div class="slide sd">
    ${cabecalho('Investimento')}
    <div class="title sm a">Investimento</div>
    <div class="rule a"></div>
    <div class="g2 a" style="align-items:stretch;grid-template-columns:${colunas};gap:clamp(12px,1.4vw,22px)">
      ${opcoes.map(cardDeOpcao).join('\n      ')}
    </div>
    <div class="a" style="margin-top:clamp(12px,1.7vh,22px)">
      <div class="eyebrow" style="margin-bottom:clamp(5px,0.6vh,9px)">Time alocado</div>
      <div style="display:flex;flex-direction:column;gap:clamp(6px,0.7vh,10px)">
        ${time.map(linhaDoTime).join('\n        ')}
      </div>
    </div>
    <div class="a" style="margin-top:clamp(9px,1.3vh,16px);font-size:clamp(6px,0.62vw,9px);font-style:italic;line-height:1.6;color:rgba(255,255,255,0.42)"><b style="color:rgba(255,255,255,0.78);font-weight:700">Como se chega aos valores:</b> ${esc(memoria)}</div>
    ${rodape}
  </div>`;
}

// ── O conteúdo inteiro ──────────────────────────────────────────────────────

/**
 * Os slides do projeto, na ordem que a casa fechou: o projeto, uma entrega por
 * slide, como funciona, cronograma e investimento.
 */
export function slidesDaProposta(d: DadosProposta): string {
  const partes: string[] = [slideProjeto(d)];

  d.entregas.forEach((e, i) => {
    partes.push(e.prototipo ? slideEntregaComPrototipo(e, i + 1) : slideEntrega(e, i + 1));
  });

  if (d.comoFunciona) partes.push(slideComoFunciona(d));
  partes.push(slideCronograma(d));
  partes.push(slideInvestimento(d));

  return partes.join('\n');
}
