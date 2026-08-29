// Leitura de NFS-e, faturas, notas de débito e contratos - porte de
// `extrair_dados_nf` do "DUX Gerador de Propostas" (app.py).
//
// O original acumula heurísticas por município (São Paulo, Barueri, Guarulhos,
// Passos MG, Santana de Parnaíba, Sorocaba, São Caetano, Juiz de Fora…) e por
// layout de PDF, porque cada prefeitura emite o DANFS-e de um jeito. A ordem das
// regras importa: as mais específicas rodam primeiro e as genéricas só preenchem
// o que ficou faltando. Mantive a mesma sequência e os mesmos padrões.
//
// A entrada aqui é o TEXTO já extraído (ver src/lib/ocrExtractor.ts), não o PDF:
// pdfjs cobre o que o pdfplumber/PyMuPDF faziam e o tesseract.js cobre o OCR.

export interface DadosNf {
  cliente_razao?: string;
  cliente_cnpj?: string;
  sacado_razao?: string;
  sacado_cnpj?: string;
  valor_total?: string;
  numero_nf?: string;
  data_emissao?: string;
  servico?: string;
  n_parcelas?: string;
  datas_vencimento?: string;
  valores_parcelas?: string;
  cod_verificacao?: string;
  tipo_documento?: 'nf' | 'fatura' | 'nota_debito' | 'contrato';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Porte de `parse_moeda`: "R$ 1.234,56" → 1234.56 */
export function parseMoeda(s: string | number): number {
  if (typeof s === 'number') return s;
  let t = String(s).replace(/R\$\s*/g, '').trim();
  t = t.replace(/\./g, '').replace(/,/g, '.');
  const partes = t.split('.');
  if (partes.length > 2) t = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1];
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** 1234.56 → "1.234,56" (sem o "R$", como o original monta valores_parcelas) */
function fmtNumeroBR(v: number): string {
  return v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Tolerante a OCR: "Razão", "Raz@o", "Raz4o"… */
const RAZ = 'Raz[ãa@4&]o';

/** Primeiro CNPJ do bloco, normalizando espaços que o OCR insere no traço. */
function cnpjEm(bloco: string): string | null {
  const m = bloco.match(/(\d{2}\.\d{3}\.\d{3}\/\d{4}\s*-\s*\d{2})/);
  return m ? m[1].replace(/\s+/g, '') : null;
}

/** Tira e-mail, rótulos de coluna vazados, traço final e espaços extras. */
function limparRazao(s: string): string {
  let t = s;
  t = t.replace(/\s+\S+@\S+.*$/s, '');
  t = t.replace(/\s+T[IÍ]TULO\b.*$/is, '');
  t = t.replace(/\s+Nome\s+Fantasia.*$/is, '');
  t = t.replace(/\s+-\s*$/, '');
  return t.split(/\s+/).filter(Boolean).join(' ');
}

/** Só grava se ainda não houver valor - replica o `if 'campo' not in d`. */
function setSeVazio(d: DadosNf, chave: keyof DadosNf, valor: string | undefined | null) {
  if (valor == null) return;
  const v = String(valor).trim();
  if (!v) return;
  if (d[chave] == null) (d as Record<string, string>)[chave as string] = v;
}

function primeiroGrupo(texto: string, re: RegExp): string | null {
  const m = texto.match(re);
  return m ? m[1] : null;
}

function todos(texto: string, re: RegExp): string[] {
  return Array.from(texto.matchAll(re), m => m[1] ?? m[0]);
}

// ── Parcelas da discriminação (formato "3x 1.000,00 10/01 10/02 10/03") ─────

interface ParcelasDisc { nParcelas: string; datas: string; valores: string }

/** Porte de `_parcelas_da_disc`. */
function parcelasDaDisc(disc: string): ParcelasDisc | null {
  const grupos: { n: number; valor: number; datas: string[] }[] = [];
  const reGrupo = /(\d+)[Xx]\s*(?:[=:]\s*)?(?:R\$\s*)?([\d.,]+)([\s\S]*?)(?=\d+[Xx]\s*(?:[=:]?\s*(?:R\$\s*)?)?[\d.,]|$)/g;

  for (const gm of disc.matchAll(reGrupo)) {
    const n = parseInt(gm[1], 10);
    const valor = parseMoeda(gm[2]);
    const resto = gm[3] ?? '';
    const datas = Array.from(resto.matchAll(/\b(\d{2}[/-]\d{2})(?:[/-]\d{2,4})?\b/g), m => m[1].replace(/-/g, '/')).slice(0, n);
    grupos.push({ n, valor, datas });
  }
  if (!grupos.length) return null;

  const nTotal = grupos.reduce((s, g) => s + g.n, 0);
  const pares: { data: Date; valor: number }[] = [];
  const anoBase = new Date().getFullYear();

  for (const g of grupos) {
    let prevMes = 0;
    let ano = anoBase;
    for (const dt of g.datas) {
      const dd = parseInt(dt.slice(0, 2), 10);
      const mm = parseInt(dt.slice(3), 10);
      // A discriminação traz só dia/mês; quando o mês "volta", virou o ano
      if (mm < prevMes) ano += 1;
      prevMes = mm;
      pares.push({ data: new Date(Date.UTC(ano, mm - 1, dd)), valor: g.valor });
    }
  }
  if (!pares.length) return null;

  pares.sort((a, b) => a.data.getTime() - b.data.getTime());
  const datasOut = pares.map(p => {
    const dd = String(p.data.getUTCDate()).padStart(2, '0');
    const mm = String(p.data.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${String(p.data.getUTCFullYear()).slice(2)}`;
  });

  return {
    nParcelas: String(nTotal),
    datas: datasOut.join(', '),
    // Sempre devolve valor a valor (mesmo iguais) para o editor pré-preencher tudo
    valores: pares.map(p => fmtNumeroBR(p.valor)).join(', '),
  };
}

/**
 * Confere a soma das parcelas contra o total do documento e corrige valores
 * suspeitos por fator de escala - é comum a discriminação trazer "3x 1.000"
 * quando o correto é 10.000. Porte da heurística de correção do original.
 */
function corrigirEscalaParcelas(valoresStr: string, totalNf: number): string {
  const vals = valoresStr.split(/,\s+(?=[\d])/).map(v => parseMoeda(v.trim())).filter(v => v > 0);
  if (!vals.length || totalNf <= 0) return valoresStr;

  const soma = vals.reduce((s, v) => s + v, 0);
  if (Math.abs(soma - totalNf) / totalNf <= 0.02) return valoresStr;

  const conta = (v: number) => vals.filter(x => x === v).length;
  for (const fator of [10, 100, 0.1, 0.01]) {
    const candidatos = Array.from(new Set(vals)).sort((a, b) => {
      const custo = (v: number) => Math.abs(v * fator * conta(v) + (soma - v * conta(v)) - totalNf);
      return custo(a) - custo(b);
    });
    for (const alvo of candidatos) {
      const teste = vals.map(v => (v === alvo ? v * fator : v));
      const somaTeste = teste.reduce((s, v) => s + v, 0);
      if (Math.abs(somaTeste - totalNf) / totalNf < 0.01) {
        return teste.map(fmtNumeroBR).join(', ');
      }
    }
  }
  return valoresStr;
}

// ── Extração ─────────────────────────────────────────────────────────────────

export function extrairDadosNf(texto: string, nomeArquivo = ''): DadosNf {
  const d: DadosNf = {};
  if (!texto || !texto.trim()) return d;

  // ── PRESTADOR (= nosso cliente / cedente) ─────────────────────────────────

  // São Paulo e Passos MG: seção "PRESTADOR DE SERVIÇOS"
  const blocoPrest = primeiroGrupo(texto, /PRESTADOR DE SERVI[ÇC]OS([\s\S]*?)(?:TOMADOR|INTERMEDI[ÁA]RIO|DISCRIMINA|SERVI[ÇC]O PRESTADO)/i);
  if (blocoPrest) {
    const m = blocoPrest.match(new RegExp(RAZ + String.raw`\s+Social:\s*([\s\S]+?)(?:\n|CPF|Ender)`, 'i'));
    if (m) d.cliente_razao = limparRazao(m[1]);
    if (d.cliente_razao == null) {
      const m2 = blocoPrest.match(new RegExp(RAZ + String.raw`\s+Social\s*\n([^\n]+)`, 'i'));
      if (m2) d.cliente_razao = limparRazao(m2[1]);
    }
    setSeVazio(d, 'cliente_cnpj', cnpjEm(blocoPrest));
  }

  // Santana de Parnaíba: "DADOS DO PRESTADOR"
  if (d.cliente_razao == null || d.cliente_cnpj == null) {
    const b = primeiroGrupo(texto, /DADOS DO PRESTADOR([\s\S]*?)(?:DADOS DO TOMADOR|DISCRIMINA[ÇC][ÃA]O|$)/i);
    if (b) {
      if (d.cliente_razao == null) {
        const m = b.match(/Nome\/Raz[ãa]o Social\s*:\s*([\s\S]+?)(?:\n|CNPJ|CPF)/i);
        if (m) d.cliente_razao = limparRazao(m[1]);
      }
      setSeVazio(d, 'cliente_cnpj', cnpjEm(b));
    }
  }

  // ── DANFSe v2.0 - padrão nacional (Guarulhos e outros) ────────────────────
  if (/NÚMERO DA NFS-E/i.test(texto) && /EMITENTE DA NFS-E/i.test(texto) && /TOMADOR\s*\/\s*ADQUIRENTE/i.test(texto)) {
    if (d.numero_nf == null) {
      const m = texto.match(/NÚMERO DA NFS-E[^\n]*\n\s*(\d+)/i);
      if (m) d.numero_nf = String(parseInt(m[1], 10));
    }
    if (d.cod_verificacao == null) {
      const m = texto.match(/CÓDIGO DE VERIFICAÇÃO[^\n]*\n\s*([A-Z0-9]{6,20})\b/i);
      if (m) d.cod_verificacao = m[1];
    }

    const be = primeiroGrupo(texto, /EMITENTE DA NFS-E\b([\s\S]*?)PRESTADOR\b/i);
    if (be) {
      if (d.cliente_cnpj == null) {
        const m = be.match(/CNPJ\s*\/\s*CPF\s*\/\s*NIF[^\n]*\n\s*([\d./-]+)/);
        if (m) d.cliente_cnpj = m[1].trim();
      }
      const m = be.match(/NOME\s*\/\s*NOME EMPRESARIAL[^\n]*\n\s*(.+)/i);
      if (m) {
        const linha = m[1];
        // Corta cidade/UF/CEP que vêm coladas: procura o sufixo societário para
        // não decepar palavras do nome ("VERO CONNECT PR. LTDA GUARULHOS/SP …")
        const suf = linha.match(/\b(LTDA\s+ME|LTDA|S\.?\s*A\.?|S\/A|EIRELI|ME|EPP|SS|SAS)\b/i);
        const nome = suf
          ? linha.slice(0, suf.index! + suf[0].length).trim()
          : linha.replace(/\s+\S+\/[A-Z]{2}\b.*$/, '').trim();
        d.cliente_razao = limparRazao(nome); // sempre sobrescreve: o genérico pega lixo aqui
      }
    }

    const bt = primeiroGrupo(texto, /TOMADOR\s*\/\s*ADQUIRENTE\b([\s\S]*?)DESTINATÁRIO/i);
    if (bt) {
      if (d.sacado_cnpj == null) {
        const m = bt.match(/CNPJ\s*\/\s*CPF\s*\/\s*NIF[^\n]*\n\s*([\d./-]+)/);
        if (m) d.sacado_cnpj = m[1].trim();
      }
      if (d.sacado_razao == null) {
        const m = bt.match(/NOME\s*\/\s*NOME EMPRESARIAL[^\n]*\n\s*(.+)/i);
        if (m) d.sacado_razao = limparRazao(m[1].replace(/(?:\s+\S+)*\s+\S+\/[A-Z]{2}\b.*$/, '').trim());
      }
    }

    if (d.valor_total == null) {
      const m = texto.match(/VALOR DA OPERA[ÇC][AÃ]O\s*\/\s*SERVI[ÇC]O[^\n]*\n\s*([\d.,]+)/i);
      if (m) d.valor_total = m[1];
    }
  }

  // DANFS nacional: seção "EMITENTE"
  if (d.cliente_razao == null || d.cliente_cnpj == null) {
    const b = primeiroGrupo(texto, /EMITENTE([\s\S]*?)(?:TOMADOR)/i);
    if (b) {
      setSeVazio(d, 'cliente_cnpj', cnpjEm(b));
      if (d.cliente_razao == null) {
        const m = b.match(/Nome\s*\/\s*Nome\s*Empresarial[^\n]*\n([^\n]+)/i);
        if (m) d.cliente_razao = limparRazao(m[1]);
      }
      if (d.cliente_razao == null) {
        // Sorocaba (OCR): "Nome/Razao Social\n<nome> E-mail: …"
        const m = b.match(/Nome\s*\/\s*Raz[aã]o\s*Social[^\n]*\n([^\n]+)/i);
        if (m) d.cliente_razao = limparRazao(m[1].replace(/\s+E-?mail\s*:.*$/i, ''));
      }
    }
  }

  // Barueri: "Prestador de Serviços <nome>" inline
  if (d.cliente_razao == null || d.cliente_cnpj == null) {
    const m = texto.match(/Prestador\s+de\s+Servi[çc]os\s+([A-ZÁÀÉÍÓÚÂÊÎÔÛÃÕÇÑ][^\n]+)/i);
    if (m) {
      if (d.cliente_razao == null) d.cliente_razao = limparRazao(m[1].trim());
      if (d.cliente_cnpj == null) {
        const fim = m.index! + m[0].length;
        setSeVazio(d, 'cliente_cnpj', cnpjEm(texto.slice(fim, fim + 400)));
      }
    }
  }

  // ── TOMADOR (= sacado / devedor) ──────────────────────────────────────────

  const blocoTom = primeiroGrupo(texto, /TOMADOR DE SERVI[ÇC]OS([\s\S]*?)(?:INTERMEDI[ÁA]RIO|DISCRIMINA|SERVI[ÇC]O PRESTADO|$)/i);
  if (blocoTom) {
    const m = blocoTom.match(new RegExp(RAZ + String.raw`\s+Social:\s*([\s\S]+?)(?:\n|CPF|Ender)`, 'i'));
    if (m) d.sacado_razao = limparRazao(m[1]);
    if (d.sacado_razao == null) {
      const m2 = blocoTom.match(/Nome\/Raz[ãa]o Social\s*\n([^\n]+)/i);
      if (m2) d.sacado_razao = limparRazao(m2[1]);
    }
    setSeVazio(d, 'sacado_cnpj', cnpjEm(blocoTom));
  }

  if (d.sacado_razao == null || d.sacado_cnpj == null) {
    const b = primeiroGrupo(texto, /DADOS DO TOMADOR([\s\S]*?)(?:DISCRIMINA[ÇC][ÃA]O|VALOR BRUTO|$)/i);
    if (b) {
      if (d.sacado_razao == null) {
        const m = b.match(/Nome\/Raz[ãa]o Social\s*:\s*([\s\S]+?)(?:\n|CNPJ|CPF)/i);
        if (m) d.sacado_razao = limparRazao(m[1]);
      }
      setSeVazio(d, 'sacado_cnpj', cnpjEm(b));
    }
  }

  // Barueri: "Nome Tomador de Serviços CPF/CNPJ\n<nome> <cnpj>"
  if (d.sacado_razao == null || d.sacado_cnpj == null) {
    const m = texto.match(/Nome\s+Tomador\s+de\s+Servi[çc]os\s+CPF\/CNPJ\s*\n([^\n]+)/i);
    if (m) {
      const linha = m[1].trim();
      if (d.sacado_razao == null) {
        const nome = linha.replace(/\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, '').trim();
        if (nome) d.sacado_razao = limparRazao(nome);
      }
      setSeVazio(d, 'sacado_cnpj', cnpjEm(linha));
    }
  }

  // DANFS: "TOMADOR DO SERVIÇO" (espaçado) ou "TOMADORDOSERVIÇO" (comprimido)
  if (d.sacado_razao == null || d.sacado_cnpj == null) {
    let b = primeiroGrupo(texto, /TOMADOR\s+DO\s+SERVI[ÇC]O([\s\S]*?)(?:INTERMEDI[ÁA]RIO|SERVI[ÇC]O\s+PRESTADO|$)/i);
    if (!b) b = primeiroGrupo(texto, /TOMADORDOSERVI[ÇC]O([\s\S]*?)(?:INTERMEDI[ÁA]RIODOSERVI|SERVI[ÇC]OPRESTADO|$)/i);
    if (b) {
      setSeVazio(d, 'sacado_cnpj', cnpjEm(b));
      if (d.sacado_razao == null) {
        const m = b.match(/Nome\s*\/\s*Nome\s*Empresarial[^\n]*\n([^\n]+)/i);
        if (m) d.sacado_razao = limparRazao(m[1]);
      }
      if (d.sacado_razao == null) {
        const m = b.match(/Nome\s*\/\s*Nome\b[^\n]*\n([^\n]+)/i);
        if (m) d.sacado_razao = limparRazao(m[1]);
      }
    }
  }

  // ── VALOR TOTAL ───────────────────────────────────────────────────────────

  {
    const m = texto.match(/VALOR TOTAL DA NOTA\s+([\d.,]+)/i);
    if (m && d.valor_total == null) d.valor_total = m[1].trim();
  }

  // Sorocaba: header e depois a linha de dados; o último número é o líquido
  if (d.valor_total == null) {
    const m = texto.match(/VALOR TOTAL DA NOTA\s*\n[^\n]+(?:Valor\s*L[íi]quido|Liquido)[^\n]*\n([^\n]+)/i);
    if (m) {
      const nums = m[1].match(/[\d.,]+/g);
      if (nums?.length) d.valor_total = nums[nums.length - 1].trim();
    }
  }

  if (d.valor_total == null) {
    let m = texto.match(/VALOR BRUTO DA NOTA\s*R\$\s*([\d.,]+)/i);
    if (!m) m = texto.match(/VALOR L[ÍI]QUIDO DA NOTA\s*R\$\s*([\d.,]+)/i);
    if (m) d.valor_total = m[1].trim();
  }

  {
    let m = texto.match(/VALOR TOTAL RECEBIDO\s*[=:]\s*R[S$]\$?\s*([\d.,]+)/i);
    if (!m) m = texto.match(/VALOR TOTAL DO SERVI[ÇC]O\s*[=:]\s*R[S$]\$?\s*([\d.,]+)/i);
    if (!m) m = texto.match(/ValorL[íi]quidodaNFS-e[^\n]*\n[^\n]*R\$\s*([\d.,]+)/i);
    if (!m) m = texto.match(/ValordoServi[çc]o[^\n]*\n\s*R\$\s*([\d.,]+)/i);
    if (!m) m = texto.match(/Valor\s+L[íi]quido\s+da\s+NFS-e\s*\n\s*R\$\s*([\d.,]+)/i);
    if (!m) m = texto.match(/Valor\s+do\s+Servi[çc]o\s*\n\s*R\$\s*([\d.,]+)/i);
    if (!m) m = texto.match(/Valor dos Servi[çc]os\s*\(R\$\)[^\n]*\n\s*([\d.,]+)/i);
    if (!m) {
      // Passos MG: "Valor Total da Nota (R$)" → último número da linha de dados
      const vm = texto.match(/Valor Total da Nota\s*\(R\$\)[^\n]*\n([^\n]+)/i);
      if (vm) {
        const nums = vm[1].replace(/\*/g, '').match(/[\d.,]+/g);
        if (nums?.length) setSeVazio(d, 'valor_total', nums[nums.length - 1].trim());
      }
    }
    if (m && d.valor_total == null) d.valor_total = m[1].trim();
  }

  // Juiz de Fora MG
  if (d.valor_total == null) {
    const m = texto.match(/Valor\s+Liquido\s*\n([^\n]+)/i);
    if (m) {
      const nums = m[1].match(/[\d.]+,\d{2}/g);
      if (nums?.length) d.valor_total = nums[nums.length - 1].trim();
    }
  }
  if (d.valor_total == null) {
    const m = texto.match(/Valor\s+Servi[çc]os[^\n]*\n([^\n]+)/i);
    if (m) {
      const nums = m[1].match(/[\d.]+,\d{2}/g);
      if (nums?.length) d.valor_total = nums[0].trim();
    }
  }

  // ── NÚMERO DA NF ──────────────────────────────────────────────────────────

  {
    const m = texto.match(/N[uú]mero\s+da\s+Nota\s+Fiscal\s+0*(\d+)/i);
    if (m) d.numero_nf = m[1].trim();
  }
  if (!d.numero_nf) {
    const m = texto.match(/N[uú]mero\s+da\s+Nota\s*\n[^\n]+\n\s*(0*)(\d+)/i);
    if (m) d.numero_nf = String(parseInt(m[2], 10));
  }
  if (!d.numero_nf) {
    const m = texto.match(/N[uú]mero\s+da\s+Nota[^\n]*\n[^\n]+?\s+(0*)(\d{4,})\s+[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    if (m) d.numero_nf = String(parseInt(m[2], 10));
  }
  if (!d.numero_nf) {
    const m = texto.match(/N[uú]mero\s+da\s+NFS-e\s*[:\n]\s*0*(\d+)/i);
    if (m) d.numero_nf = m[1].trim();
  }
  if (!d.numero_nf) {
    const m = texto.match(/N[uú]merodaNFS-?e\s*:?\s*0*(\d+)/i);
    if (m) d.numero_nf = m[1].trim();
  }
  if (!d.numero_nf) {
    // "Número: 1665" - mas não o "Endereço Número: 115" do prestador
    for (const m of texto.matchAll(/\bN[uú]mero\s*:\s*0*(\d+)/gi)) {
      const inicioLinha = texto.lastIndexOf('\n', m.index!) + 1;
      const prefixo = texto.slice(inicioLinha, m.index!);
      if (!/endere[çc]o/i.test(prefixo)) { d.numero_nf = m[1].trim(); break; }
    }
  }
  if (!d.numero_nf) {
    const m = texto.match(/Numero\s*\/\s*S[ée]rie[^\n]*\n[^\n]*?(\d+)\/[A-Za-z]/i);
    if (m) d.numero_nf = m[1].trim();
  }
  if (!d.numero_nf) {
    // Juiz de Fora: "Nota 202600000000297 / Única" → 297
    const m = texto.match(/\bNota\s+(20\d{2}0+(\d+))\s*\//i);
    if (m) d.numero_nf = String(parseInt(m[2], 10));
  }
  if (!d.numero_nf) {
    const m = texto.match(/(?:NFS?-?e|Nota\s+Fiscal)\s*(?:N[oº°.]?\s*|N[uú]mero\s*:?\s*)0*(\d+)/i);
    if (m) d.numero_nf = m[1].trim();
  }

  // ── DATA DE EMISSÃO ───────────────────────────────────────────────────────

  {
    // Barueri antes de Passos MG, senão pega a data da "CARTA CORREÇÃO"
    let m = texto.match(/NFE\s+Data\s+Emiss[ãa]o[^\n]*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = texto.match(/Data\s+Emiss[ãa]o\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = texto.match(/Data e Hora de Emiss[ãa]o\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = texto.match(/Data e Hora d[ae]\s+[Ee]miss[ãa]o[^\n]*\n(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = texto.match(/Emiss[ãa]o\s*(?:\([^)]+\)\s*)?(\d{2}\/\d{2}\/\d{4})/i);
    if (!m) m = texto.match(/(\d{2}\/\d{2}\/\d{4})\d{2}:\d{2}:\d{2}/);
    if (!m) m = texto.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (m) d.data_emissao = m[1];
  }

  // ── DISCRIMINAÇÃO / SERVIÇO / PARCELAS ────────────────────────────────────

  let disc = '';
  {
    let m = texto.match(/DISCRIMINA[ÇC][ÃA]O DO SERVI[ÇC]O\s*([\s\S]*?)(?:VALOR BRUTO|VALOR L[ÍI]QUIDO|TRIBUTA|Observa[çc][õo]es|$)/i);
    if (m) disc = m[1].trim();
    if (!disc) {
      m = texto.match(/DISCRIMINA[ÇC][ÃA]O DE SERVI[ÇC]OS\s*([\s\S]*?)(?:Banco:|VALOR TOTAL|INSS|RETEN)/i);
      if (m) disc = m[1].trim();
    }
    if (!disc) {
      m = texto.match(/Descri[çc][ãa]odoServi[çc]o\s*([\s\S]*?)(?:TRIBUTA|VALORTOTAL|$)/i);
      if (m) disc = m[1].trim();
    }
    if (!disc) {
      m = texto.match(/Descri[çc][ãa]o\s+do\s+Servi[çc]o\s*([\s\S]*?)(?:TRIBUTA[ÇC][ÃA]O|VALOR TOTAL DA NFS|$)/i);
      if (m) disc = m[1].trim();
    }
    if (!disc) {
      m = texto.match(/DESCRI[ÇC][ÃA]O DOS SERVI[ÇC]OS\s*([\s\S]*?)(?:RETEN|VALORES|OUTRAS INFORM|$)/i);
      if (m) disc = m[1].trim();
    }
  }

  if (disc) {
    let p: ParcelasDisc | null = null;
    try {
      p = parcelasDaDisc(disc);
    } catch {
      // Discriminação fora do padrão não invalida o resto da extração
      p = null;
    }
    if (p) {
      let valores = p.valores;
      if (valores && d.valor_total) {
        try {
          valores = corrigirEscalaParcelas(valores, parseMoeda(d.valor_total));
        } catch { /* mantém como veio */ }
      }
      d.n_parcelas = p.nParcelas;
      d.datas_vencimento = p.datas;
      d.valores_parcelas = valores;
    }
  }

  // ── OBSERVAÇÕES: vencimento/parcelas (Santana de Parnaíba e similares) ────
  if (!d.n_parcelas || !d.datas_vencimento) {
    const obs = primeiroGrupo(texto, /Observa[çc][õo]es\s*:?\s*([\s\S]*?)$/i);
    if (obs) {
      const mParc = obs.match(/PARCELA\s+\d+\s+DE\s+(\d+)/i);
      if (mParc && !d.n_parcelas) d.n_parcelas = mParc[1].trim();
      const vencs = todos(obs, /VENCIMENTO\s*:\s*(\d{2}\/\d{2}\/\d{4})/gi);
      if (vencs.length && !d.datas_vencimento) {
        d.datas_vencimento = vencs.map(v => {
          const p = v.split('/');
          return p.length === 3 ? `${p[0]}/${p[1]}/${p[2].slice(2)}` : v;
        }).join(', ');
      }
    }
  }

  // ── FATURA / DUPLICATA (M Y Sakamoto / Eventesse) ─────────────────────────
  if (/N[°º]\s*Fatura|Fatura\s*\/\s*Duplicata|Valor\s+Fatura/i.test(texto)) {
    if (d.cliente_razao == null || d.cliente_cnpj == null) {
      const linhasTopo: string[] = [];
      for (const ln of texto.split('\n')) {
        const l = ln.trim();
        if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l)) break;
        if (l) linhasTopo.push(l);
      }
      if (linhasTopo.length && d.cliente_razao == null) d.cliente_razao = limparRazao(linhasTopo[0]);
      if (d.cliente_cnpj == null) {
        const m = texto.match(/CNPJ\s*[:-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
        if (m) d.cliente_cnpj = m[1];
      }
    }
    if (d.sacado_razao == null) {
      const m = texto.match(/Pagador\s*:\s*([^\n]+)/i);
      if (m) d.sacado_razao = limparRazao(m[1]);
    }
    if (d.sacado_cnpj == null) {
      const m = texto.match(/Pagador\s*:[\s\S]*?CNPJ\s*[:-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
      if (m) d.sacado_cnpj = m[1];
      else {
        const cnpjs = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
        if (cnpjs.length >= 2) d.sacado_cnpj = cnpjs[1];
      }
    }
    if (d.numero_nf == null) {
      const m = texto.match(/\bFT\s*0*(\d+)\b/i);
      if (m) d.numero_nf = 'FT' + m[1];
    }
    const mTab = texto.match(/FT\s*\d+\s+([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (mTab) {
      if (d.valor_total == null) d.valor_total = mTab[1];
      if (d.data_emissao == null) d.data_emissao = mTab[2];
      if (d.datas_vencimento == null) {
        const dt = mTab[3];
        d.datas_vencimento = `${dt.slice(0, 2)}/${dt.slice(3, 5)}/${dt.slice(8)}`;
        d.n_parcelas = '1';
        d.valores_parcelas = '';
      }
    }
    if (d.valor_total == null) {
      let m = texto.match(/Total\s+da\s+Fatura\s+([\d.,]+)/i);
      if (!m) m = texto.match(/VALOR TOTAL\s*[:.]?\s*([\d.,]+)/i);
      if (m) d.valor_total = m[1];
    }
    if (!d.servico) {
      // "B2887 – DESAFIO VIBRA 2026 PRAGA" até uma data.
      // Excecao consciente a regra "sem travessao" (CLAUDE.md): o travessao medio
      // aqui e do documento de terceiro que estamos lendo, nao texto nosso.
      const m = texto.match(/(B\d{4,}\s*[–-]\s*[^\n]+?)(?=\s+\d{2}\/\d{2}\/\d{4}|\n|$)/);
      if (m) {
        let srv = m[1].replace(/\s+/g, ' ').trim();
        const resto = texto.slice(m.index! + m[0].length);
        const prox = resto.includes('\n') ? resto.split('\n')[1] ?? '' : '';
        const primeira = prox.trim().split(/\s+/)[0] ?? '';
        if (primeira && primeira === primeira.toUpperCase() && primeira.length > 2 && !/\d/.test(primeira)) {
          srv += ' ' + primeira;
        }
        d.servico = srv.slice(0, 80);
      }
    }
  }

  // ── NFS-e GINFES (Guarulhos e similares) ──────────────────────────────────
  if (/Dados do Prestador de Servi[çc]os/i.test(texto) && /Dados do Tomador de Servi[çc]os/i.test(texto)) {
    if (d.numero_nf == null) {
      const m = texto.match(/NFS-e\s+(\d+)/i);
      if (m) d.numero_nf = String(parseInt(m[1], 10));
    }
    if (d.data_emissao == null) {
      const m = texto.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}/);
      if (m) d.data_emissao = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
    }
    if (d.cod_verificacao == null) {
      const m = texto.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+\S+\s+([A-Z0-9]{5,12})/);
      if (m) d.cod_verificacao = m[1];
    }
    if (d.cliente_razao == null) {
      const m = texto.match(/Dados do Prestador de Servi[çc]os\s*\nRaz[ãa]o Social\/Nome\s+(.+?)(?:\n|$)/i);
      if (m) d.cliente_razao = limparRazao(m[1]);
    }
    if (d.cliente_cnpj == null) {
      const m = texto.match(/Dados do Prestador de Servi[çc]os[\s\S]*?\nCNPJ\/CPF\s+([\d./-]+)/i);
      if (m) d.cliente_cnpj = m[1].trim();
    }
    if (d.sacado_razao == null) {
      const m = texto.match(/Dados do Tomador de Servi[çc]os\s*\nRaz[ãa]o Social\/Nome\s+(.+?)(?:\n|$)/i);
      if (m) d.sacado_razao = limparRazao(m[1]);
    }
    if (d.sacado_cnpj == null) {
      const m = texto.match(/Dados do Tomador de Servi[çc]os[\s\S]*?\nCNPJ\/CPF\s+([\d./-]+)/i);
      if (m) d.sacado_cnpj = m[1].trim();
    }
    if (d.valor_total == null) {
      const m = texto.match(/Valor dos Servi[çc]os\s+R\$\s+([\d.,]+)/i);
      if (m) d.valor_total = m[1];
    }
    if (d.datas_vencimento == null) {
      const m = texto.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{2,4})/i);
      if (m) {
        const p = m[1].split('/');
        const yy = p[2].length === 2 ? p[2] : p[2].slice(2);
        d.datas_vencimento = `${p[0]}/${p[1]}/${yy}`;
        d.n_parcelas = '1';
        d.valores_parcelas = '';
      }
    }
    if (!d.servico) {
      const m = texto.match(/\d{2}\.\d{2}\s*\/\s*\d+\s*-\s*([^\n]+)/);
      if (m) d.servico = m[1].trim();
    }
  }

  // ── NFS-e GISS (São Caetano do Sul e similares) ───────────────────────────
  if (/Prestador de Servi[çc]o\b/i.test(texto) && /Tomador de Servi[çc]o\b/i.test(texto)
      && !/Dados do Prestador/i.test(texto)) {
    if (d.numero_nf == null) {
      let m = texto.match(/PREFEITURA MUNICIPAL[^\n]*\s+NFS-e\s*\n\s*(\d+)/i);
      if (!m) m = texto.match(/^NFS-e\s*\n\s*(\d+)/im);
      // 3+ dígitos para não capturar o "10" de uma data
      if (!m) m = texto.match(/\bNFS-e\s*\n\s*(\d{3,})\b/i);
      if (m) d.numero_nf = String(parseInt(m[1], 10));
    }
    if (d.cod_verificacao == null) {
      const m = texto.match(/C[oó]digo\s+de\s+Verifica[çc][aã]o\s*\n[^\n]*?([A-Z0-9]{6,15})\s*\n/i);
      if (m) d.cod_verificacao = m[1];
    }
    if (d.data_emissao == null) {
      const m = texto.match(/Emiss[aã]o\s+da\s+NFS-e\s*\n\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) d.data_emissao = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
    }
    const bp = primeiroGrupo(texto, /Prestador de Servi[çc]o\b([\s\S]*?)Tomador de Servi[çc]o\b/i);
    if (bp) {
      if (d.cliente_razao == null) {
        const m = bp.match(/Nome\/Raz[aã]o Social:\s*([\s\S]+?)(?:\n|Endere|CPF)/i);
        if (m) d.cliente_razao = limparRazao(m[1]);
      }
      if (d.cliente_cnpj == null) {
        const m = bp.match(/CPF\/CNPJ:\s*([\d./-]+)/);
        if (m) d.cliente_cnpj = m[1].trim();
      }
    }
    const bt = primeiroGrupo(texto, /Tomador de Servi[çc]o\b([\s\S]*?)(?:Atividade\s+Econ|Discrimina[çc][aã]o)/i);
    if (bt) {
      if (d.sacado_razao == null) {
        const m = bt.match(/Nome\/Raz[aã]o Social:\s*([\s\S]+?)(?:\n|Endere|CPF)/i);
        if (m) d.sacado_razao = limparRazao(m[1]);
      }
      if (d.sacado_cnpj == null) {
        const m = bt.match(/CPF\/CNPJ:\s*([\d./-]+)/);
        if (m) d.sacado_cnpj = m[1].trim();
      }
    }
    if (d.valor_total == null) {
      const m = texto.match(/Valor\s+do\s+Servi[çc]o\s+([\d.,]+)/i);
      if (m) d.valor_total = m[1];
    }
    if (d.datas_vencimento == null) {
      const m = texto.match(/Pagamento\s+para:\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) {
        d.datas_vencimento = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
        d.n_parcelas = '1';
        d.valores_parcelas = '';
      }
    }
    if (!d.servico) {
      const bd = primeiroGrupo(texto, /Discrimina[çc][aã]o\s+do\s+Servi[çc]o\s*([\s\S]*?)(?:Trib\s+aprox|Tributos\s+Federais)/i);
      if (bd) {
        const linhas = bd.trim().split(/\r?\n/).map(l => l.trim())
          .filter(l => l && !/^Servicos?\s+Prestado/i.test(l) && !/^Pagamento\s+para/i.test(l));
        if (linhas.length) d.servico = linhas[0].slice(0, 100);
      }
    }
  }

  // ── CONTRATO DE PRESTAÇÃO DE SERVIÇOS ─────────────────────────────────────
  // (a) Contratada = cedente | (b) Contratante = sacado
  if (/CONTRATO\s+DE\s+PRESTA[ÇC][ÃA]O\s+DE\s+SERVI[ÇC]OS/i.test(texto)) {
    d.tipo_documento = 'contrato';
    if (d.numero_nf == null) {
      const m = texto.match(/CONTRATO\s+DE\s+PRESTA[ÇC][ÃA]O\s+DE\s+SERVI[ÇC]OS\s+N[º°o]?\s*(\d+\/\d{4})/i);
      if (m) d.numero_nf = m[1];
    }
    const reParte = (letra: string) => new RegExp(
      String.raw`\(${letra}\)\s+([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇ][^,\n]{3,}?),\s*sociedade[^,]*,\s*inscrita no\s+CNPJ\/MF\s+sob\s+o\s+n[º°o]\s+(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})`,
      'is');
    if (d.cliente_razao == null || d.cliente_cnpj == null) {
      const m = texto.match(reParte('a'));
      if (m) {
        if (d.cliente_razao == null) d.cliente_razao = limparRazao(m[1]);
        if (d.cliente_cnpj == null) d.cliente_cnpj = m[2].trim();
      }
    }
    if (d.sacado_razao == null || d.sacado_cnpj == null) {
      const m = texto.match(reParte('b'));
      if (m) {
        if (d.sacado_razao == null) d.sacado_razao = limparRazao(m[1]);
        if (d.sacado_cnpj == null) d.sacado_cnpj = m[2].trim();
      }
    }
  }

  // ── FATURA DE LOCAÇÃO (3P Locadora e similares) ───────────────────────────
  if (/FATURA\s+DE\s+LOCA[ÇC][ÃA]O/i.test(texto)) {
    if (d.cliente_razao == null) {
      const linhasTopo: string[] = [];
      for (const ln of texto.split('\n')) {
        const l = ln.trim();
        if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l)) break;
        if (l && !/Página|Page/i.test(l)) linhasTopo.push(l);
      }
      if (linhasTopo.length) d.cliente_razao = limparRazao(linhasTopo.join(' '));
    }
    if (d.cliente_cnpj == null) {
      const m = texto.match(/CNPJ\s*[:|]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
      if (m) d.cliente_cnpj = m[1];
    }
    if (d.sacado_razao == null) {
      const m = texto.match(/Cliente\s*:\s*\n?\s*([A-ZÁÀÃÂÉÊÍÓÔÕÚÜÇ][^\n]{3,})/i);
      if (m) d.sacado_razao = limparRazao(m[1]);
    }
    if (d.sacado_cnpj == null) {
      const cnpjs = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
      if (cnpjs.length >= 2) d.sacado_cnpj = cnpjs[1];
    }
    if (d.numero_nf == null) {
      const m = texto.match(/FATURA\s+DE\s+LOCA[ÇC][ÃA]O\s+n[oº°]?\s*(\d+)/i);
      if (m) d.numero_nf = String(parseInt(m[1], 10));
    }
    if (d.valor_total == null) {
      const m = texto.match(/Servi[çc]os\s+prestados\s+([\d.,]+)/i);
      if (m) d.valor_total = m[1];
      else {
        // "583.480,34 0,00 583.480,34" → o último é o total líquido
        const m2 = texto.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+[\d.,]+\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/m);
        if (m2) d.valor_total = m2[2];
      }
    }
    if (d.data_emissao == null) {
      const MESES: Record<string, string> = {
        janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04',
        maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
        outubro: '10', novembro: '11', dezembro: '12',
      };
      const m = texto.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i);
      if (m) {
        const chave = m[2].toLowerCase().replace(/ç/g, 'c').replace(/ã/g, 'a');
        const mes = MESES[chave] ?? MESES[m[2].toLowerCase()] ?? '';
        if (mes) d.data_emissao = `${m[1].padStart(2, '0')}/${mes}/${m[3].slice(2)}`;
      }
    }
    if (d.datas_vencimento == null) {
      let m = texto.match(/Pagamento\s+para\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (!m) m = texto.match(/Vencimento\s*:[\s\S]*?(\d{2}\/\d{2}\/\d{4})/i);
      if (m) {
        d.datas_vencimento = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
        d.n_parcelas = '1';
        d.valores_parcelas = '';
      }
    }
    if (!d.servico) {
      const m = texto.match(/Servi[çc]os\s+prestados[^\n]*\n([^\n]{5,})/i);
      d.servico = m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 80) : 'Serviços prestados';
    }
  }

  // ── NOTA DE DÉBITO (TSB e similares) ──────────────────────────────────────
  if (/NOTA\s+DE\s+D[EÉ]BIT[OA]/i.test(texto)) {
    d.tipo_documento = 'nota_debito';
    if (d.numero_nf == null) {
      let m = texto.match(/NOTA\s+DE\s+D[EÉ]BIT[OA]\s+N[º°o]?\s*(\d+)/i);
      if (!m) m = texto.match(/PROTOCOLO\s+NOTA\s+DE\s+D[EÉ]BIT[OA]\s+N[º°o]\s*(\d+)/i);
      if (!m) m = texto.slice(0, 300).match(/N[º°o]\s*(\d+)/i);
      if (m) d.numero_nf = String(parseInt(m[1], 10));
    }
    if (d.data_emissao == null) {
      const m = texto.match(/DATA\s+DE\s+EMISS[ÃA]O\s*:\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) d.data_emissao = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
    }
    if (d.cliente_razao == null) {
      const linhasTopo: string[] = [];
      for (const ln of texto.split('\n')) {
        const l = ln.trim();
        if (/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(l)) break;
        if (l && !/NOTA\s+DE\s+D[EÉ]BIT[OA]|N[º°]/i.test(l)) linhasTopo.push(l);
      }
      if (linhasTopo.length) d.cliente_razao = limparRazao(linhasTopo[0]);
    }
    if (d.cliente_cnpj == null) {
      const m = texto.match(/CNPJ\s*[:-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
      if (m) d.cliente_cnpj = m[1];
    }
    if (d.sacado_razao == null) {
      const m = texto.match(/SACADO\s*:\s*([^\n]+)/i);
      if (m) d.sacado_razao = limparRazao(m[1].replace(/\s+C[ÓO]D?\s*:\s*\d+\s*$/i, '').trim());
    }
    if (d.sacado_cnpj == null) {
      const m = texto.match(/CNPJ\.\s*\/\s*C\.P\.F\.\s*:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
      if (m) d.sacado_cnpj = m[1];
      else {
        const cnpjs = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
        if (cnpjs.length >= 2) d.sacado_cnpj = cnpjs[1];
      }
    }
    if (d.valor_total == null) {
      let m = texto.match(/TOTAL\s*:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (!m) m = texto.match(/VALOR\s+FINANCEIRA\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (!m) m = texto.match(/VALOR\s*\n\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
      if (m) d.valor_total = m[1];
    }
    if (d.datas_vencimento == null) {
      let m = texto.match(/VENCIMENTO\s+FINANCEIRA\s*\n[\d.,]+\s+\d+\s+[\d.,]+\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (!m) m = texto.match(/PROTOCOLO\s*\n[\d.,\s]+(\d{2}\/\d{2}\/\d{4})/i);
      if (!m) m = texto.match(/VENCIMENTO\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (m) {
        d.datas_vencimento = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
        d.n_parcelas = '1';
        d.valores_parcelas = '';
      }
    }
    if (!d.servico) {
      const m = texto.match(/HIST[ÓO]RICO\s*(?:VALOR\s*)?\n([\s\S]*?)(?:\n\s*TOTAL|$)/i);
      if (m) {
        const linhas = m[1].split(/\r?\n/).map(l => l.trim())
          .filter(l => l && !/^[\d.,\s]+$/.test(l));
        if (linhas.length) d.servico = linhas[0].replace(/\s+/g, ' ').trim().slice(0, 100);
      }
      if (!d.servico) {
        // Sem quebras: "HISTÓRICOVALOR80.315,43ROADSHOW…TOTAL :80.315,43"
        const m2 = texto.match(/HIST[ÓO]RICO\s*(?:VALOR\s*[\d.,]+\s*)([\s\S]+?)(?:TOTAL\s*:)/i);
        if (m2) {
          let trecho = m2[1].replace(/\s+/g, ' ').trim();
          trecho = trecho.replace(/\s*(?:Ag[eê]ncia|C\/C|Qi\s+Sociedade|Banco\s+\d|\(\d{3}\)|Bradesco|Itaú|Santander|Caixa).*$/i, '').trim();
          trecho = trecho.replace(/\s*[\d.,]+\s*$/, '').trim();
          if (trecho) d.servico = trecho.slice(0, 100);
        }
      }
    }
  }

  // ── TIPO DE DOCUMENTO ─────────────────────────────────────────────────────
  if (d.tipo_documento == null) {
    // NFS-e tem prioridade: a NFE de Barueri traz "FATURA" no corpo mas é NF
    if (/NFS-e|NOTA FISCAL DE SERVI[ÇC]O|NOTA FISCAL ELETR[ÔO]NICA\s+DE\s+SERVI/i.test(texto)) d.tipo_documento = 'nf';
    else if (/NOTA\s+DE\s+D[EÉ]BIT[OA]/i.test(texto)) d.tipo_documento = 'nota_debito';
    else if (/FATURA\s+DE\s+LOCA[ÇC][ÃA]O|N[°º]\s*Fatura|Fatura\s*\/\s*Duplicata|Total\s+da\s+Fatura/i.test(texto)) d.tipo_documento = 'fatura';
    else if (/\bFATURA\b/i.test(texto.slice(0, 300))) d.tipo_documento = 'fatura';
    else if (/\bCONTRATO\b/i.test(texto.slice(0, 300))) d.tipo_documento = 'contrato';
    else d.tipo_documento = 'nf';
  }

  // ── VENCIMENTO - fallbacks ────────────────────────────────────────────────
  if (d.datas_vencimento == null) {
    const m = texto.match(/Vencimento\s*[:-]\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (m) {
      d.datas_vencimento = `${m[1].slice(0, 2)}/${m[1].slice(3, 5)}/${m[1].slice(8)}`;
      d.n_parcelas = '1';
      d.valores_parcelas = '';
    }
  }
  if (d.datas_vencimento == null) {
    const m = texto.match(/PREVIS[ÃA]O\s*(?:DE\s*)?PAGAMENTO\s*[:\s]+(\d{2}\/\d{2}\/\d{2,4})/i);
    if (m) {
      const p = m[1].split('/');
      const yy = p[2].length === 2 ? p[2] : p[2].slice(2);
      d.datas_vencimento = `${p[0]}/${p[1]}/${yy}`;
      d.n_parcelas = '1';
      d.valores_parcelas = '';
    }
  }

  // ── SERVIÇO - fallback ────────────────────────────────────────────────────
  if (!d.servico) {
    const m = texto.match(/Qtde\s+Descri[çc][ãa]o\s+do\s+Servi[çc]o[^\n]*\n\s*\d+\s+([\s\S]+?)\s+\d{6,}/i);
    if (m) d.servico = m[1].replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  // ── Número pelo nome do arquivo (fallback do endpoint /extrair) ───────────
  if (!d.numero_nf && nomeArquivo) {
    let m = nomeArquivo.match(/NF[-_\s](\d+)/i);
    if (!m) m = nomeArquivo.match(/\b(\d{4,})\b/);
    if (m) d.numero_nf = m[1];
  }

  return d;
}

/** O original considera a extração bem-sucedida quando tem cedente e valor. */
export function extracaoOk(d: DadosNf): boolean {
  return !!(d.cliente_razao && d.valor_total);
}
