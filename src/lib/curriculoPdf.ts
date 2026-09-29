// ─────────────────────────────────────────────────────────────────────────────
//  O currículo da pessoa, em PDF, a partir do que o portal já sabe.
//
//  O banco de talentos não guarda o arquivo que a pessoa mandou: guarda o que
//  ela respondeu - o resumo que escreveu, as habilidades que declarou, as notas
//  que a casa deu e os dados de contato. O currículo sai daí, montado na hora.
//
//  A razão de existir é a conversa que vem depois da análise de vaga: quem vai
//  entrevistar precisa levar a ficha junto, e copiar campo a campo da tela para
//  um documento é o trabalho que este arquivo poupa.
//
//  Usa o mesmo gerador do contrato (`lib/pdf`), então sai sem dependência nova
//  e com a tipografia da casa.
// ─────────────────────────────────────────────────────────────────────────────
import type { Paragrafo, Trecho } from './docx';
import { gerarPdf, baixarPdf } from './pdf';

/** O que o currículo mostra. Tudo opcional menos o nome: interessado cadastrado
 *  à mão no portal tem quase nada disto, e a folha se ajusta ao que existe. */
export interface DadosDoCurriculo {
  nome: string;
  email?: string | null;
  telefone?: string | null;
  cidade?: string | null;
  uf?: string | null;
  linkedin?: string | null;
  github?: string | null;
  senioridade?: string | null;
  tempo_experiencia?: string | null;
  nivel_ingles?: string | null;
  outro_idioma?: string | null;
  modelo_trabalho?: string | null;
  contratacao?: string | null;
  vaga?: string | null;
  resumo?: string | null;
  case_sucesso?: string | null;
  /** O que a pessoa declarou saber, com o tempo de uso. */
  habilidades?: { nome: string; tempo?: string | null; nivel?: number | null }[];
  /** As notas da casa, já com o nome da competência. */
  competencias?: { nome: string; nota: number }[];
}

const TITULO = 16;
const SECAO = 12;

const linha = (trechos: Trecho[], extra: Partial<Paragrafo> = {}): Paragrafo => ({ trechos, ...extra });
const vazio = (): Paragrafo => ({ trechos: [{ texto: '' }], depois: 2 });

/** Um rótulo e um valor na mesma linha - "Senioridade: Pleno". Sem valor, a
 *  linha não existe: uma folha cheia de "-" conta menos que uma folha curta. */
function campo(rotulo: string, valor: string | null | undefined): Paragrafo[] {
  const v = String(valor ?? '').trim();
  if (!v) return [];
  return [linha([{ texto: `${rotulo}: `, negrito: true }, { texto: v }], { depois: 2 })];
}

function secao(titulo: string): Paragrafo[] {
  return [vazio(), linha([{ texto: titulo.toUpperCase(), negrito: true }], { depois: 4 })];
}

/** O texto corrido vira um parágrafo por linha escrita: o resumo chega com as
 *  quebras que a pessoa deu, e juntá-las num bloco só apagaria a estrutura que
 *  ela usou para se apresentar. */
function corrido(texto: string | null | undefined): Paragrafo[] {
  return String(texto ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => linha([{ texto: l }], { alinhamento: 'justificado' }));
}

export function paragrafosDoCurriculo(d: DadosDoCurriculo): Paragrafo[] {
  const onde = [d.cidade, d.uf].filter(Boolean).join(' - ');
  const contato = [d.email, d.telefone, onde].map(x => String(x ?? '').trim()).filter(Boolean);
  const links = [d.linkedin, d.github].map(x => String(x ?? '').trim()).filter(Boolean);

  const p: Paragrafo[] = [
    linha([{ texto: d.nome, negrito: true }], { entrelinha: TITULO + 6, depois: 4 }),
  ];
  if (contato.length) p.push(linha([{ texto: contato.join('  ·  ') }], { depois: 2 }));
  if (links.length) p.push(linha([{ texto: links.join('  ·  ') }], { depois: 2 }));

  const perfil = [
    ...campo('Senioridade', d.senioridade),
    ...campo('Experiência', d.tempo_experiencia),
    ...campo('Inglês', d.nivel_ingles),
    ...campo('Outro idioma', d.outro_idioma),
    ...campo('Modelo de trabalho', d.modelo_trabalho),
    ...campo('Contratação', d.contratacao),
    ...campo('Vaga de interesse', d.vaga),
  ];
  if (perfil.length) p.push(...secao('Perfil'), ...perfil);

  if (String(d.resumo ?? '').trim()) p.push(...secao('Resumo'), ...corrido(d.resumo));

  const hab = (d.habilidades ?? []).filter(h => h.nome?.trim());
  if (hab.length) {
    p.push(...secao('Habilidades'));
    for (const h of hab) {
      const detalhe = [h.tempo, h.nivel ? `nível ${h.nivel} de 5` : null]
        .map(x => String(x ?? '').trim()).filter(Boolean).join(', ');
      p.push(linha([{ texto: `- ${h.nome}${detalhe ? ` (${detalhe})` : ''}` }], { depois: 2 }));
    }
  }

  const comp = (d.competencias ?? []).filter(c => c.nome?.trim());
  if (comp.length) {
    // A avaliação é da casa, e a folha diz isso: o número sem a origem leria
    // como autoavaliação, que é o que as habilidades já são.
    p.push(...secao('Avaliação da Sheep'));
    for (const c of comp) p.push(linha([{ texto: `- ${c.nome}: ${c.nota} de 10` }], { depois: 2 }));
  }

  if (String(d.case_sucesso ?? '').trim()) {
    p.push(...secao('Case que ela contou'), ...corrido(d.case_sucesso));
  }

  p.push(vazio(), linha([{ texto: `Ficha gerada pelo Portal Sheep em ${hoje()}.` }], { depois: 0 }));
  return p;
}

function hoje(): string {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** O nome do arquivo: o da pessoa, sem acento e sem o que o sistema de arquivos
 *  recusa. */
export function nomeDoArquivo(nome: string): string {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return `curriculo-${limpo || 'profissional'}.pdf`;
}

/** Monta e baixa. Um passo só, porque é sempre isto que se quer. */
export function baixarCurriculo(d: DadosDoCurriculo): void {
  baixarPdf(gerarPdf({ paragrafos: paragrafosDoCurriculo(d) }), nomeDoArquivo(d.nome));
}
