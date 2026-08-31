// Geração do Relatório DEPS (HTML autocontido para abrir em nova aba → visualizar / salvar PDF).
// Extraído de AnaliseCreditoPage para poder ser reaproveitado no drawer do lead
// (link para a análise DEPS salva de cedente/sacado) e no anexo do parecer.

export function escHtml(s: any): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function fmtDoc(doc: string): string {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return d;
}

// Link do relatório no portal da DEPS (consulta compartilhada: público, sem
// login). Vem no payload BRUTO da consulta como `linkCompartilhamento` - é o
// relatório oficial, completo e interativo. Consultas gravadas antes da coluna
// raw_json não têm o link; nesse caso cai no relatório resumido daqui.
export function depsPortalLink(raw: any): string | null {
  const link = raw?.mix?.linkCompartilhamento ?? raw?.linkCompartilhamento;
  return typeof link === 'string' && link.startsWith('http') ? link : null;
}

// Data da consulta DEPS → DD/MM/AAAA [HH:mm]. O formato de origem varia
// (ISO, ISO+hora ou já dd/mm/aaaa hh:mm) - trata os casos comuns.
export function fmtDataConsulta(v: any): string {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;                       // já dd/mm/aaaa (com/sem hora)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); // ISO com/sem hora
  if (m) return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}`;
  return s;
}

// Data da consulta a partir do payload BRUTO da DEPS.
export function depsDataConsulta(raw: any): string {
  return fmtDataConsulta(raw?.mix?.dataConsulta ?? raw?.dataConsulta);
}

export interface DepsReportRow { label: string; value: string }

// Linhas do relatório - fonte única para o HTML autocontido e para o anexo do
// parecer (React), de modo que as duas saídas nunca divirjam em campo ou ordem.
export function depsCreditoRows(d: Record<string, string> | undefined): DepsReportRow[] {
  const dd = d ?? {};
  return ([
    ['Score', dd.score],
    ['Classificação', dd.class],
    ['Limite sugerido', dd['limite-deps'] ? 'R$ ' + dd['limite-deps'] : ''],
    ['Faturamento presumido', dd['fat-presumido'] ? 'R$ ' + dd['fat-presumido'] : ''],
    ['Pontualidade 12m', dd.pont12 ? dd.pont12 + '%' : ''],
    ['Pontualidade 3m', dd.pont3 ? dd.pont3 + '%' : ''],
    ['Protestos (qtd)', dd.protestos],
    ['Protestos (R$)', dd['protestos-val'] ? 'R$ ' + dd['protestos-val'] : ''],
    ['Pendências / restrições', dd.pendencias],
    ['Ações judiciais (qtd)', dd['acoes-qtd']],
    ['Ações judiciais (R$)', dd['acoes-val'] ? 'R$ ' + dd['acoes-val'] : ''],
  ] as [string, string | undefined][])
    .filter(([, v]) => !!(v && String(v).trim()))
    .map(([label, value]) => ({ label, value: String(value) }));
}

export function depsCadastroRows(emp: Record<string, string> | undefined): DepsReportRow[] {
  const e = emp ?? {};
  return ([
    ['Razão social / Nome', e.razao],
    ['CNPJ / CPF', e.cnpj ? fmtDoc(e.cnpj) : ''],
    ['Situação cadastral', e.situacao],
    ['CNAE principal', e.cnae],
    ['Capital social', e.capital ? 'R$ ' + e.capital : ''],
    ['Fundação', e.fundacao],
    ['Porte', e.porte],
    ['Funcionários', e.func],
    ['Filiais', e.filiais],
    ['Endereço', e.endereco],
  ] as [string, string | undefined][])
    .filter(([, v]) => !!(v && String(v).trim()))
    .map(([label, value]) => ({ label, value: String(value) }));
}

// Shape mínimo necessário para gerar o relatório (compatível com o DepsEntry da análise
// e com o que fica salvo no snapshot: apenas `norm` é obrigatório).
export interface DepsReportData {
  norm: { deps: Record<string, string>; empresa: Record<string, string>; resumo?: string };
  documento?: string;
  produto?: string;
  nome?: string;
  reutilizou?: boolean;
  linkPortal?: string | null;   // relatório oficial no portal da DEPS
  dataConsulta?: string;        // data da consulta na DEPS (já formatada)
}

// Ícones do relatório impresso. O HTML é autocontido (abre em outra aba), então
// aqui o SVG vai inline em vez de vir de components/icons.tsx - mesmo desenho,
// mesma espessura de traço. Regra do sistema: nenhum emoji na UI - ver CLAUDE.md.
function repIco(paths: string, size = 14): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" `
    + `style="vertical-align:-.15em;flex-shrink:0" aria-hidden="true">${paths}</svg>`;
}
const ICO_PRINTER = repIco('<path d="M6.5 9.5V3.5h11v6"/><path d="M6.5 18.5H5a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V16.5a2 2 0 0 1-2 2h-1.5"/><rect x="6.5" y="14.5" width="11" height="6" rx="1"/>');
const ICO_EXTERNAL = repIco('<path d="M14 3.5h6.5V10"/><path d="M20.5 3.5L12 12"/><path d="M18 14v5.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5.5"/>', 13);
const ICO_CHART = repIco('<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12.5" y="7" width="3" height="10"/><path d="M18 13v4"/>', 22);

export function buildDepsReportHTML(alvo: 'ced' | 'sac', e: DepsReportData, autoPrint = false): string {
  const papel = alvo === 'ced' ? 'Cedente' : 'Sacado';
  const emitido = new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const reutilizou = !!e.reutilizou;
  const tr = (r: DepsReportRow) => `<tr><th>${escHtml(r.label)}</th><td>${escHtml(r.value)}</td></tr>`;
  const secCredito = depsCreditoRows(e.norm?.deps).map(tr).join('');
  const secCad = depsCadastroRows(e.norm?.empresa).map(tr).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório DEPS - ${escHtml(papel)}${e.nome ? ' · ' + escHtml(e.nome) : ''}</title>
<style>
  :root{--y:#00C9A7;--k:#121316;--g:#6B7280;--l:#E3E4DE;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Manrope,sans-serif;color:var(--k);background:#F4F5F1;padding:32px;line-height:1.5}
  .sheet{max-width:760px;margin:0 auto;background:#fff;border:1px solid var(--l);border-radius:14px;overflow:hidden}
  .head{background:var(--k);color:#fff;padding:24px 30px;display:flex;align-items:center;gap:14px}
  .head .logo{width:44px;height:44px;border-radius:11px;background:var(--y);color:var(--k);display:flex;align-items:center;justify-content:center}
  .head h1{font-size:19px;font-weight:800}
  .head .sub{font-size:12.5px;color:#B9BBC2;margin-top:2px}
  .meta{display:flex;flex-wrap:wrap;gap:18px;padding:16px 30px;border-bottom:1px solid var(--l);font-size:12.5px;color:var(--g)}
  .meta b{color:var(--k)}
  .badge{display:inline-block;background:${reutilizou ? '#EEF2FF' : '#ECFDF5'};color:${reutilizou ? '#3730A3' : '#065F46'};border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700}
  section{padding:22px 30px}
  section+section{border-top:1px solid var(--l)}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--g);margin-bottom:12px;font-weight:800}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:left;color:var(--g);font-weight:600;width:230px;padding:7px 0;vertical-align:top}
  td{padding:7px 0;font-weight:700}
  tr+tr th,tr+tr td{border-top:1px solid #F1F2ED}
  .empty{color:var(--g);font-size:13px;font-style:italic}
  .oficial{font-size:12.5px;color:var(--g);word-break:break-all}
  .oficial a{color:#1B2A4E;font-weight:700}
  .foot{padding:16px 30px;border-top:1px solid var(--l);font-size:11px;color:var(--g)}
  .bar{position:sticky;top:0;display:flex;justify-content:flex-end;gap:8px;max-width:760px;margin:0 auto 14px}
  .bar button,.bar a{font-family:inherit;font-size:13px;font-weight:700;border:none;border-radius:9px;padding:9px 16px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:7px}
  .bar .p{background:var(--k);color:var(--y)}
  .bar .s{background:#fff;border:1px solid var(--l);color:var(--k)}
  @media print{body{background:#fff;padding:0}.bar{display:none}.sheet{border:none;border-radius:0;max-width:none}}
</style></head><body>
  <div class="bar">
    <button class="s" onclick="window.close()">Fechar</button>
    ${e.linkPortal ? `<a class="s" href="${escHtml(e.linkPortal)}" target="_blank" rel="noopener">${ICO_EXTERNAL} Relatório oficial DEPS</a>` : ''}
    <button class="p" onclick="window.print()">${ICO_PRINTER} Salvar PDF</button>
  </div>
  <div class="sheet">
    <div class="head"><div class="logo">${ICO_CHART}</div><div><h1>Relatório de Crédito - DEPS</h1><div class="sub">${escHtml(papel)} · DUX Factoring</div></div></div>
    <div class="meta">
      <div><b>${escHtml(e.nome || '-')}</b></div>
      <div>Documento: <b>${escHtml(e.documento ? fmtDoc(e.documento) : '-')}</b></div>
      ${e.produto ? `<div>Produto: <b>${escHtml(e.produto)}</b></div>` : ''}
      ${e.dataConsulta ? `<div>Consulta DEPS: <b>${escHtml(e.dataConsulta)}</b></div>` : ''}
      <div>Emitido em <b>${escHtml(emitido)}</b></div>
    </div>
    <section><h2>Crédito &amp; Restritivos</h2>${secCredito ? `<table>${secCredito}</table>` : '<div class="empty">Sem dados de crédito retornados.</div>'}</section>
    <section><h2>Dados Cadastrais</h2>${secCad ? `<table>${secCad}</table>` : '<div class="empty">Sem dados cadastrais retornados.</div>'}</section>
    ${e.linkPortal ? `<section><h2>Relatório oficial DEPS</h2><div class="oficial">Versão completa e interativa no portal da DEPS:<br><a href="${escHtml(e.linkPortal)}" target="_blank" rel="noopener">${escHtml(e.linkPortal)}</a></div></section>` : ''}
    <div class="foot">Relatório gerado pela plataforma DUX a partir da consulta DEPS. Dados de bureau - uso restrito à análise de crédito.</div>
  </div>
  ${autoPrint ? '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' : ''}
</body></html>`;
}
