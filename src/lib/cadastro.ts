// ─────────────────────────────────────────────────────────────────────────────
//  Dados cadastrais de uma pessoa da casa: os campos, como cada um aparece e a
//  ficha exportada. A pessoa preenche no Perfil; o administrador lê na ficha
//  aberta pela tela de Usuários. Os dois leem daqui, para os nomes e a ordem
//  dos campos não se separarem com o tempo.
//
//  Os nomes dos campos são os mesmos que o servidor confere em
//  `CAMPOS_DO_CADASTRO` (api/_admin-handler.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { mascaraCep, mascaraCnpj, mascaraCpf, mascaraRg, mascaraTelefone } from './mascaras';
import { baixar, baixarXlsx, celulaCsv, escHtml, imprimirHtml } from './exportarTarefas';

export const CAMPOS = [
  'nome_completo', 'data_nascimento', 'cpf', 'rg', 'nacionalidade', 'estado_civil',
  'celular', 'email_pessoal',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
  'cnpj', 'razao_social',
  'pix_tipo', 'pix_chave',
  'emergencia_nome', 'emergencia_parentesco', 'emergencia_telefone',
] as const;
export type CampoCadastro = typeof CAMPOS[number];
export type Cadastro = Record<CampoCadastro, string>;

export const VAZIO = Object.fromEntries(CAMPOS.map(c => [c, ''])) as Cadastro;

/** Vão gravados só com os dígitos; na tela, com a máscara. */
export const SO_DIGITOS: CampoCadastro[] = ['cpf', 'cnpj', 'cep', 'celular', 'emergencia_telefone'];

export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'União estável', 'Divorciado(a)', 'Separado(a)', 'Viúvo(a)'];

export const TIPOS_PIX = [
  { valor: 'cpf', label: 'CPF' },
  { valor: 'cnpj', label: 'CNPJ' },
  { valor: 'celular', label: 'Celular' },
  { valor: 'email', label: 'E-mail' },
  { valor: 'aleatoria', label: 'Chave aleatória' },
];

/** Os blocos do cadastro, na ordem do formulário, com o rótulo de cada campo. */
export const SECOES: { titulo: string; campos: [CampoCadastro, string][] }[] = [
  { titulo: 'Dados pessoais', campos: [
    ['nome_completo', 'Nome completo'], ['data_nascimento', 'Nascimento'], ['cpf', 'CPF'], ['rg', 'RG'],
    ['nacionalidade', 'Nacionalidade'], ['estado_civil', 'Estado civil'],
  ] },
  { titulo: 'Contato', campos: [['celular', 'Celular / WhatsApp'], ['email_pessoal', 'E-mail pessoal']] },
  { titulo: 'Endereço', campos: [
    ['cep', 'CEP'], ['logradouro', 'Logradouro'], ['numero', 'Número'], ['complemento', 'Complemento'],
    ['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'Estado'],
  ] },
  { titulo: 'Empresa', campos: [['cnpj', 'CNPJ'], ['razao_social', 'Razão social']] },
  { titulo: 'Recebimento', campos: [['pix_tipo', 'Tipo de chave PIX'], ['pix_chave', 'Chave PIX']] },
  { titulo: 'Contato de emergência', campos: [
    ['emergencia_nome', 'Nome'], ['emergencia_parentesco', 'Parentesco'], ['emergencia_telefone', 'Telefone'],
  ] },
];

/** "1990-03-15" vira "15/03/1990"; o que não for data passa como veio. */
export const isoParaData = (v: string) =>
  (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v.slice(8)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v);

/** A chave PIX com a máscara do tipo dela. E-mail e chave aleatória vão crus. */
export function mascaraPix(tipo: string, v: string): string {
  if (tipo === 'cpf') return mascaraCpf(v);
  if (tipo === 'cnpj') return mascaraCnpj(v);
  if (tipo === 'celular') return mascaraTelefone(v);
  return v;
}

/** O que veio do servidor, do jeito que a tela mostra. */
export function paraTela(dados: Partial<Record<string, unknown>> | null | undefined): Cadastro {
  const c = { ...VAZIO };
  for (const k of CAMPOS) c[k] = String(dados?.[k] ?? '');
  c.cpf = mascaraCpf(c.cpf);
  c.cnpj = mascaraCnpj(c.cnpj);
  c.cep = mascaraCep(c.cep);
  c.rg = mascaraRg(c.rg);
  c.celular = mascaraTelefone(c.celular);
  c.emergencia_telefone = mascaraTelefone(c.emergencia_telefone);
  c.data_nascimento = isoParaData(c.data_nascimento);
  c.pix_chave = mascaraPix(c.pix_tipo, c.pix_chave);
  return c;
}

/** O valor para ler, já formatado: o tipo de PIX pelo nome, e não pelo código. */
export function valorLegivel(c: Cadastro, campo: CampoCadastro): string {
  if (campo === 'pix_tipo') return TIPOS_PIX.find(t => t.valor === c.pix_tipo)?.label ?? c.pix_tipo;
  return c[campo];
}

// ── A ficha exportada ───────────────────────────────────────────────────────

export interface PessoaDaFicha {
  nome: string;
  email: string;
  papel: string;
}
export type FormatoFicha = 'pdf' | 'xlsx' | 'csv';

/** "ficha-cadastral-rafael-moura.pdf" */
function nomeDoArquivo(p: PessoaDaFicha, ext: string): string {
  const base = p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pessoa';
  return `ficha-cadastral-${base}.${ext}`;
}

/** Uma linha por campo: bloco, campo e valor. É o que a planilha leva. */
function linhasDaFicha(p: PessoaDaFicha, c: Cadastro): string[][] {
  const linhas: string[][] = [
    ['Conta', 'Nome no portal', p.nome],
    ['Conta', 'E-mail da conta', p.email],
    ['Conta', 'Papel', p.papel],
  ];
  for (const s of SECOES) for (const [campo, rotulo] of s.campos) linhas.push([s.titulo, rotulo, valorLegivel(c, campo)]);
  return linhas;
}

/** Baixa a ficha no formato pedido. O PDF sai pela impressão do navegador. */
export function exportarFicha(formato: FormatoFicha, p: PessoaDaFicha, c: Cadastro, atualizadoEm: string | null) {
  if (formato === 'csv') {
    const corpo = [['Bloco', 'Campo', 'Valor'], ...linhasDaFicha(p, c)]
      .map(l => l.map(celulaCsv).join(';')).join('\r\n');
    baixar('﻿' + corpo, nomeDoArquivo(p, 'csv'), 'text/csv;charset=utf-8');
    return;
  }
  if (formato === 'xlsx') {
    baixarXlsx([['Bloco', 'Campo', 'Valor'], ...linhasDaFicha(p, c)], [24, 22, 48], 'Ficha cadastral', nomeDoArquivo(p, 'xlsx'));
    return;
  }
  const quando = atualizadoEm
    ? `Atualizada pela pessoa em ${new Date(atualizadoEm).toLocaleString('pt-BR')}`
    : 'Cadastro ainda não preenchido';
  const blocos = SECOES.map(s => `<section><h2>${escHtml(s.titulo)}</h2><dl>${
    s.campos.map(([campo, rotulo]) =>
      `<div><dt>${escHtml(rotulo)}</dt><dd>${escHtml(valorLegivel(c, campo)) || '<span class="vazio">-</span>'}</dd></div>`).join('')
  }</dl></section>`).join('');
  imprimirHtml(nomeDoArquivo(p, 'pdf').replace(/\.pdf$/, ''), `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { margin:0; font-family: Calibri, 'Segoe UI', system-ui, sans-serif; color:#000; font-size:10.5pt; }
h1 { font-size:18pt; margin:0 0 1mm; }
.sub { margin:0 0 8mm; font-size:8.5pt; color:#6E6E6E; }
section { margin-bottom:6mm; break-inside:avoid; }
h2 { font-size:11pt; margin:0 0 2mm; padding-bottom:1.5mm; border-bottom:2px solid #000; }
dl { display:grid; grid-template-columns:1fr 1fr; gap:2.5mm 8mm; margin:0; }
dt { font-size:7.5pt; letter-spacing:.08em; text-transform:uppercase; color:#6E6E6E; }
dd { margin:.5mm 0 0; font-size:10.5pt; }
.vazio { color:#A8A8A8; }
`, `<h1>${escHtml(c.nome_completo || p.nome)}</h1>`
    + `<p class="sub">Ficha cadastral · ${escHtml(p.email)} · ${escHtml(p.papel)} · ${escHtml(quando)}</p>`
    + blocos);
}
