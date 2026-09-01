// ─────────────────────────────────────────────────────────────────────────────
//  Exportação do diretório do projeto com as tarefas.
//
//  Quatro formatos, cada um para um uso diferente:
//
//    csv    planilha simples, para abrir em qualquer lugar
//    xlsx   planilha de verdade, com cabeçalho e larguras
//    md     contexto para uma IA ler e trabalhar em cima
//    pdf    documento para mandar a alguém, pela impressão do navegador
//
//  O que sai é sempre o mesmo recorte: o que está filtrado na tela. Exportar
//  tudo quando a pessoa acabou de filtrar seria desfazer o trabalho dela.
//
//  Sem dependência nova: o `.xlsx` é montado com a `fflate`, que já é usada
//  para os pacotes de proposta, e o PDF sai pela impressão, que é o mesmo
//  caminho do Gerador de Documentos.
// ─────────────────────────────────────────────────────────────────────────────
import { zipSync, strToU8 } from 'fflate';

export type Formato = 'csv' | 'xlsx' | 'md' | 'pdf';

/** Um comentário do card, já achatado: quem escreveu, quando e o quê. Sem
 *  menções nem anexos - o que vira documento é o texto. */
export interface ComentarioExport {
  autor: string;
  em: string;
  texto: string;
  /** Resposta dentro de uma conversa, e não um comentário de primeiro nível. */
  resposta: boolean;
}

export interface TarefaExport {
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string | null;
  responsavel_nome: string | null;
  prazo: string | null;
  etiquetas: string[];
  concluida_em: string | null;
  entrega_titulo: string | null;
  comentarios: ComentarioExport[];
}

export interface ProjetoExport {
  codigo: string | null;
  nome: string;
  cliente: string | null;
  descricao: string | null;
  status: string;
  prioridade: string | null;
  gestor: string | null;
  data_inicio: string | null;
  previsao_entrega: string | null;
  equipe: { nome: string; papel: string }[];
  entregas: { titulo: string; status: string; prazo: string | null; categoria: string | null }[];
  tarefas: TarefaExport[];
}

export interface Pacote {
  /** O que a pessoa vê no topo do arquivo: quando saiu e sob que recorte. */
  gerado_em: Date;
  filtro: string | null;
  projetos: ProjetoExport[];
}

const COLUNAS = [
  'Projeto', 'Código', 'Cliente', 'Entrega', 'Tarefa', 'Descrição',
  'Status', 'Prioridade', 'Responsável', 'Prazo', 'Etiquetas', 'Concluída em',
  'Comentários',
] as const;

const dia = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '');

/** A conversa inteira numa célula. Planilha não tem onde aninhar resposta,
 *  então cada comentário vira uma linha do texto, com o autor na frente e a
 *  resposta marcada com um recuo. */
const conversaEmTexto = (cs: ComentarioExport[] | undefined) =>
  (cs ?? []).map(c => `${c.resposta ? '> ' : ''}${c.autor} (${dia(c.em)}): ${c.texto}`)
    .join('\n');

/** Uma linha por tarefa, com o projeto repetido: é o formato que planilha e
 *  tabela dinâmica esperam. Projeto sem tarefa entra com a linha do projeto
 *  mesmo assim - senão ele sumiria da exportação. */
function linhas(pacote: Pacote): string[][] {
  const saida: string[][] = [];
  for (const p of pacote.projetos) {
    if (p.tarefas.length === 0) {
      saida.push([p.nome, p.codigo ?? '', p.cliente ?? '', '', '', '', p.status, p.prioridade ?? '', p.gestor ?? '', dia(p.previsao_entrega), '', '', '']);
      continue;
    }
    for (const t of p.tarefas) {
      saida.push([
        p.nome, p.codigo ?? '', p.cliente ?? '', t.entrega_titulo ?? '',
        t.titulo, t.descricao ?? '', t.status, t.prioridade ?? '',
        t.responsavel_nome ?? '', dia(t.prazo), (t.etiquetas ?? []).join('; '),
        dia(t.concluida_em), conversaEmTexto(t.comentarios),
      ]);
    }
  }
  return saida;
}

const nomeArquivo = (pacote: Pacote, ext: string) => {
  const d = pacote.gerado_em;
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = pacote.projetos.length === 1
    ? (pacote.projetos[0].codigo || pacote.projetos[0].nome)
    : 'Projetos';
  return `${base.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_')}_Tarefas_${data}.${ext}`;
};

function baixar(conteudo: BlobPart, nome: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  // Solta a memória depois que o navegador pegou o arquivo.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** Aspas dobradas e campo entre aspas sempre que houver separador, aspa ou
 *  quebra de linha - é o que o RFC 4180 pede e o que o Excel entende. */
const celulaCsv = (v: string) =>
  /[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

function exportarCsv(pacote: Pacote) {
  const corpo = [COLUNAS as unknown as string[], ...linhas(pacote)]
    // Ponto e vírgula: o Excel em português usa vírgula como decimal, e com
    // separador vírgula ele joga a linha inteira numa célula só.
    .map(l => l.map(celulaCsv).join(';'))
    .join('\r\n');
  // BOM: sem ele o Excel abre o arquivo em Latin-1 e todo acento vira ruído.
  baixar('﻿' + corpo, nomeArquivo(pacote, 'csv'), 'text/csv;charset=utf-8');
}

// ── XLSX ────────────────────────────────────────────────────────────────────

const escXml = (v: string) => v
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  // Caractere de controle quebra o arquivo inteiro no Excel, sem dizer onde.
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const coluna = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
};

/** Um `.xlsx` é um ZIP de XML. Escrevemos o mínimo que o Excel aceita, com o
 *  texto em `inlineStr` para dispensar a tabela de strings compartilhadas -
 *  ela economiza espaço numa planilha grande e custa um arquivo a mais aqui. */
function exportarXlsx(pacote: Pacote) {
  const dados = [COLUNAS as unknown as string[], ...linhas(pacote)];
  const linhasXml = dados.map((linha, y) => {
    const celulas = linha.map((v, x) =>
      `<c r="${coluna(x)}${y + 1}" t="inlineStr"${y === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escXml(v)}</t></is></c>`,
    ).join('');
    return `<row r="${y + 1}">${celulas}</row>`;
  }).join('');

  // Larguras pensadas para a leitura, não para o conteúdo: título e descrição
  // largos, datas estreitas.
  const larguras = [26, 12, 18, 24, 40, 52, 15, 12, 20, 12, 24, 14, 60];
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${cols}</cols>
<sheetData>${linhasXml}</sheetData>
</worksheet>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Tarefas" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  // Dois estilos: o padrão e o do cabeçalho, em negrito sobre cinza.
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F0EE"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;

  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    'xl/workbook.xml': strToU8(workbook),
    'xl/styles.xml': strToU8(styles),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  };

  baixar(zipSync(arquivos, { level: 6 }), nomeArquivo(pacote, 'xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ── Markdown ────────────────────────────────────────────────────────────────

/** O formato pensado para uma IA ler: o projeto inteiro em prosa estruturada,
 *  com as tarefas agrupadas pela entrega a que pertencem. Cabeçalho, contexto
 *  e trabalho, na ordem em que alguém precisaria deles para começar. */
function markdown(pacote: Pacote): string {
  const L: string[] = [];
  const d = pacote.gerado_em;
  L.push('# Diretório de projetos e tarefas', '');
  L.push(`Exportado em ${d.toLocaleString('pt-BR')}.`);
  if (pacote.filtro) L.push(`Recorte aplicado: ${pacote.filtro}.`);
  L.push('');

  for (const p of pacote.projetos) {
    L.push('---', '');
    L.push(`## ${p.codigo ? `${p.codigo} - ` : ''}${p.nome}`, '');
    const ficha: [string, string][] = [
      ['Cliente', p.cliente ?? 'sem cliente'],
      ['Status', p.status],
      ['Prioridade', p.prioridade ?? '-'],
      ['Gestor', p.gestor ?? 'sem gestor'],
      ['Início', dia(p.data_inicio) || '-'],
      ['Fim previsto', dia(p.previsao_entrega) || '-'],
    ];
    for (const [k, v] of ficha) L.push(`- **${k}:** ${v}`);
    L.push('');

    if (p.descricao) L.push('### Sobre o projeto', '', p.descricao, '');

    if (p.equipe.length) {
      L.push('### Equipe', '');
      for (const m of p.equipe) L.push(`- ${m.nome} - ${m.papel}`);
      L.push('');
    }

    if (p.entregas.length) {
      L.push('### Entregas', '');
      L.push('| Entrega | Situação | Prazo | Categoria |');
      L.push('| --- | --- | --- | --- |');
      for (const e of p.entregas) {
        L.push(`| ${e.titulo} | ${e.status} | ${dia(e.prazo) || '-'} | ${e.categoria ?? '-'} |`);
      }
      L.push('');
    }

    L.push(`### Tarefas (${p.tarefas.length})`, '');
    if (p.tarefas.length === 0) {
      L.push('_Nenhuma tarefa no recorte exportado._', '');
      continue;
    }
    // Agrupadas pela entrega: é assim que o trabalho se organiza, e é o
    // contexto que falta quando a lista vem achatada.
    const porEntrega = new Map<string, TarefaExport[]>();
    for (const t of p.tarefas) {
      const k = t.entrega_titulo ?? 'Sem entrega';
      const lista = porEntrega.get(k);
      if (lista) lista.push(t); else porEntrega.set(k, [t]);
    }
    for (const [entrega, tarefas] of porEntrega) {
      L.push(`#### ${entrega}`, '');
      for (const t of tarefas) {
        const feita = !!t.concluida_em;
        L.push(`- [${feita ? 'x' : ' '}] **${t.titulo}**`);
        const meta = [
          `status: ${t.status}`,
          t.prioridade ? `prioridade: ${t.prioridade}` : null,
          t.responsavel_nome ? `responsável: ${t.responsavel_nome}` : null,
          dia(t.prazo) ? `prazo: ${dia(t.prazo)}` : null,
          t.etiquetas?.length ? `etiquetas: ${t.etiquetas.join(', ')}` : null,
          feita ? `concluída em ${dia(t.concluida_em)}` : null,
        ].filter(Boolean).join(' · ');
        L.push(`  - ${meta}`);
        if (t.descricao?.trim()) {
          // A descrição indentada continua dentro do item da lista, e a quebra
          // preservada mantém o texto legível como o autor escreveu.
          L.push(...t.descricao.trim().split('\n').map(x => `  > ${x}`));
        }
        // A conversa entra depois da descrição, na ordem em que aconteceu: é
        // onde costuma estar a decisão que o título não conta.
        if (t.comentarios?.length) {
          L.push(`  - Comentários (${t.comentarios.length}):`);
          for (const c of t.comentarios) {
            L.push(`    - **${c.autor}**${c.resposta ? ' (resposta)' : ''} - ${dia(c.em)}`);
            L.push(...c.texto.trim().split('\n').map(x => `      ${x}`));
          }
        }
      }
      L.push('');
    }
  }
  return L.join('\n');
}

function exportarMd(pacote: Pacote) {
  baixar(markdown(pacote), nomeArquivo(pacote, 'md'), 'text/markdown;charset=utf-8');
}

// ── PDF ─────────────────────────────────────────────────────────────────────

const escHtml = (v: string) => v
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pela impressão do navegador, como o Gerador de Documentos já faz: sem
 *  biblioteca de PDF no pacote, e o resultado sai com as fontes e o texto
 *  selecionáveis. Quem salva é a pessoa, na caixa de impressão. */
function exportarPdf(pacote: Pacote) {
  const d = pacote.gerado_em;
  const partes: string[] = [];
  partes.push(`<h1>Diretório de projetos e tarefas</h1>`);
  partes.push(`<p class="sub">Exportado em ${escHtml(d.toLocaleString('pt-BR'))}`
    + (pacote.filtro ? ` · Recorte: ${escHtml(pacote.filtro)}` : '') + '</p>');

  for (const p of pacote.projetos) {
    partes.push(`<section><h2>${escHtml(p.codigo ? `${p.codigo} - ` : '')}${escHtml(p.nome)}</h2>`);
    partes.push('<p class="ficha">'
      + [
        `<b>Cliente</b> ${escHtml(p.cliente ?? '-')}`,
        `<b>Status</b> ${escHtml(p.status)}`,
        `<b>Gestor</b> ${escHtml(p.gestor ?? '-')}`,
        `<b>Fim previsto</b> ${escHtml(dia(p.previsao_entrega) || '-')}`,
      ].join(' &nbsp;·&nbsp; ') + '</p>');
    if (p.descricao) partes.push(`<p class="desc">${escHtml(p.descricao)}</p>`);

    partes.push('<table><thead><tr>'
      + ['Tarefa', 'Entrega', 'Status', 'Prioridade', 'Responsável', 'Prazo', 'Etiquetas']
        .map(h => `<th>${h}</th>`).join('')
      + '</tr></thead><tbody>');
    for (const t of p.tarefas) {
      // Descrição e conversa vão embaixo do título, na mesma célula: em coluna
      // própria elas espremeriam o resto da linha até ficar ilegível.
      const abaixo: string[] = [];
      if (t.descricao?.trim()) {
        abaixo.push(`<div class="t-desc">${escHtml(t.descricao.trim())}</div>`);
      }
      if (t.comentarios?.length) {
        abaixo.push('<div class="t-conversa">'
          + t.comentarios.map(c =>
            `<p><b>${escHtml(c.autor)}</b>${c.resposta ? ' <i>(resposta)</i>' : ''}`
            + ` <span class="t-quando">${escHtml(dia(c.em))}</span><br>`
            + `${escHtml(c.texto.trim())}</p>`).join('')
          + '</div>');
      }
      partes.push('<tr>'
        + `<td><b>${escHtml(t.titulo)}</b>${abaixo.join('')}</td>`
        + `<td>${escHtml(t.entrega_titulo ?? '-')}</td>`
        + `<td>${escHtml(t.status)}</td>`
        + `<td>${escHtml(t.prioridade ?? '-')}</td>`
        + `<td>${escHtml(t.responsavel_nome ?? '-')}</td>`
        + `<td>${escHtml(dia(t.prazo) || '-')}</td>`
        + `<td>${escHtml((t.etiquetas ?? []).join(', ') || '-')}</td>`
        + '</tr>');
    }
    if (p.tarefas.length === 0) partes.push('<tr><td colspan="7" class="vazio">Nenhuma tarefa no recorte.</td></tr>');
    partes.push('</tbody></table></section>');
  }

  const quadro = document.createElement('iframe');
  quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(quadro);
  const doc = quadro.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${escHtml(nomeArquivo(pacote, 'pdf').replace(/\.pdf$/, ''))}</title><style>
@page { size: A4; margin: 16mm 14mm; }
* { box-sizing: border-box; }
body { margin:0; font-family: Calibri, 'Segoe UI', system-ui, sans-serif; color:#000; font-size:10.5pt; }
h1 { font-size:17pt; margin:0 0 2mm; }
.sub { margin:0 0 8mm; font-size:8pt; color:#8A8A8A; }
section { break-inside:auto; margin-bottom:9mm; }
h2 { font-size:12pt; margin:0 0 2mm; padding-bottom:1.5mm; border-bottom:2px solid #000; }
.ficha { margin:0 0 2mm; font-size:8.5pt; color:#5F5F5F; }
.ficha b { font-weight:700; color:#000; }
.desc { margin:0 0 3mm; font-size:9pt; color:#6E6E6E; }
table { width:100%; border-collapse:collapse; font-size:8.5pt; }
th { text-align:left; font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase;
     color:#6E6E6E; padding:1.5mm 2mm; border-bottom:1px solid #000; }
td { padding:1.5mm 2mm; border-bottom:1px solid #C8C8C8; vertical-align:top; }
.vazio { color:#A8A8A8; }
.t-desc { margin-top:1mm; font-size:8pt; color:#5F5F5F; white-space:pre-wrap; }
.t-conversa { margin-top:1.5mm; padding-left:2mm; border-left:2px solid #C8C8C8; }
.t-conversa p { margin:0 0 1.2mm; font-size:8pt; color:#3F3F3F; white-space:pre-wrap; }
.t-quando { color:#8A8A8A; font-size:7.5pt; }
/* Linha não parte no meio da quebra de página. */
tr, section > h2 { break-inside:avoid; page-break-inside:avoid; }
thead { display:table-header-group; }
</style></head><body>${partes.join('')}</body></html>`);
  doc.close();
  quadro.contentWindow?.focus();
  // Um respiro para o layout assentar antes de a caixa de impressão medir.
  setTimeout(() => {
    quadro.contentWindow?.print();
    setTimeout(() => quadro.remove(), 60_000);
  }, 250);
}

// ── Porta de entrada ────────────────────────────────────────────────────────

export function exportar(formato: Formato, pacote: Pacote) {
  if (formato === 'csv') return exportarCsv(pacote);
  if (formato === 'xlsx') return exportarXlsx(pacote);
  if (formato === 'md') return exportarMd(pacote);
  return exportarPdf(pacote);
}

/** Exposto para teste: o markdown é o formato que mais depende do texto estar
 *  certo, e é o único que dá para conferir sem abrir um programa. */
export const _markdown = markdown;
