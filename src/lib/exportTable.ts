// ─────────────────────────────────────────────────────────────────────────────
//  Exportação de tabelas (Relatórios › Veículos) - PDF e Excel/planilha (CSV).
//
//  - PDF: abre uma janela com HTML estilizado + auto-print (o usuário salva como
//    PDF). Mesmo padrão do relatório DEPS já usado no sistema.
//  - Excel/planilha: gera um CSV com BOM UTF-8 e separador ';' (pt-BR), que o
//    Excel e o Google Sheets abrem com as colunas já separadas. Números saem com
//    vírgula decimal para serem lidos como número.
// ─────────────────────────────────────────────────────────────────────────────

export type ExportColType = 'text' | 'number' | 'currency' | 'percent';

export interface ExportColumn {
  header: string;
  type?: ExportColType; // default: 'text'
}

export interface ExportData {
  title: string;            // título exibido no PDF
  filename: string;         // nome base do arquivo (sem extensão)
  columns: ExportColumn[];
  rows: (string | number)[][];
}

function fmtNumberBR(n: number): string {
  return n.toLocaleString('pt-BR');
}
function fmtCurrencyBR(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPercentBR(n: number): string {
  return n.toFixed(2).replace('.', ',') + '%';
}

// Valor para exibição (PDF)
function displayValue(v: string | number, type: ExportColType): string {
  if (type === 'text') return String(v ?? '');
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  if (!isFinite(n)) return String(v ?? '');
  if (type === 'currency') return fmtCurrencyBR(n);
  if (type === 'percent') return fmtPercentBR(n);
  return fmtNumberBR(n);
}

// Valor para o CSV (número cru com vírgula decimal p/ Excel pt-BR)
function csvValue(v: string | number, type: ExportColType): string {
  if (type === 'text') return String(v ?? '');
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!isFinite(n)) return String(v ?? '');
  // número/moeda/percentual → valor numérico com vírgula decimal, sem R$/%
  return String(n).replace('.', ',');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function csvEscape(s: string): string {
  // Envolve em aspas se contiver ; aspas ou quebra de linha
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function timestamp(): string {
  return new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Excel / planilha (.csv) ──────────────────────────────────────────────────
export function exportToCSV(data: ExportData): void {
  const sep = ';';
  const headerLine = data.columns.map(c => csvEscape(c.header)).join(sep);
  const bodyLines = data.rows.map(row =>
    row.map((cell, i) => csvEscape(csvValue(cell, data.columns[i]?.type ?? 'text'))).join(sep),
  );
  const csv = '﻿' + [headerLine, ...bodyLines].join('\r\n'); // BOM p/ acentuação no Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── PDF (via janela de impressão) ────────────────────────────────────────────
export function exportToPDF(data: ExportData): boolean {
  const w = window.open('', '_blank');
  if (!w) return false; // pop-up bloqueado - quem chama trata o aviso

  const align = (t: ExportColType) => (t === 'text' ? 'left' : t === 'currency' || t === 'number' || t === 'percent' ? 'right' : 'left');
  const thead = data.columns.map(c => `<th style="text-align:${align(c.type ?? 'text')}">${escapeHtml(c.header)}</th>`).join('');
  const tbody = data.rows.map(row =>
    '<tr>' + row.map((cell, i) => {
      const t = data.columns[i]?.type ?? 'text';
      return `<td style="text-align:${align(t)}${t !== 'text' ? ';font-variant-numeric:tabular-nums' : ''}">${escapeHtml(displayValue(cell, t))}</td>`;
    }).join('') + '</tr>',
  ).join('');

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escapeHtml(data.filename)}</title>
<style>
  :root{--y:#A9E03E;--k:#121316;--g:#6B7280;--l:#E3E4DE;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,Segoe UI,Roboto,Manrope,sans-serif;color:var(--k);background:#fff;padding:28px;line-height:1.4}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .head .logo{width:38px;height:38px;border-radius:10px;background:var(--y);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#fff}
  h1{font-size:18px;font-weight:800}
  .meta{font-size:12px;color:var(--g);margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  thead th{background:#F4F5F1;text-align:left;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--g);border-bottom:2px solid var(--l);font-weight:800}
  tbody td{padding:7px 10px;border-bottom:1px solid #F1F2ED}
  tbody tr:nth-child(even){background:#FAFAF8}
  .foot{margin-top:16px;font-size:10.5px;color:var(--g)}
  @media print{body{padding:0}@page{margin:14mm}}
</style></head>
<body>
  <div class="head"><div class="logo">D</div><h1>${escapeHtml(data.title)}</h1></div>
  <div class="meta">${data.rows.length.toLocaleString('pt-BR')} registro(s) · gerado em ${escapeHtml(timestamp())}</div>
  <table><thead><tr>${thead}</tr></thead><tbody>${tbody || '<tr><td>Sem dados.</td></tr>'}</tbody></table>
  <div class="foot">DUX Factoring · Relatórios › Veículos</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
</body></html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();
  return true;
}
