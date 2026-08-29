// ─────────────────────────────────────────────────────────────────────────────
//  PDF do Simulador de Taxas - reprodução fiel do documento "SIMULAÇÃO DE
//  ANTECIPAÇÃO DE RECEBÍVEIS" que sai dos templates do Gerador de Documentos
//  (api/_templates/simulacao-avista-dux.docx e simulacao-parcelada-dux.docx).
//
//  Caminho de saída: mesmo padrão do relatório DEPS e da exportação de
//  Relatórios (src/lib/exportTable.ts) - abre uma janela com HTML autocontido e
//  dispara a impressão, e o usuário salva como PDF. Fica no front porque todos
//  os números já foram calculados na tela; não há motivo para ir ao servidor.
//
//  As medidas vêm do XML dos templates, para o papel sair igual ao DOCX:
//  A4 com margem de 2cm no topo e 2,5cm nos lados e no pé; faixa preta de 2cm
//  de altura colada na borda de cima; corpo em Calibri 12pt com entrelinha 1,5;
//  título 14pt; réguas do quadro de dados em 1,5pt; tabela em 10pt; rodapé 8pt
//  em #999999.
//
//  Três escolhas de implementação valem registro:
//
//  - A faixa é uma imagem (`/faixa-dux.png`), não um `background`. O Chrome
//    imprime imagem sempre, mas só imprime fundo quando o usuário marca
//    "Gráficos de plano de fundo" - que vem desmarcado. Borda e cor de texto
//    também saem sempre, então o resto do documento não depende do ajuste.
//  - A faixa vai de borda a borda, e na impressão o conteúdo é recortado na
//    caixa da página: margem negativa não sangra. Daí `@page` ficar sem margem
//    lateral (os 2,5cm entram como `padding` do conteúdo, o que vale para todas
//    as páginas) e `@page :first` zerar a margem de cima, para a faixa encostar
//    no topo da primeira página - as demais mantêm os 2cm.
//  - As cores saem em hex literal, fora dos tokens de `main.css`. É documento
//    de papel: sempre claro, sem tema escuro, com a identidade da papelaria da
//    DUX. Mesmo critério já adotado em `exportTable.ts`.
//
//  Nada de texto livre entra no documento - todo valor interpolado vem de
//  número ou de data ISO -, por isso não há escape de HTML aqui.
// ─────────────────────────────────────────────────────────────────────────────
import { isoParaBr } from './gerador';
import {
  fmtPct, fmtPctAuto, fmtIntervalo, fmtDataCurta,
  type ResultadoSimulacao,
} from './simuladorTaxas';

export interface DadosSimulacaoPdf {
  tipo: 'avista' | 'parcelado';
  /** Valor de face do documento, como digitado no campo "Valor (R$)" */
  valorTotal: number;
  /** ISO yyyy-mm-dd */
  dataEmissao: string;
  /** ISO yyyy-mm-dd */
  dataAntecipacao: string;
  resultado: ResultadoSimulacao;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * "R$ 1.234,56" - cópia da `fmtMoeda` de `api/_docx.ts`, e não a de
 * `simuladorTaxas.ts`, para o PDF sair caractere a caractere igual ao DOCX
 * (a versão da tela usa `toLocaleString`, que separa o "R$" com espaço
 * inquebrável e depende do locale do navegador).
 */
function fmtMoeda(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** ISO → "27 de agosto de 2026" */
function fmtDataExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// ── Blocos do documento ──────────────────────────────────────────────────────

/** Quadro de dados do topo: uma linha por campo, entre as duas réguas grossas. */
function quadro(linhas: [string, string][]): string {
  const ps = linhas.map(([rotulo, valor]) => `<p><strong>${rotulo}</strong> ${valor}</p>`).join('');
  return `<div class="quadro">${ps}</div>`;
}

/** Célula em formato contábil: "R$" encostado à esquerda, número à direita. */
function celMoeda(v: number): string {
  const texto = fmtMoeda(v);
  const i = texto.indexOf(' ');
  return `<td class="num"><span class="m">${texto.slice(0, i)}</span>${texto.slice(i + 1)}</td>`;
}

/** Tabela de cálculo da versão parcelada - porte de `tabelaXml` do `_docx.ts`. */
function tabela(r: ResultadoSimulacao, dataAntecipacao: string): string {
  // larguras do template, em twips: 900 1500 1900 900 800 1400 1675 (total 9075)
  const cols = [9.92, 16.53, 20.94, 9.92, 8.82, 15.43, 18.46]
    .map(p => `<col style="width:${p}%">`).join('');

  const linhas = r.parcelas.map(p => `<tr>
        <td class="c">${p.n}</td>
        ${celMoeda(p.valor)}
        <td class="c">${fmtIntervalo(dataAntecipacao, p.vencimento)}</td>
        <td class="c">${p.dias} dias</td>
        <td class="c">${fmtPct(p.taxa * 100, 2)}</td>
        ${celMoeda(p.juros)}
        ${celMoeda(p.liquido)}
      </tr>`).join('');

  return `<table class="tab">
      <colgroup>${cols}</colgroup>
      <thead>
        <tr>
          <th>Parc.</th><th>Valor</th><th>Intervalo</th><th>Duração</th>
          <th>Taxa</th><th>Juros</th><th>Valor Líquido</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td></td>${celMoeda(r.totalBruto)}<td></td><td></td><td></td><td></td>${celMoeda(r.totalLiquido)}
        </tr>
      </tfoot>
    </table>`;
}

/** Corpo da simulação à vista - a sequência de parágrafos do template. */
function corpoAvista(d: DadosSimulacaoPdf): string {
  const r = d.resultado;
  const p = r.parcelas[0];
  const taxaPeriodoPct = r.taxaDiariaPct * p.dias;
  const adiantamento = Math.abs(p.valor - d.valorTotal) < 0.01 ? 'adiantamento total' : 'adiantamento parcial';

  return `
      ${quadro([
        ['Valor Total da NF:', fmtMoeda(d.valorTotal)],
        ['Data de Emissão:', isoParaBr(d.dataEmissao)],
        ['Data de Vencimento:', isoParaBr(p.vencimento)],
      ])}

      <p class="secao"><strong>CONDIÇÕES DA OPERAÇÃO</strong></p>

      <div class="cond">
        <p><strong>Valor a ser antecipado:</strong> ${fmtMoeda(p.valor)} (${adiantamento})</p>
        <p><strong>Taxa de desconto:</strong> ${fmtPctAuto(r.taxaMensalPct)} ao mês, aplicada proporcionalmente para o período de ${p.dias} dias</p>
        <p><strong>Período de antecipação:</strong> de ${isoParaBr(d.dataAntecipacao)} a ${isoParaBr(p.vencimento)}</p>
      </div>

      <p class="calc">Cálculo do valor a ser antecipado:</p>

      <p class="rotulo"><strong>Juros proporcionais aplicados:</strong></p>
      <ul>
        <li>Taxa diária de ${fmtPct(r.taxaDiariaPct, 4)} ao dia (<em>taxa de desconto ÷ 30 dias</em>)</li>
        <li>Período de ${p.dias} dias</li>
        <li><strong>Juros totais:</strong> ${fmtMoeda(p.valor)} × ${fmtPct(taxaPeriodoPct, 4)} (<em>taxa diária × período</em>) = ${fmtMoeda(p.juros)}</li>
      </ul>

      <p class="rotulo"><strong>Valor líquido a ser antecipado:</strong></p>
      <ul>
        <li><strong>Valor antecipado:</strong> ${fmtMoeda(p.valor)} - ${fmtMoeda(p.juros)} = ${fmtMoeda(p.liquido)}</li>
      </ul>`;
}

/** Corpo da simulação parcelada - a sequência de parágrafos do template. */
function corpoParcelado(d: DadosSimulacaoPdf): string {
  const r = d.resultado;
  const datasVenc = r.parcelas.map(p => fmtDataCurta(p.vencimento)).join(', ');
  const itens = r.parcelas
    .map(p => `<p class="parcela">- ${p.n}ª Parcela: ${fmtMoeda(p.valor)} com vencimento em ${fmtDataCurta(p.vencimento)}</p>`)
    .join('');

  return `
      ${quadro([
        ['Valor Total da NF:', fmtMoeda(d.valorTotal)],
        ['Data de Emissão:', isoParaBr(d.dataEmissao)],
        ['Datas de Vencimento:', datasVenc],
      ])}

      <p class="secao"><strong>CONDIÇÕES DA OPERAÇÃO</strong></p>

      <p><strong>Valor a ser antecipado:</strong> ${fmtMoeda(r.totalBruto)}</p>
      ${itens}

      <p class="rotulo"><strong>Taxa de Desconto</strong></p>
      <p><strong>Taxa de desconto mensal:</strong> ${fmtPctAuto(r.taxaMensalPct)} ao mês</p>
      <p><strong>Taxa diária:</strong> ${fmtPct(r.taxaDiariaPct, 4)} ao dia</p>

      <p class="rotulo"><strong>Cálculo do valor a ser antecipado</strong></p>
      ${tabela(r, d.dataAntecipacao)}`;
}

// ── Documento ────────────────────────────────────────────────────────────────

function documentoHtml(d: DadosSimulacaoPdf, origem: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
  const titulo = `Simulação de Antecipação de Recebíveis - ${isoParaBr(hoje).replace(/\//g, '-')}`;
  const corpo = d.tipo === 'avista' ? corpoAvista(d) : corpoParcelado(d);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${titulo}</title>
<style>
  /* Margem lateral fica no padding do conteúdo, para a faixa poder ir de borda
     a borda; :first zera o topo da página 1, onde a faixa entra. A margem de
     baixo é 1,27cm porque o rodapé é conteúdo aqui, e no template ele fica na
     margem inferior, a 1,27cm da borda (w:footer="720"). */
  @page { size: A4; margin: 20mm 0 12.7mm; }
  @page :first { margin-top: 0; }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #fff; }
  /* O template usa entrelinha "1,5 linha", que no Word é 1,5x a altura natural
     da fonte, e não 1,5x o corpo: em Calibri 12pt dá 22pt, não 18pt. Por isso a
     entrelinha vai em pontos, para o papel bater linha a linha com o DOCX. */
  body {
    background: #fff;
    color: #000;
    font-family: Calibri, Carlito, 'Segoe UI', Arial, sans-serif;
    font-size: 12pt;
    line-height: 22pt;
  }

  /* A folha empurra o rodapé para o pé da página quando o conteúdo é curto.
     297mm de papel menos os 12,7mm de margem do pé (a página 1 não tem margem
     de cima: quem ocupa esse espaço é a faixa). */
  .folha { min-height: 284.3mm; display: flex; flex-direction: column; }

  /* Faixa da papelaria: 2cm de altura, de borda a borda. */
  .faixa img { display: block; width: 100%; height: 19.8mm; }

  /* Margem lateral do texto - equivale ao pgMar de 2,5cm do template. */
  .corpo { padding: 0 25mm; }

  h1 { font-size: 14pt; line-height: 25.6pt; font-weight: bold; text-align: center; margin: 9pt 0 12pt; }

  /* Só a simulação com muitas parcelas passa de uma página; nesse caso nada de
     título, quadro, rótulo de seção ou fechamento sozinhos no pé da página. */
  h1, .secao, .rotulo, .calc, .cidade { break-after: avoid; }
  .quadro, .rodape { break-inside: avoid; }

  /* Quadro de dados: réguas de 1,5pt e entrelinha simples (14,65pt em Calibri
     12pt). O espaço entre os campos é o parágrafo vazio do template, ou seja
     mais uma linha. O padding assimétrico é o que põe as réguas na altura em
     que o modelo as põe. */
  .quadro {
    border-top: 1.5pt solid #000;
    border-bottom: 1.5pt solid #000;
    padding: 3mm 1.8mm 2.1mm;
    line-height: 14.65pt;
  }
  .quadro p + p { margin-top: 14.65pt; }

  /* Os 22pt de margem equivalem a um parágrafo vazio do template, e os de 12pt
     e 14pt ao w:before/w:after dos parágrafos correspondentes. Onde o valor sai
     redondo é porque foi calibrado contra o PDF do modelo - a borda da tabela e
     as margens de célula do Word não têm equivalente exato em CSS. */
  .secao { margin: 17.75pt 0 22pt; }
  .cond { text-align: justify; }
  .calc { margin-top: 14pt; text-align: justify; }
  .rotulo { margin: 12pt 0; }
  .parcela { text-align: justify; }

  /* Marcador U+25CF a 0,635cm e texto a 1,27cm, como o w:ind da lista do
     template - daí o marcador ser posicionado à mão em vez de list-style. */
  ul { list-style: none; padding-left: 12.7mm; }
  li { position: relative; text-align: justify; }
  li::before { content: '\\25CF'; position: absolute; left: -6.35mm; }

  /* Tabela de cálculo (versão parcelada). */
  .tab { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10pt; line-height: 1.2; }
  .tab thead { display: table-header-group; }
  .tab tr { break-inside: avoid; }
  .tab th {
    font-weight: bold; text-align: center; padding: 3pt 4pt;
    border-top: 1pt solid #000; border-bottom: 1pt solid #000;
  }
  .tab td { padding: 3pt 4pt; border-bottom: 0.5pt solid #AAAAAA; }
  .tab td.c { text-align: center; }
  .tab td.num { text-align: right; }
  .tab td.num .m { float: left; }
  .tab tfoot td {
    font-weight: bold;
    border-top: 1pt solid #000; border-bottom: 1pt solid #000;
  }

  /* 14pt do w:before mais os dois parágrafos vazios de 22pt que o template
     deixa antes da assinatura de praça e data. */
  .cidade { margin-top: 58pt; text-align: center; }

  .rodape { margin-top: auto; padding: 12mm 25mm 0; text-align: center; }
  .rodape hr { border: none; border-top: 0.75pt solid #999999; margin-bottom: 2pt; }
  .rodape p { font-size: 8pt; font-weight: bold; color: #999999; line-height: 10.5pt; }
</style></head>
<body>
  <div class="folha">
    <div class="faixa"><img id="faixa" src="${origem}/faixa-dux.png" alt=""></div>

    <div class="corpo">
      <h1>SIMULAÇÃO DE ANTECIPAÇÃO DE RECEBÍVEIS</h1>
${corpo}

      <p class="cidade">Rio de janeiro, <strong>${fmtDataExtenso(hoje)}</strong></p>
    </div>

    <div class="rodape">
      <hr>
      <p>DUX FACTORING E SOLUCOES FINANCEIRAS LTDA | 60.180.043/0001-28</p>
      <p>Avenida Presidente Vargas, 3131, SAL 604, Cidade Nova, Rio de Janeiro-RJ, 20.210-030</p>
      <p>www.wearedux.com</p>
    </div>
  </div>

  <script>
    // Só imprime depois que a faixa carregar, senão o Chrome gera a página sem ela.
    (function () {
      var img = document.getElementById('faixa');
      var jaFoi = false;
      function imprimir() {
        if (jaFoi) return;
        jaFoi = true;
        setTimeout(function () { window.print(); }, 150);
      }
      if (!img || img.complete) { imprimir(); return; }
      img.addEventListener('load', imprimir);
      img.addEventListener('error', imprimir);
      setTimeout(imprimir, 3000); // rede lenta ou imagem ausente não travam a impressão
    })();
  <\/script>
</body></html>`;
}

/**
 * Abre a simulação em uma janela de impressão, para o usuário salvar em PDF.
 * Devolve `false` quando o pop-up foi bloqueado - quem chama mostra o aviso.
 */
export function abrirSimulacaoPdf(d: DadosSimulacaoPdf): boolean {
  if (!d.resultado.parcelas.length) return false;

  const w = window.open('', '_blank');
  if (!w) return false;

  w.document.open();
  w.document.write(documentoHtml(d, window.location.origin));
  w.document.close();
  return true;
}
