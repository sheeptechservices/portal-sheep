// ─────────────────────────────────────────────────────────────────────────────
//  Lê os PDFs de candidatura exportados do sistema antigo e devolve registros.
//
//  O PDF é um formulário impresso: rótulo em maiúsculas, valor nas linhas
//  seguintes, até o próximo rótulo. Por isso a lista de rótulos é fechada - sem
//  ela, um nome escrito todo em maiúsculas ("CARLOS ROBERTO PAULISCHEN") seria
//  lido como rótulo e engoliria o valor.
//
//  Uso:  node scripts/ler-candidaturas.mjs "<pasta>"        -> resumo na tela
//        node scripts/ler-candidaturas.mjs "<pasta>" --json -> JSON na saída
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROTULOS = [
  'NOME COMPLETO', 'E-MAIL', 'TELEFONE / WHATSAPP', 'DATA DE NASCIMENTO', 'SEXO',
  'LOCALIZAÇÃO', 'LINKEDIN', 'GITHUB', 'VAGA', 'INDICAÇÃO',
  'RESUMO PROFISSIONAL', 'PAPEL PRINCIPAL', 'SENIORIDADE', 'TEMPO DE EXPERIÊNCIA',
  'NÍVEL DE INGLÊS', 'OUTRO IDIOMA',
  'POSSUI CNPJ', 'REGIME FISCAL', 'CASE DE SUCESSO',
  'STATUS', 'ID DA CANDIDATURA', 'DATA DE CANDIDATURA', 'ÚLTIMA ATUALIZAÇÃO',
];
const SECOES = ['Informações Pessoais', 'Perfil Profissional', 'Habilidades',
  'Situação Fiscal e Cases', 'Informações do Sistema'];
/** Campos que são endereço: a quebra de linha do PDF cai no meio da URL, e um
 *  espaço ali quebraria o link. Nos demais a quebra é de palavra, e o espaço
 *  que o PDF comeu no fim da linha precisa voltar. */
const SEM_ESPACO = new Set(['LINKEDIN', 'GITHUB']);

/** O texto do PDF, uma linha por linha impressa. */
async function linhasDoPdf(caminho) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(caminho)),
    useSystemFonts: true,
  }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const conteudo = await (await doc.getPage(p)).getTextContent();
    let atual = '';
    let ultimoY = null;
    for (const item of conteudo.items) {
      if (!('str' in item)) continue;
      const y = Math.round(item.transform[5]);
      if (ultimoY !== null && Math.abs(y - ultimoY) > 2) { linhas.push(atual); atual = ''; }
      atual += item.str;
      ultimoY = y;
    }
    if (atual) linhas.push(atual);
  }
  return linhas.map(l => l.trim()).filter(Boolean);
}

/** "03/01/2001" e "04/02/2026 14:33" viram ISO - é como o portal guarda data. */
function paraIso(br) {
  if (!br) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/.exec(br.trim());
  if (!m) return null;
  const [, d, mes, a, h, min] = m;
  return h ? `${a}-${mes}-${d}T${h}:${min}:00.000Z` : `${a}-${mes}-${d}`;
}

/** "Ponte Nova, Minas Gerais (MG)" -> cidade, estado e sigla. */
function separarLocal(v) {
  if (!v) return { cidade: null, estado: null, uf: null };
  const m = /^(.+?),\s*(.+?)\s*\(([A-Z]{2})\)$/.exec(v.trim());
  if (!m) return { cidade: v.trim(), estado: null, uf: null };
  return { cidade: m[1].trim(), estado: m[2].trim(), uf: m[3] };
}

/** A indicação vem como nome e, às vezes, o e-mail na linha de baixo. */
function separarIndicacao(v) {
  if (!v) return { nome: null, email: null };
  const linhas = v.split('\n').map(l => l.trim()).filter(Boolean);
  const email = linhas.find(l => l.includes('@')) ?? null;
  const nome = linhas.find(l => !l.includes('@')) ?? null;
  return { nome, email: email ? email.toLowerCase() : null };
}

/** "Lista de Espera" na primeira linha, "Remoto • PJ" na segunda. */
function separarVaga(v) {
  if (!v) return { vaga: null, modelo: null, contratacao: null };
  const [vaga, modo] = v.split('\n').map(l => l.trim());
  const partes = (modo ?? '').split('•').map(p => p.trim()).filter(Boolean);
  return { vaga: vaga || null, modelo: partes[0] ?? null, contratacao: partes[1] ?? null };
}

/** As habilidades vêm como um JSON impresso, que a impressão quebrou em linhas. */
function lerHabilidades(bruto) {
  if (!bruto) return [];
  try {
    const lista = JSON.parse(bruto);
    if (!Array.isArray(lista)) return [];
    return lista
      .map(h => ({
        nome: String(h?.nome ?? '').replace(/\s+/g, ' ').trim(),
        tempo: h?.tempo ? String(h.tempo).replace(/\s+/g, ' ').trim() : null,
        nivel: Number.isFinite(Number(h?.nivel)) ? Number(h.nivel) : null,
      }))
      .filter(h => h.nome);
  } catch {
    return [];
  }
}

export async function lerCandidaturas(pasta) {
  const arquivos = readdirSync(pasta).filter(f => f.toLowerCase().endsWith('.pdf')).sort();
  const registros = [];
  for (const arquivo of arquivos) {
    const linhas = await linhasDoPdf(join(pasta, arquivo));
    const campos = {};
    let atual = null;
    let habilidades = '';
    let emHabilidades = false;
    for (const l of linhas) {
      if (l.startsWith('Documento gerado automaticamente') || l.startsWith('Data de exportação:')
        || l.startsWith('Exportado em ') || l.startsWith('Candidatura - ')) continue;
      if (SECOES.includes(l)) { emHabilidades = l === 'Habilidades'; atual = null; continue; }
      if (ROTULOS.includes(l)) { emHabilidades = false; atual = l; campos[l] = []; continue; }
      if (emHabilidades) { habilidades += (habilidades ? ' ' : '') + l; continue; }
      if (atual) campos[atual].push(l);
    }
    const v = r => {
      const partes = campos[r];
      if (!partes?.length) return null;
      // Rótulo de bloco (resumo, case) guarda os parágrafos; o resto é uma linha
      // só que a impressão quebrou.
      const junto = SEM_ESPACO.has(r) ? partes.join('') : partes.join(' ');
      return junto.replace(/\s+/g, ' ').trim() || null;
    };
    const local = separarLocal(v('LOCALIZAÇÃO'));
    const indicacao = separarIndicacao((campos['INDICAÇÃO'] ?? []).join('\n'));
    const vaga = separarVaga((campos['VAGA'] ?? []).join('\n'));
    registros.push({
      arquivo,
      nome: v('NOME COMPLETO'),
      email: (v('E-MAIL') ?? '').toLowerCase() || null,
      telefone: v('TELEFONE / WHATSAPP'),
      nascimento: paraIso(v('DATA DE NASCIMENTO')),
      sexo: v('SEXO'),
      ...local,
      linkedin: v('LINKEDIN'),
      github: v('GITHUB'),
      ...vaga,
      indicado_por: indicacao.nome,
      indicado_por_email: indicacao.email,
      resumo: v('RESUMO PROFISSIONAL'),
      papel: v('PAPEL PRINCIPAL'),
      senioridade: v('SENIORIDADE'),
      experiencia: v('TEMPO DE EXPERIÊNCIA'),
      ingles: v('NÍVEL DE INGLÊS'),
      outro_idioma: v('OUTRO IDIOMA'),
      possui_cnpj: v('POSSUI CNPJ') === 'Sim' ? 1 : 0,
      regime_fiscal: v('REGIME FISCAL'),
      case_sucesso: v('CASE DE SUCESSO'),
      status_origem: v('STATUS'),
      id_origem: (v('ID DA CANDIDATURA') ?? '').replace('#', '') || null,
      candidatura_em: paraIso(v('DATA DE CANDIDATURA')),
      atualizado_origem_em: paraIso(v('ÚLTIMA ATUALIZAÇÃO')),
      habilidades: lerHabilidades(habilidades),
    });
  }
  return registros;
}

// Chamado direto pela linha de comando: mostra o que leu.
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const pasta = process.argv[2];
  if (!pasta) { console.error('Uso: node scripts/ler-candidaturas.mjs "<pasta>" [--json]'); process.exit(1); }
  const registros = await lerCandidaturas(pasta);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(registros, null, 1));
  } else {
    for (const r of registros) {
      console.log(`\n#${r.id_origem} ${r.nome} <${r.email}>`);
      console.log(`   ${r.papel} | ${r.senioridade} | ${r.experiencia} | inglês ${r.ingles}`);
      console.log(`   ${[r.cidade, r.uf].filter(Boolean).join('/')} | ${r.modelo ?? '-'} ${r.contratacao ?? ''} | CNPJ ${r.possui_cnpj ? 'sim' : 'não'}${r.regime_fiscal ? ' (' + r.regime_fiscal + ')' : ''}`);
      console.log(`   habilidades: ${r.habilidades.map(h => `${h.nome} ${h.nivel ?? '?'}/5`).join(', ') || '-'}`);
      if (r.indicado_por) console.log(`   indicado por ${r.indicado_por}${r.indicado_por_email ? ' <' + r.indicado_por_email + '>' : ''}`);
    }
    console.log(`\n${registros.length} candidaturas lidas.`);
  }
}
