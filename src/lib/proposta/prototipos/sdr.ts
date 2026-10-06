// ─────────────────────────────────────────────────────────────────────────────
//  Os protótipos do SDR com IA, um por entrega do template.
//
//  São as telas do SheepCrew, no desenho da proposta de referência, e não da
//  Sheep: claro, barra lateral azul-marinho, azul como cor de ação e o verde do
//  WhatsApp onde a conversa acontece. Cada um é um documento inteiro, que vai
//  no `srcdoc` do iframe do slide - a proposta sai como um arquivo só.
//
//  O desenho comum (cores, barra lateral, conversa, tabela) mora no CSS base;
//  o miolo de cada tela, com os dados de exemplo e a interação, no arquivo
//  dela. Os dados são de mentira e dizem isso pelo jeito: empresas e pessoas
//  inventadas, números redondos de demonstração.
// ─────────────────────────────────────────────────────────────────────────────
import type { Prototipo } from '../tipos';
import base from './sdr-base.css?raw';
import prospeccao from './sdr-prospeccao.html?raw';
import qualificacao from './sdr-qualificacao.html?raw';
import agendamento from './sdr-agendamento.html?raw';
import dashboard from './sdr-dashboard.html?raw';

/** O tamanho em que as telas foram desenhadas. A largura é a da LPA; a altura
 *  é a que cabe no slide de entrega abaixo do título e do resumo. */
const LARGURA = 1440;
const ALTURA = 660;

type Tela = 'dashboard' | 'leads' | 'conversas' | 'agenda';

/** Os ícones da barra lateral, no traço da casa: contorno, sem preenchimento. */
const traco = (d: string) =>
  `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES: Record<Tela | 'templates' | 'config' | 'marca' | 'sair', string> = {
  marca: traco('<path d="M12 3l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V7z"/><path d="M9 12l2 2 4-4"/>'),
  dashboard: traco('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  leads: traco('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>'),
  conversas: traco('<path d="M21 12a8 8 0 01-11.6 7.1L4 20.5l1.4-5A8 8 0 1121 12z"/><path d="M8.5 11h7M8.5 14h4.5"/>'),
  agenda: traco('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 3v3M16 3v3"/><path d="M8.5 14.5l2 2 4-4"/>'),
  templates: traco('<path d="M6 3h9l4 4v14H6z"/><path d="M14.5 3v4.5H19M9 12h7M9 15.5h7"/>'),
  config: traco('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>'),
  sair: traco('<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H4"/>'),
};

function barraLateral(ativa: Tela): string {
  const item = (t: Tela | 'templates' | 'config', titulo: string) =>
    `<button class="lado-item${t === ativa ? ' ativo' : ''}" title="${titulo}" aria-label="${titulo}">${ICONES[t]}</button>`;
  return `<nav class="lado">
    <div class="marca">${ICONES.marca}</div>
    ${item('dashboard', 'Dashboard')}
    ${item('leads', 'Prospecção')}
    ${item('conversas', 'Conversas')}
    ${item('agenda', 'Agenda')}
    ${item('templates', 'Templates')}
    <div class="lado-fim">${item('config', 'Configurações')}</div>
    <button class="lado-item" title="Sair" aria-label="Sair">${ICONES.sair}</button>
  </nav>`;
}

/** O documento inteiro de uma tela: a casca, o desenho comum e o miolo. */
function tela(titulo: string, ativa: Tela, miolo: string): Prototipo {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=${LARGURA}">
<title>${titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${base}</style>
</head><body>
<div class="app">
${barraLateral(ativa)}
${miolo}
</div>
</body></html>`;
  return { html, largura: LARGURA, altura: ALTURA, titulo };
}

export const PROTOTIPOS_SDR = {
  prospeccao: () => tela('SheepCrew · Prospecção ativa', 'leads', prospeccao),
  qualificacao: () => tela('SheepCrew · Qualificação', 'conversas', qualificacao),
  agendamento: () => tela('SheepCrew · Agendamento', 'agenda', agendamento),
  dashboard: () => tela('SheepCrew · Dashboard', 'dashboard', dashboard),
};
