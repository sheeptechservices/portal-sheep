// ─────────────────────────────────────────────────────────────────────────────
//  O painel de chamados do cliente (`/chamados/<token>`).
//
//  O cliente abre chamados num projeto e acompanha o andamento deles, sem
//  login: o link é a credencial. Cada chamado cai no quadro do time como uma
//  tarefa na Triagem, e daqui ele vê só o que escreveu - título, descrição,
//  anexos, quem pediu e a urgência - e o status, que vem sozinho da etapa da
//  tarefa. Comentário, etiqueta e conversa do time não descem.
//
//  Mora fora de `src/admin`, e nada daqui importa de lá: quem abre este link não
//  baixa o código do portal.
//
//  A tela: os números do alto (que também filtram), a busca e os filtros, e a
//  fila em tabela, no desenho dos chamados de dentro. Abrir um chamado é o
//  gesto de um clique: o formulário fecha na hora e a linha nasce na fila com
//  o que a pessoa escreveu; o número chega quando o servidor responde.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  IconAlert, IconChevronRight, IconDoc, IconEdit, IconExternal, IconImage, IconImagemSem, IconLink, IconPlus,
  IconSpinner, IconTrash, IconUndo, IconUpload, IconX,
} from '../components/icons';
import { CampoBusca } from '../components/CampoBusca';
import FilterDropdown from '../components/FilterDropdown';
import { SelectSistema } from '../components/SelectSistema';
import { CampoTexto } from '../components/CampoTexto';
import { TextoRico } from '../components/TextoRico';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { ContaAnimada } from '../components/ContaAnimada';
import { ThOrdem, type OrdemDaTabela } from '../components/ThOrdem';
import { ICONE_PRIORIDADE, PRIORIDADES, posicaoDaPrioridade } from '../lib/prioridades';
import { dia, instante, tempoRelativo, tamanho as fmtTamanho } from '../lib/datas';
import { contemTermo } from '../lib/texto';
import { DESCRICAO_DO_TIPO, ROTULO_DO_TIPO, TIPOS_DO_RELATO } from '../lib/tiposDoRelato';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { iniciarOndas } from '../lib/ondas';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { useDicaRica } from '../components/DicaRica';

type Grupo = 'triagem' | 'andamento' | 'concluido' | 'cancelado';

/** `ordem` é a posição do arquivo no chamado: é por ela que ele se pede.
 *  `reabertura` é a reabertura em que ele veio; nulo, veio na abertura. */
interface Anexo {
  ordem: number; nome: string; tipo: string; tamanho: number; base64?: string; reabertura?: number | null;
}

/** Uma reabertura do chamado, com o que o cliente escreveu nela. `seq` nulo é
 *  a que ainda está indo para o servidor. */
interface Reabertura { em: string; seq: number | null; autor: string; texto: string; links: string[] }

/** Os campos que o cliente pode corrigir depois de enviar. */
type CampoAjustavel = 'titulo' | 'descricao' | 'solicitante' | 'urgencia' | 'tipo';
const CAMPOS_AJUSTAVEIS: CampoAjustavel[] = ['titulo', 'descricao', 'solicitante', 'urgencia', 'tipo'];
type Versao = Record<CampoAjustavel, string>;

/** Uma correção do chamado, só com o que mudou nela. `seq` nulo é a que ainda
 *  está indo para o servidor. */
interface Ajuste { seq: number | null; em: string; mudou: Partial<Versao> }

interface Chamado {
  /** A chave da linha: o número no projeto, ou um provisório negativo enquanto
   *  o chamado ainda vai para o servidor. Nenhum id interno chega aqui. */
  id: number;
  /** O número do chamado dentro do projeto (#1, #2...). */
  numero: number | null;
  titulo: string;
  descricao: string;
  solicitante: string;
  urgencia: string;
  /** 'bug' ou 'melhoria'. Nulo no chamado gravado antes de o tipo existir. */
  tipo: string | null;
  criado_em: string;
  status: string;
  /** A previsão de entrega: o prazo da tarefa do time, só o dia. Nula enquanto
   *  o time não marcou um prazo. */
  previsao?: string | null;
  cor: string;
  grupo: Grupo;
  links: string[];
  anexos: Anexo[];
  reaberturas: Reabertura[];
  /** As correções, da mais antiga para a mais nova. Título, descrição, quem
   *  pediu e urgência acima são os do envio original. */
  ajustes: Ajuste[];
  /** O que o time escreveu para o cliente, da mais antiga para a mais nova.
   *  Sem autor: para o cliente, quem responde é o time. */
  respostas?: { seq: number; em: string; texto: string; editado?: boolean }[];
  /** Ainda indo para o servidor: a linha já está na fila, sem o número. */
  enviando?: boolean;
  /** A reabertura ainda indo para o servidor. */
  reabrindo?: boolean;
  /** Uma correção ainda indo para o servidor. */
  ajustando?: boolean;
}

/** O envio como foi feito. O tipo vazio é o do chamado antigo, sem um. */
function versaoOriginal(c: Chamado): Versao {
  return { titulo: c.titulo, descricao: c.descricao, solicitante: c.solicitante, urgencia: c.urgencia, tipo: c.tipo ?? '' };
}

/** A versão que vale agora: o envio original com as correções por cima, na
 *  ordem em que vieram. */
function versaoEmVigor(c: Chamado): Versao {
  const v = versaoOriginal(c);
  for (const a of c.ajustes ?? []) for (const k of CAMPOS_AJUSTAVEIS) if (a.mudou[k] != null) v[k] = a.mudou[k]!;
  return v;
}

/** O chamado como a tabela mostra: título, tipo, quem pediu e urgência já na
 *  versão em vigor, que é o que filtra e ordena. A descrição fica a original,
 *  porque o detalhe a mostra como foi enviada e as correções embaixo dela. */
interface ChamadoNaTela extends Chamado { original: Versao; descricaoEmVigor: string }
function naTela(c: Chamado): ChamadoNaTela {
  const original = versaoOriginal(c);
  const v = versaoEmVigor(c);
  return {
    ...c, titulo: v.titulo, solicitante: v.solicitante, urgencia: v.urgencia, tipo: v.tipo || null,
    original, descricaoEmVigor: v.descricao,
  };
}

interface Dados {
  projeto: { nome: string; cliente: string | null };
  etapas: { nome: string; cor: string; grupo: Grupo }[];
  chamados: Chamado[];
}

/** O recorte dos números do alto. "Abertos" junta triagem e andamento. */
type Recorte = 'abertos' | Grupo;

/** As colunas que ordenam. */
type Coluna = 'numero' | 'titulo' | 'tipo' | 'urgencia' | 'anexos' | 'status' | 'previsao' | 'solicitante' | 'aberto';
/** A fila abre do mais novo para o mais velho: é a pergunta de quem volta ao
 *  painel - o que eu pedi por último e como ele está. */
const ORDEM_PADRAO: OrdemDaTabela<Coluna> = { col: 'aberto', dir: 'desc' };

const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ANEXOS = 5;
/** A soma tem teto: o corpo da requisição na Vercel para em 4,5 MB. */
const LIMITE_SOMA = 4 * 1024 * 1024;
/** Os nomes já usados ficam lembrados neste navegador, com o e-mail de cada um:
 *  quem abre um chamado costuma abrir outros, e redigitar o nome a cada vez é
 *  atrito à toa. A chave leva o token do painel, então cada projeto tem a sua
 *  lista: um nome digitado no painel de um cliente nunca aparece no de outro,
 *  mesmo que os dois sejam abertos no mesmo computador. */
const chaveDosNomes = (token: string) => `sheep_chamados_nomes:${token}`;
/** A chave de antes, uma só para todos os painéis: o nome digitado num projeto
 *  vinha preenchido no de outro cliente. É apagada ao abrir qualquer painel, e
 *  o que ela guardava não é aproveitado, porque não diz de qual projeto era. */
const CHAVE_ANTIGA = 'sheep_chamados_quem';
const MAX_NOMES = 12;

interface NomeLembrado { nome: string; email: string }

const chaveDoNome = (n: string) => n.trim().toLocaleLowerCase('pt-BR');

function lerNomes(token: string): NomeLembrado[] {
  try {
    const v = JSON.parse(localStorage.getItem(chaveDosNomes(token)) ?? '[]');
    return (Array.isArray(v) ? v : [])
      .filter((n: unknown): n is NomeLembrado => typeof (n as NomeLembrado)?.nome === 'string')
      .map(n => ({ nome: n.nome.slice(0, 80), email: String(n.email ?? '').slice(0, 120) }))
      .slice(0, MAX_NOMES);
  } catch { return []; }
}

/** Põe o nome no topo da lista do projeto. O e-mail só é trocado quando vem
 *  um: reabrir não pede e-mail, e não pode apagar o que já estava guardado. */
function lembrarNome(token: string, nome: string, email?: string): NomeLembrado[] {
  const limpo = nome.trim();
  const antes = lerNomes(token);
  if (limpo.length < 2) return antes;
  const anterior = antes.find(n => chaveDoNome(n.nome) === chaveDoNome(limpo));
  const lista = [
    { nome: limpo, email: (email ?? anterior?.email ?? '').trim() },
    ...antes.filter(n => n !== anterior),
  ].slice(0, MAX_NOMES);
  try { localStorage.setItem(chaveDosNomes(token), JSON.stringify(lista)); } catch { /* sem armazenamento */ }
  return lista;
}
/** De quanto em quanto tempo a fila confere o status, com a aba à vista. */
const ATUALIZAR_MS = 60_000;

interface Rascunho {
  titulo: string;
  descricao: string;
  urgencia: string;
  solicitante: string;
  /** 'bug' ou 'melhoria'. Vazio até a pessoa escolher, e sem ele não se envia. */
  tipo: string;
  links: string[];
  anexos: Anexo[];
}

/** O que se manda ao reabrir: por que, quem, e o que vem junto. */
interface RascunhoDeReabertura { texto: string; autor: string; links: string[]; anexos: Anexo[] }

/** A correção: a versão nova dos quatro campos, e quem está corrigindo. */
/** A edição: a versão nova dos campos. Sem nome de quem editou: o painel
 *  não guarda quem fez cada edição, só o que mudou. */
type RascunhoDeAjuste = Versao;

/** Até quantos links por envio. O servidor confere de novo. */
const MAX_LINKS = 5;

/** O formulário já nasce com o último nome usado neste projeto: na maioria das
 *  vezes é a mesma pessoa, e a lista fica a um clique para quando não é. */
const rascunhoVazio = (token: string): Rascunho => {
  const ultimo = lerNomes(token)[0];
  return {
    titulo: '', descricao: '', urgencia: 'Média', solicitante: ultimo?.nome ?? '', tipo: '',
    links: [], anexos: [],
  };
};
const reaberturaVazia = (token: string): RascunhoDeReabertura => ({
  texto: '', autor: lerNomes(token)[0]?.nome ?? '', links: [], anexos: [],
});

/** O endereço como se lê: o domínio e o começo do caminho. */
function rotuloDoLink(url: string): string {
  try {
    const u = new URL(url);
    const caminho = u.pathname === '/' ? '' : u.pathname;
    const curto = `${u.hostname.replace(/^www\./, '')}${caminho}`;
    return curto.length > 48 ? `${curto.slice(0, 47)}…` : curto;
  } catch { return url; }
}

export default function ChamadosDoCliente({ token }: { token: string }) {
  const base = `/api/projeto-publico?modo=chamados&token=${encodeURIComponent(token)}`;
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [recorte, setRecorte] = useState<Recorte | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string[]>([]);
  const [filtroUrgencia, setFiltroUrgencia] = useState<string[]>([]);
  const [filtroQuem, setFiltroQuem] = useState<string[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [ordem, setOrdem] = useState<OrdemDaTabela<Coluna>>(ORDEM_PADRAO);
  const [vendo, setVendo] = useState<{ chamado: Chamado; indice: number } | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoVazio(token));
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  /** O chamado que está sendo reaberto, e o rascunho da reabertura. */
  const [reabrindo, setReabrindo] = useState<number | null>(null);
  const [reabertura, setReabertura] = useState<RascunhoDeReabertura>(() => reaberturaVazia(token));
  const [erroReabertura, setErroReabertura] = useState<string | null>(null);
  /** O chamado que está sendo corrigido, e o rascunho da correção. O rascunho
   *  nasce da versão em vigor quando o formulário abre. */
  const [ajustandoNumero, setAjustandoNumero] = useState<number | null>(null);
  const [rascunhoDeAjuste, setRascunhoDeAjuste] = useState<RascunhoDeAjuste | null>(null);
  const [erroAjuste, setErroAjuste] = useState<string | null>(null);
  /** Os nomes que este navegador já usou neste painel. */
  const [lembrados, setLembrados] = useState<NomeLembrado[]>(() => lerNomes(token));

  useEffect(() => {
    try { localStorage.removeItem(CHAVE_ANTIGA); } catch { /* sem armazenamento */ }
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(base);
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErro(d?.error ?? 'Não foi possível abrir o painel.'); return; }
      // Os chamados ainda a caminho do servidor continuam na fila: a leitura
      // de fundo não sabe deles, e apagá-los faria a linha piscar.
      const lidos = ((d as Dados).chamados ?? []).map(c => ({ ...c, id: Number(c.numero) }));
      setDados(atual => ({
        ...(d as Dados),
        chamados: [...(atual?.chamados.filter(c => c.enviando) ?? []), ...lidos],
      }));
      setErro(null);
    } catch {
      setErro('A conexão falhou. Tente recarregar a página.');
    }
  }, [base]);

  useEffect(() => { void carregar(); }, [carregar]);
  // O status muda por dentro: a fila confere de tempo em tempo, só com a aba à
  // vista, e de novo ao voltar para ela.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void carregar(); }, ATUALIZAR_MS);
    const aoVoltar = () => { if (!document.hidden) void carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [carregar]);

  useEffect(() => {
    if (dados?.projeto.nome) document.title = `Chamados | ${dados.projeto.nome}`;
  }, [dados?.projeto.nome]);

  const chamados = useMemo(() => (dados?.chamados ?? []).map(naTela), [dados?.chamados]);
  const contas = useMemo(() => {
    const por = (g: Grupo) => chamados.filter(c => c.grupo === g).length;
    return {
      total: chamados.length,
      triagem: por('triagem'),
      andamento: por('andamento'),
      concluido: por('concluido'),
      cancelado: por('cancelado'),
    };
  }, [chamados]);

  const visiveis = useMemo(() => chamados.filter(c => {
    if (recorte === 'abertos' && c.grupo !== 'triagem' && c.grupo !== 'andamento') return false;
    if (recorte && recorte !== 'abertos' && c.grupo !== recorte) return false;
    if (filtroStatus.length && !filtroStatus.includes(c.status)) return false;
    if (filtroUrgencia.length && !filtroUrgencia.includes(c.urgencia)) return false;
    if (filtroQuem.length && !filtroQuem.includes(c.solicitante)) return false;
    if (busca.trim() && !contemTermo(`${c.numero ?? ''} ${c.titulo} ${c.descricao} ${c.descricaoEmVigor} ${c.solicitante}`, busca)) return false;
    return true;
  }), [chamados, recorte, filtroStatus, filtroUrgencia, filtroQuem, busca]);

  /** A fila na ordem escolhida no cabeçalho. Urgência e status seguem a escala
   *  da casa, e não o alfabeto: "Baixa" não vem antes de "Urgente", e a etapa
   *  segue a ordem do quadro. O empate cai no mais novo primeiro. */
  const ordenados = useMemo(() => {
    const etapas = (dados?.etapas ?? []).map(e => e.nome);
    const posEtapa = (s: string) => { const i = etapas.indexOf(s); return i < 0 ? etapas.length : i; };
    const chave: Record<Coluna, (c: Chamado) => string | number> = {
      numero: c => c.numero ?? Number.MAX_SAFE_INTEGER,
      titulo: c => c.titulo.toLocaleLowerCase('pt-BR'),
      tipo: c => ROTULO_DO_TIPO[c.tipo ?? '']?.label ?? '~',
      urgencia: c => posicaoDaPrioridade(c.urgencia),
      anexos: c => c.anexos.length,
      status: c => posEtapa(c.status),
      // Sem previsão vai para o fim na ordem crescente, que é a que se usa:
      // o que entrega primeiro em cima, o que ainda não tem data embaixo.
      previsao: c => c.previsao ?? '9999-12-31',
      solicitante: c => c.solicitante.toLocaleLowerCase('pt-BR'),
      aberto: c => c.criado_em,
    };
    const de = chave[ordem.col];
    const sinal = ordem.dir === 'asc' ? 1 : -1;
    return [...visiveis].sort((a, b) => {
      const va = de(a), vb = de(b);
      const comp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return comp * sinal || b.criado_em.localeCompare(a.criado_em);
    });
  }, [visiveis, ordem, dados?.etapas]);
  /** A mesma coluna inverte; outra começa pelo lado que se procura primeiro
   *  nela - o mais novo, o mais urgente, o de mais anexos, de A a Z. */
  const ordenarPor = (col: Coluna) => setOrdem(o => (o.col === col
    ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' }
    : { col, dir: col === 'aberto' || col === 'anexos' || col === 'numero' ? 'desc' : 'asc' }));

  const filtrando = !!(recorte || filtroStatus.length || filtroUrgencia.length || filtroQuem.length || busca.trim());
  function limpar() {
    setRecorte(null); setFiltroStatus([]); setFiltroUrgencia([]); setFiltroQuem([]); setBusca('');
  }

  const opcoesStatus = useMemo(() => {
    const nomes = new Set(chamados.map(c => c.status));
    const daCasa = (dados?.etapas ?? []).map(e => e.nome).filter(n => nomes.has(n));
    const resto = [...nomes].filter(n => !daCasa.includes(n));
    return [...daCasa, ...resto].map(n => ({ value: n, label: n }));
  }, [chamados, dados?.etapas]);
  const opcoesQuem = useMemo(() => [...new Set(chamados.map(c => c.solicitante))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR')).map(n => ({ value: n, label: n })), [chamados]);

  /** O que o campo de nome oferece: primeiro os nomes deste navegador, do mais
   *  recente, com o e-mail de cada um; depois quem já pediu ou reabriu algum
   *  chamado deste projeto, que o colega do lado também pode escolher. As duas
   *  fontes são só deste projeto: a lista do navegador tem a chave pelo token,
   *  e a do servidor sai dos chamados que o próprio token devolve. */
  const sugestoesDeNome = useMemo(() => {
    const porNome = new Map<string, NomeLembrado>();
    for (const n of lembrados) porNome.set(chaveDoNome(n.nome), n);
    const doProjeto = chamados.flatMap(c => [c.solicitante, ...c.reaberturas.map(r => r.autor)])
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const nome of doProjeto) {
      const k = chaveDoNome(nome);
      if (k.length >= 2 && !porNome.has(k)) porNome.set(k, { nome: nome.trim(), email: '' });
    }
    return [...porNome.values()];
  }, [lembrados, chamados]);

  // ── Abrir um chamado ───────────────────────────────────────────────────
  //  O formulário fecha no gesto e a linha nasce na fila com o que foi escrito.
  //  Recusado pelo servidor, a linha sai e o formulário volta com o rascunho e
  //  o motivo.
  async function enviar(r: Rascunho) {
    setLembrados(lembrarNome(token, r.solicitante));
    const entrada = dados?.etapas.find(e => e.grupo === 'triagem');
    const temporario = -Date.now();
    const linha: Chamado = {
      id: temporario, numero: null, titulo: r.titulo.trim(), descricao: r.descricao.trim(),
      solicitante: r.solicitante.trim(), urgencia: r.urgencia, tipo: r.tipo || null,
      criado_em: new Date().toISOString(),
      status: entrada?.nome ?? 'Triagem', cor: entrada?.cor ?? '#8D939B', grupo: 'triagem',
      links: r.links, anexos: r.anexos, enviando: true,
      reaberturas: [],
      ajustes: [],
    };
    setDados(d => d && { ...d, chamados: [linha, ...d.chamados] });
    setRascunho(rascunhoVazio(token));
    setErroEnvio(null);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: linha.titulo, descricao: linha.descricao, urgencia: linha.urgencia,
          solicitante: linha.solicitante, tipo: r.tipo, links: r.links,
          anexos: r.anexos.map(a => ({ nome: a.nome, tipo: a.tipo, base64: a.base64 })),
        }),
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(d?.error ?? 'Não foi possível abrir o chamado. Tente de novo.');
      setDados(atual => atual && {
        ...atual,
        chamados: atual.chamados.map(c => c.id !== temporario ? c : {
          ...c, id: Number(d.numero), numero: Number(d.numero), criado_em: String(d.criado_em),
          status: String(d.status ?? c.status), enviando: false,
          anexos: (d.anexos ?? []).map((a: Anexo) => ({ ...a })),
        }),
      });
    } catch (e) {
      // Desfaz: a linha sai, e o formulário volta com tudo o que tinha.
      setDados(atual => atual && { ...atual, chamados: atual.chamados.filter(c => c.id !== temporario) });
      setRascunho(r);
      setErroEnvio((e as Error).message || 'A conexão falhou. Tente de novo.');
      setFormAberto(true);
    }
  }

  // ── Reabrir um chamado ─────────────────────────────────────────────────
  //  O mesmo gesto do abrir: o formulário fecha, a linha volta para a Triagem
  //  e a reabertura entra no histórico na hora. Recusada, a linha volta ao que
  //  era e o formulário reabre com o rascunho e o motivo.
  async function reabrir(numero: number, r: RascunhoDeReabertura) {
    setLembrados(lembrarNome(token, r.autor));
    const antes = dados?.chamados.find(c => c.numero === numero);
    if (!antes) return;
    const entrada = dados?.etapas.find(e => e.grupo === 'triagem');
    const agora = new Date().toISOString();
    const proximaOrdem = antes.anexos.reduce((m, a) => Math.max(m, a.ordem), 0);
    setDados(d => d && {
      ...d,
      chamados: d.chamados.map(c => c.numero !== numero ? c : {
        ...c,
        status: entrada?.nome ?? 'Triagem', cor: entrada?.cor ?? '#8D939B', grupo: 'triagem', reabrindo: true,
        anexos: [...c.anexos, ...r.anexos.map((a, i) => ({ ...a, ordem: proximaOrdem + i + 1, reabertura: -1 }))],
        reaberturas: [...c.reaberturas, {
          em: agora, seq: null, autor: r.autor.trim(), texto: r.texto.trim(), links: r.links,
        }],
      }),
    });
    setReabertura(reaberturaVazia(token));
    setErroReabertura(null);
    try {
      const resp = await fetch(`${base}&acao=reabrir&chamado=${numero}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texto: r.texto.trim(), autor: r.autor.trim(), links: r.links,
          anexos: r.anexos.map(a => ({ nome: a.nome, tipo: a.tipo, base64: a.base64 })),
        }),
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(d?.error ?? 'Não foi possível reabrir o chamado. Tente de novo.');
      const seq = Number(d.reabertura);
      const vindos: Anexo[] = (d.anexos ?? []).map((a: Anexo) => ({ ...a, reabertura: seq }));
      setDados(atual => atual && {
        ...atual,
        chamados: atual.chamados.map(c => c.numero !== numero ? c : {
          ...c, status: String(d.status ?? c.status), reabrindo: false,
          anexos: [...antes.anexos, ...vindos],
          reaberturas: c.reaberturas.map(ev => ev.seq === null ? { ...ev, seq, em: String(d.em ?? ev.em) } : ev),
        }),
      });
    } catch (e) {
      setDados(atual => atual && {
        ...atual, chamados: atual.chamados.map(c => c.numero !== numero ? c : antes),
      });
      setReabertura(r);
      setErroReabertura((e as Error).message || 'A conexão falhou. Tente de novo.');
      setReabrindo(numero);
    }
  }

  // ── Corrigir um chamado aberto ─────────────────────────────────────────
  //  O mesmo gesto: o formulário fecha, a linha já mostra a versão nova e a
  //  correção aparece dentro do chamado na hora. Recusada, tudo volta ao que
  //  era e o formulário reabre com o rascunho e o motivo.
  function abrirAjuste(c: ChamadoNaTela) {
    const v = versaoEmVigor(c);
    setRascunhoDeAjuste({ ...v });
    setErroAjuste(null);
    setAjustandoNumero(c.numero);
  }

  async function ajustar(numero: number, r: RascunhoDeAjuste) {
    const antes = dados?.chamados.find(c => c.numero === numero);
    if (!antes) return;
    const vigente = versaoEmVigor(antes);
    const mudou: Partial<Versao> = {};
    for (const k of CAMPOS_AJUSTAVEIS) if (r[k].trim() !== vigente[k]) mudou[k] = r[k].trim();
    if (Object.keys(mudou).length === 0) return;
    setDados(d => d && {
      ...d,
      chamados: d.chamados.map(c => c.numero !== numero ? c : {
        ...c, ajustando: true,
        ajustes: [...c.ajustes, { seq: null, em: new Date().toISOString(), mudou }],
      }),
    });
    setRascunhoDeAjuste(null);
    setErroAjuste(null);
    try {
      const resp = await fetch(`${base}&acao=ajustar&chamado=${numero}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: r.titulo.trim(), descricao: r.descricao.trim(), solicitante: r.solicitante.trim(),
          urgencia: r.urgencia, tipo: r.tipo,
        }),
      });
      const d = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(d?.error ?? 'Não foi possível salvar a edição. Tente de novo.');
      setDados(atual => atual && {
        ...atual,
        chamados: atual.chamados.map(c => c.numero !== numero ? c : {
          ...c, ajustando: false,
          ajustes: c.ajustes.map(a => a.seq === null ? { ...a, seq: Number(d.ajuste), em: String(d.em ?? a.em) } : a),
        }),
      });
    } catch (e) {
      setDados(atual => atual && {
        ...atual, chamados: atual.chamados.map(c => c.numero !== numero ? c : antes),
      });
      setRascunhoDeAjuste(r);
      setErroAjuste((e as Error).message || 'A conexão falhou. Tente de novo.');
      setAjustandoNumero(numero);
    }
  }

  /** O conteúdo de um anexo: o que ainda está a caminho do servidor já está
   *  aqui; o resto desce na hora de abrir. */
  async function carregarAnexo(c: Chamado, a: Anexo) {
    if (a.base64) return { tipo: a.tipo, base64: a.base64.split(',').pop() ?? '' };
    if (!c.numero) return null;
    const r = await fetch(`${base}&chamado=${c.numero}&anexo=${a.ordem}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d ? { tipo: String(d.tipo), base64: String(d.base64) } : null;
  }

  if (erro && !dados) {
    return (
      <div className="chm-pagina">
        <FundoDeOndas />
        <div className="chm-centro">
          <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chm-pagina">
      <FundoDeOndas />
      <div className="chm-centro">
        <header className="chm-topo">
          <div className="chm-titulo">
            {/* A assinatura da casa no alto: o cliente sabe de cara de quem é o
                painel. Preta no claro, branca no escuro (ver .brand-logo). */}
            <img src="/logo-sheep.png" alt="Sheep Technology" className="brand-logo chm-marca" />
            <span className="chm-rotulo">Chamados</span>
            {dados ? (
              <h1 className="chm-nome troca" key="nome">{dados.projeto.nome}</h1>
            ) : (
              <span className="chm-nome-vazio" />
            )}
            {dados?.projeto.cliente && <span className="chm-cliente">{dados.projeto.cliente}</span>}
          </div>
          <button type="button" className="btn btn-primary" disabled={!dados}
            onClick={() => { setErroEnvio(null); setFormAberto(true); }}>
            <IconPlus size={15} /> Novo chamado
          </button>
        </header>

        {/* Os números da fila. São também o filtro mais rápido: um clique
            recorta a tabela, outro desfaz. */}
        <div className="chm-numeros">
          <Numero rotulo="Em aberto" valor={contas.triagem + contas.andamento}
            detalhe={`de ${contas.total} ${contas.total === 1 ? 'chamado' : 'chamados'}`}
            ativo={recorte === 'abertos'} onClick={() => setRecorte(r => r === 'abertos' ? null : 'abertos')} />
          <Numero rotulo="Em triagem" valor={contas.triagem} detalhe="aguardando análise do time"
            ativo={recorte === 'triagem'} onClick={() => setRecorte(r => r === 'triagem' ? null : 'triagem')} />
          <Numero rotulo="Em andamento" valor={contas.andamento} detalhe="com o time trabalhando"
            ativo={recorte === 'andamento'} onClick={() => setRecorte(r => r === 'andamento' ? null : 'andamento')} />
          <Numero rotulo="Concluídos" valor={contas.concluido}
            detalhe={contas.cancelado ? `e ${contas.cancelado} ${contas.cancelado === 1 ? 'encerrado' : 'encerrados'} sem execução` : 'resolvidos pelo time'}
            ativo={recorte === 'concluido'} onClick={() => setRecorte(r => r === 'concluido' ? null : 'concluido')} />
        </div>

        {dados && <LegendaDasEtapas etapas={dados.etapas} />}

        <section className="chm-painel">
          <div className="chm-barra">
            <CampoBusca valor={busca} onMudar={setBusca} largura={280}
              placeholder="Buscar por número, título ou descrição" />
            <span className="chm-filtros">
              <FilterDropdown label="Status" values={filtroStatus} options={opcoesStatus} onChange={setFiltroStatus} />
              <FilterDropdown label="Urgência" values={filtroUrgencia}
                options={PRIORIDADES.map(p => ({ value: p, label: p }))} onChange={setFiltroUrgencia} />
              <FilterDropdown label="Solicitante" values={filtroQuem} options={opcoesQuem} onChange={setFiltroQuem} />
            </span>
          </div>

          <div className="chm-tabela-caixa">
            {!dados ? (
              <div className="dux-spinner-row" style={{ padding: 48 }}><span className="dux-spinner" /></div>
            ) : visiveis.length === 0 ? (
              <p className="reportes-vazio surge">
                {chamados.length === 0 ? (
                  <>Nenhum chamado ainda. Use <strong>Novo chamado</strong> para pedir algo ao time.</>
                ) : filtrando && (
                  <>
                    Nenhum chamado para essa busca ou filtro.{' '}
                    <button type="button" className="admin-toolbar-limpar" onClick={limpar}>Limpar</button>
                  </>
                )}
              </p>
            ) : (
              <table className="reportes-tabela chm-tabela">
                <thead>
                  <tr>
                    <ThOrdem col="numero" ordem={ordem} onOrdenar={ordenarPor}>Nº</ThOrdem>
                    <ThOrdem col="titulo" ordem={ordem} onOrdenar={ordenarPor}>Chamado</ThOrdem>
                    <ThOrdem col="tipo" ordem={ordem} onOrdenar={ordenarPor}>Tipo</ThOrdem>
                    <ThOrdem col="urgencia" ordem={ordem} onOrdenar={ordenarPor}>Urgência</ThOrdem>
                    <ThOrdem col="anexos" ordem={ordem} onOrdenar={ordenarPor}>Anexos</ThOrdem>
                    <ThOrdem col="status" ordem={ordem} onOrdenar={ordenarPor}>Status</ThOrdem>
                    <ThOrdem col="previsao" ordem={ordem} onOrdenar={ordenarPor}>Previsão</ThOrdem>
                    <ThOrdem col="solicitante" ordem={ordem} onOrdenar={ordenarPor}>Solicitante</ThOrdem>
                    <ThOrdem col="aberto" ordem={ordem} onOrdenar={ordenarPor}>Aberto em</ThOrdem>
                  </tr>
                </thead>
                {/* A chave é a assinatura do resultado e da ordem: um filtro ou
                    uma ordenação nova remonta as linhas e a entrada toca; a
                    atualização de fundo que só troca um status não reanima
                    nada. */}
                <tbody className="lista-anima"
                  key={`${ordem.col}-${ordem.dir}|${ordenados.filter(c => !c.enviando).map(c => c.id).join(',')}`}>
                  {ordenados.map(c => {
                    const Icone = ICONE_PRIORIDADE[c.urgencia];
                    const abertaAqui = aberta === c.id;
                    const encerrado = c.grupo === 'concluido' || c.grupo === 'cancelado';
                    return (
                      <Fragment key={c.id}>
                        <tr className={`reportes-linha${abertaAqui ? ' aberta' : ''}${encerrado ? ' resolvida' : ''}${c.enviando ? ' chm-enviando' : ''}`}
                          role="button" tabIndex={0} aria-expanded={abertaAqui}
                          onClick={() => setAberta(a => a === c.id ? null : c.id)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberta(a => a === c.id ? null : c.id); }
                          }}>
                          <td className="chm-numero">
                            {c.enviando ? <IconSpinner size={12} /> : `#${c.numero ?? '-'}`}
                          </td>
                          <td className="reportes-col-relato">
                            <div className="reportes-relato">
                              <span className={`entrega-seta${abertaAqui ? ' aberta' : ''}`}><IconChevronRight size={12} /></span>
                              {/* Reaberto antes do título, como na fila de
                                  dentro: o status já voltou para a Triagem, e o
                                  que ele não conta é que isso já tinha sido
                                  entregue uma vez. */}
                              {c.reaberturas.length > 0 && (
                                <span className="reportes-reaberto"
                                  title={`Reaberto em ${instante(c.reaberturas[c.reaberturas.length - 1].em)}`}>
                                  <IconUndo size={10} /> Reaberto{c.reaberturas.length > 1 ? ` ${c.reaberturas.length}x` : ''}
                                </span>
                              )}
                              {/* A linha mostra o chamado como ele vale agora,
                                  com os ajustes já aplicados, e sem selo de
                                  ajuste ou de resposta: a única marca é a de
                                  Reaberto, antes do título. */}
                              <p className="reportes-texto" title={c.titulo}>{c.titulo}</p>
                            </div>
                          </td>
                          <td><ChipDoTipo tipo={c.tipo} /></td>
                          <td>
                            <span className="reportes-urgencia">{Icone && <Icone size={13} />} {c.urgencia}</span>
                          </td>
                          <td onClick={c.anexos.length ? (e => e.stopPropagation()) : undefined}>
                            {c.anexos.length ? (
                              <button type="button" className="reportes-print"
                                onClick={() => setVendo({ chamado: c, indice: 0 })}
                                title={c.anexos.map(a => a.nome).join(', ')}>
                                <IconImage size={13} /> Ver
                                {c.anexos.length > 1 && <span className="reportes-print-conta">{c.anexos.length}</span>}
                              </button>
                            ) : (
                              <span className="reportes-sem" title="Sem anexo"><IconImagemSem size={14} /></span>
                            )}
                          </td>
                          <td>
                            <StatusComDica nome={c.status} cor={c.cor} grupo={c.grupo} />
                          </td>
                          {/* A data que o time marcou para entregar. Aberto e
                              sem data, diz que ainda vai ser definida; já
                              encerrado e sem data, não há o que prever. */}
                          <td className="chm-previsao">
                            {c.previsao
                              ? dia(c.previsao)
                              : <span className="chm-previsao-vazia">{encerrado ? '-' : 'A definir'}</span>}
                          </td>
                          <td><span className="chm-quem">{c.solicitante}</span></td>
                          <td className="reportes-quando">
                            {instante(c.criado_em)}
                            <span className="reportes-relativo">{tempoRelativo(c.criado_em)}</span>
                          </td>
                        </tr>
                        {/* O detalhe nasce montado com a linha, e assim fica: é
                            dele que a abertura tira a altura de destino. */}
                        <tr className={`reportes-detalhe${encerrado ? ' resolvida' : ''}`}>
                          <td colSpan={9}>
                            <div className={`revelar${abertaAqui ? ' aberto' : ''}`}>
                              <div>
                                <div className="reportes-detalhe-corpo chm-detalhe">
                                  {/* A descrição oficial, já com os ajustes. O
                                      caminho até ela fica no histórico, no fim. */}
                                  <TextoRico texto={c.descricaoEmVigor} className="reportes-detalhe-texto" />
                                  <ListaDeLinks links={c.links} />
                                  <ChipsDeAnexos chamado={c} anexos={c.anexos.filter(a => !a.reabertura)}
                                    onVer={i => setVendo({ chamado: c, indice: i })} />
                                  {/* O que o time escreveu para o cliente, logo
                                      abaixo do pedido: é a conversa que ele
                                      veio ler. */}
                                  {(c.respostas?.length ?? 0) > 0 && (
                                    <>
                                      <p className="chm-historico-titulo">
                                        {c.respostas!.length === 1 ? 'Resposta do time' : `Respostas do time (${c.respostas!.length})`}
                                      </p>
                                      {/* Cada resposta é um balão de mensagem:
                                          a data e hora no alto e o texto. Sem
                                          nome - quem responde é o time. */}
                                      <ol className="chm-baloes">
                                        {c.respostas!.map(r => (
                                          <li key={r.seq} className="chm-balao">
                                            <time className="chm-balao-quando" dateTime={r.em}>
                                              {instante(r.em)}
                                              {r.editado && <span className="chm-balao-editado"> | editada</span>}
                                            </time>
                                            <TextoRico texto={r.texto} className="reportes-detalhe-texto" />
                                          </li>
                                        ))}
                                      </ol>
                                    </>
                                  )}
                                  {/* As reaberturas, uma embaixo da outra: o que
                                      o cliente escreveu cada vez que pediu o
                                      chamado de volta. Só aparecem se houver. */}
                                  {c.reaberturas.length > 0 && (
                                    <>
                                      <p className="chm-historico-titulo">
                                        {c.reaberturas.length === 1 ? 'Reabertura' : `Reaberturas (${c.reaberturas.length})`}
                                      </p>
                                      <ol className="chm-reaberturas">
                                        {c.reaberturas.map((ev, i) => (
                                          <PassoDaReabertura key={`${ev.seq ?? 'nova'}-${i}`} ev={ev} chamado={c}
                                            onVer={j => setVendo({ chamado: c, indice: j })} />
                                        ))}
                                      </ol>
                                    </>
                                  )}
                                  {/* O histórico dos ajustes, no fim e enxuto:
                                      uma linha por ajuste, com quando, quem e o
                                      que mudou. Os dados novos já estão na linha
                                      e no texto acima; aqui fica só o caminho. */}
                                  {c.ajustes.length > 0 && <HistoricoDeAjustes chamado={c} />}
                                  {encerrado && !c.reabrindo && (
                                    <div className="chm-detalhe-acoes surge">
                                      <span>Precisa de mais alguma coisa neste chamado?</span>
                                      <button type="button" className="reportes-acao"
                                        onClick={e => { e.stopPropagation(); setErroReabertura(null); setReabrindo(c.numero); }}>
                                        <IconUndo size={12} /> Reabrir chamado
                                      </button>
                                    </div>
                                  )}
                                  {/* Aberto, o chamado ainda se edita. O botão
                                      se explica sozinho, sem texto de convite
                                      ao lado. */}
                                  {!encerrado && c.numero != null && !c.enviando && !c.ajustando && (
                                    <div className="chm-detalhe-acoes surge">
                                      <button type="button" className="reportes-acao"
                                        onClick={e => { e.stopPropagation(); abrirAjuste(c); }}>
                                        <IconEdit size={12} /> Editar
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <p className="chm-rodape">
          Os chamados abertos aqui chegam direto ao time do projeto. O status muda sozinho conforme o
          trabalho anda.
        </p>
        <p className="chm-assinatura">
          <img src="/logo.png" alt="" aria-hidden="true" className="brand-logo" />
          Painel de chamados da Sheep Technology
        </p>
      </div>

      {formAberto && (
        <FormularioDoChamado rascunho={rascunho} erro={erroEnvio} nomes={sugestoesDeNome}
          onMudar={setRascunho}
          onFechar={() => setFormAberto(false)}
          onEnviar={r => { setFormAberto(false); void enviar(r); }} />
      )}

      {reabrindo != null && (() => {
        const alvo = chamados.find(c => c.numero === reabrindo);
        if (!alvo) return null;
        return (
          <FormularioDeReabertura chamado={alvo} rascunho={reabertura} erro={erroReabertura} nomes={sugestoesDeNome}
            onMudar={setReabertura}
            onFechar={() => setReabrindo(null)}
            onEnviar={r => { setReabrindo(null); void reabrir(alvo.numero!, r); }} />
        );
      })()}

      {ajustandoNumero != null && rascunhoDeAjuste && (() => {
        const alvo = chamados.find(c => c.numero === ajustandoNumero);
        if (!alvo) return null;
        return (
          <FormularioDeAjuste chamado={alvo} rascunho={rascunhoDeAjuste} erro={erroAjuste} nomes={sugestoesDeNome}
            onMudar={setRascunhoDeAjuste}
            onFechar={() => setAjustandoNumero(null)}
            onEnviar={r => { setAjustandoNumero(null); void ajustar(alvo.numero!, r); }} />
        );
      })()}

      {vendo && (() => {
        const a = vendo.chamado.anexos[vendo.indice];
        if (!a) return null;
        return (
          <PreviaArquivo
            arquivo={{ nome: a.nome, chave: `${vendo.chamado.id}-${a.ordem}` }}
            onCarregar={() => carregarAnexo(vendo.chamado, a)}
            onBaixar={() => {
              void carregarAnexo(vendo.chamado, a).then(d => {
                if (!d) return;
                const link = document.createElement('a');
                link.href = `data:${d.tipo};base64,${d.base64}`;
                link.download = a.nome;
                link.click();
              });
            }}
            onFechar={() => setVendo(null)}
            navegacao={vendo.chamado.anexos.length > 1 ? {
              posicao: vendo.indice + 1,
              total: vendo.chamado.anexos.length,
              onAnterior: () => setVendo(v => v && { ...v, indice: (v.indice - 1 + v.chamado.anexos.length) % v.chamado.anexos.length }),
              onProximo: () => setVendo(v => v && { ...v, indice: (v.indice + 1) % v.chamado.anexos.length }),
            } : undefined}
          />
        );
      })()}
    </div>
  );
}

/**
 * As ondas de luz do portal, no fundo do painel: o mesmo desenho e o mesmo
 * movimento da casca de dentro, para o cliente reconhecer a casa. A versão é a
 * leve (meia resolução, 24 quadros), e o fundo para quando a aba some ou um
 * formulário abre por cima - ninguém olha o fundo atrás de um modal. Sem
 * WebGL, ou com movimento reduzido, fica o foco de luz em CSS da página.
 */
function FundoDeOndas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [reduzido] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [caiu, setCaiu] = useState(false);
  // O tema vem do navegador de quem abre (a mesma escolha do portal), e não
  // muda com a página aberta: lido uma vez basta.
  const [claro] = useState(() => document.documentElement.getAttribute('data-theme') === 'light');

  useEffect(() => {
    const el = canvas.current;
    if (!el || reduzido || caiu) return;
    let ondas: ReturnType<typeof iniciarOndas> = null;
    let vigia = 0;
    const desligar = () => {
      window.clearInterval(vigia);
      vigia = 0;
      ondas?.parar();
      ondas = null;
    };
    const conferirModal = () => {
      if (!ondas) return;
      if (document.querySelector('.admin-modal-overlay')) ondas.pausar(); else ondas.retomar();
    };
    const rever = () => {
      if (!document.hidden && !ondas) {
        ondas = iniciarOndas(el, { camadas: 4, fps: 24, dprMax: 0.5, claro });
        if (!ondas) { setCaiu(true); return; }
        conferirModal();
        vigia = window.setInterval(() => {
          if (ondas?.morto()) { desligar(); setCaiu(true); }
        }, 4000);
      } else if (document.hidden && ondas) {
        desligar();
      }
    };
    const vigiaModal = new MutationObserver(conferirModal);
    vigiaModal.observe(document.body, { childList: true });
    rever();
    document.addEventListener('visibilitychange', rever);
    return () => {
      vigiaModal.disconnect();
      document.removeEventListener('visibilitychange', rever);
      desligar();
    };
  }, [reduzido, caiu, claro]);

  if (reduzido || caiu) return null;
  return <canvas ref={canvas} className="casca-ondas" aria-hidden="true" />;
}

/** Um número do alto: rótulo, valor que conta ao aparecer, e a linha de apoio.
 *  É botão porque filtra; aceso, ele diz que o filtro está ligado. */
function Numero({ rotulo, valor, detalhe, ativo, onClick }: {
  rotulo: string; valor: number; detalhe: string; ativo: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`painel-numero chm-numero-cartao${ativo ? ' ativo' : ''}`}
      aria-pressed={ativo} onClick={onClick}>
      <span className="painel-numero-rotulo">{rotulo}</span>
      <span className="painel-numero-linha">
        <span className="painel-numero-valor"><ContaAnimada valor={valor} /></span>
      </span>
      <span className="painel-numero-detalhe">{detalhe}</span>
    </button>
  );
}

/** Os links de um chamado ou de uma reabertura: o domínio à vista, o endereço
 *  inteiro na dica, e sempre numa aba nova. */
function ListaDeLinks({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <ul className="chm-links">
      {links.map(l => (
        <li key={l}>
          <a href={l} target="_blank" rel="noopener noreferrer nofollow" title={l} onClick={e => e.stopPropagation()}>
            <IconLink size={12} /> <span>{rotuloDoLink(l)}</span> <IconExternal size={11} />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Os arquivos como chips. O índice que sobe é a posição na lista inteira do
 *  chamado, que é a que a prévia percorre. */
function ChipsDeAnexos({ chamado, anexos, onVer }: {
  chamado: Chamado; anexos: Anexo[]; onVer: (indice: number) => void;
}) {
  if (!anexos.length) return null;
  return (
    <ul className="reportes-anexos">
      {anexos.map(a => (
        <li key={a.ordem}>
          <button type="button" className="reportes-anexo"
            onClick={e => { e.stopPropagation(); onVer(chamado.anexos.indexOf(a)); }}>
            {a.tipo === 'application/pdf' ? <IconDoc size={12} /> : <IconImage size={12} />}
            <span>{a.nome}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── O que cada status quer dizer ─────────────────────────────────────────
//  Na língua de quem pediu, e não na do quadro: "Backlog" e "Em revisão" são
//  palavras do time. As etapas da casa são configuráveis, então o texto vem
//  pelo nome conhecido e, para uma etapa nova, pelo grupo dela - nenhum status
//  fica sem explicação.
const SIGNIFICADO_POR_NOME: Record<string, string> = {
  triagem: 'Recebemos o seu chamado. O time está lendo para entender e classificar o pedido.',
  backlog: 'Entendido e na fila. Aguarda a vez de entrar no planejamento do time.',
  fazer: 'Planejado: entra no próximo ciclo de trabalho do time.',
  'a fazer': 'Planejado: entra no próximo ciclo de trabalho do time.',
  fazendo: 'O time está trabalhando nele agora.',
  'em andamento': 'O time está trabalhando nele agora.',
  'em revisao': 'Pronto do lado do time e em conferência antes de chegar até você.',
  concluida: 'Entregue. Se algo não ficou certo, você pode reabrir o chamado.',
  concluido: 'Entregue. Se algo não ficou certo, você pode reabrir o chamado.',
  cancelada: 'Encerrado sem execução: não vai ser feito. Se ainda precisar, você pode reabrir.',
  cancelado: 'Encerrado sem execução: não vai ser feito. Se ainda precisar, você pode reabrir.',
  encerrado: 'Encerrado pelo time. Se ainda precisar, você pode reabrir o chamado.',
};
const SIGNIFICADO_POR_GRUPO: Record<Grupo, string> = {
  triagem: 'Recebemos o seu chamado. O time está analisando o pedido.',
  andamento: 'O chamado está com o time, em uma das etapas de trabalho.',
  concluido: 'Entregue. Se algo não ficou certo, você pode reabrir o chamado.',
  cancelado: 'Encerrado sem execução. Se ainda precisar, você pode reabrir.',
};
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
function significadoDaEtapa(nome: string, grupo: Grupo): string {
  return SIGNIFICADO_POR_NOME[normalizar(nome)] ?? SIGNIFICADO_POR_GRUPO[grupo];
}

/** A pílula do status na linha, com a explicação da etapa ao passar o mouse
 *  (ou ao chegar pelo teclado). */
function StatusComDica({ nome, cor, grupo }: { nome: string; cor: string; grupo: Grupo }) {
  const { gatilho, dica } = useDicaRica<HTMLSpanElement>(() => (
    <div className="chm-dica-etapa">
      <span className="reportes-status" style={{ ['--cor' as string]: cor }}>
        <span className="reportes-ponto" style={{ background: cor }} />
        {nome}
      </span>
      <p>{significadoDaEtapa(nome, grupo)}</p>
    </div>
  ), { largura: 260 });
  return (
    <>
      <span className="reportes-status chm-status-dica" style={{ ['--cor' as string]: cor }} tabIndex={0} {...gatilho}>
        <span className="reportes-ponto" style={{ background: cor }} />
        {nome}
      </span>
      {dica}
    </>
  );
}

/** A chave que lembra, neste navegador, se a legenda ficou recolhida. */
const CHAVE_LEGENDA = 'sheep_chamados_legenda';

/** O resumo de cada etapa em duas ou três palavras, para a trilha da legenda.
 *  A frase inteira fica na dica, para quem quiser ler. */
const RESUMO_POR_NOME: Record<string, string> = {
  triagem: 'Recebido, em análise',
  backlog: 'Na fila do time',
  fazer: 'Planejado',
  'a fazer': 'Planejado',
  fazendo: 'Em execução',
  'em andamento': 'Em execução',
  'em revisao': 'Em conferência',
  concluida: 'Entregue',
  concluido: 'Entregue',
  cancelada: 'Não será feito',
  cancelado: 'Não será feito',
};
const RESUMO_POR_GRUPO: Record<Grupo, string> = {
  triagem: 'Em análise', andamento: 'Com o time', concluido: 'Entregue', cancelado: 'Encerrado',
};

type EtapaDoPainel = { nome: string; cor: string; grupo: Grupo };

/** Um ponto da trilha: a bolinha na cor da etapa, o nome e o resumo. A frase
 *  completa abre na dica, ao passar o mouse ou chegar pelo teclado. */
function PassoDaLegenda({ etapa: e, fora }: { etapa: EtapaDoPainel; fora?: boolean }) {
  const { gatilho, dica } = useDicaRica<HTMLLIElement>(() => (
    <div className="chm-dica-etapa">
      <span className="reportes-status" style={{ ['--cor' as string]: e.cor }}>
        <span className="reportes-ponto" style={{ background: e.cor }} />
        {e.nome}
      </span>
      <p>{significadoDaEtapa(e.nome, e.grupo)}</p>
    </div>
  ), { largura: 260 });
  return (
    <li className={`chm-trilha-passo${fora ? ' fora' : ''}`} style={{ ['--cor' as string]: e.cor }}
      tabIndex={0} {...gatilho}>
      <span className="chm-trilha-ponto" aria-hidden="true" />
      <span className="chm-trilha-nome">{e.nome}</span>
      <span className="chm-trilha-resumo">{RESUMO_POR_NOME[normalizar(e.nome)] ?? RESUMO_POR_GRUPO[e.grupo]}</span>
      {dica}
    </li>
  );
}

/** A legenda dos status, no alto do painel: uma trilha com as etapas na ordem
 *  em que o chamado anda, da chegada à entrega, e à parte o que sai do
 *  caminho sem ser feito. Quem já conhece recolhe, e a escolha fica guardada
 *  neste navegador. */
function LegendaDasEtapas({ etapas }: { etapas: EtapaDoPainel[] }) {
  const [aberta, setAberta] = useState(() => {
    try { return localStorage.getItem(CHAVE_LEGENDA) !== 'recolhida'; } catch { return true; }
  });
  const alternar = () => setAberta(a => {
    try { localStorage.setItem(CHAVE_LEGENDA, a ? 'recolhida' : 'aberta'); } catch { /* sem armazenamento */ }
    return !a;
  });
  if (!etapas.length) return null;
  const caminho = etapas.filter(e => e.grupo !== 'cancelado');
  const fora = etapas.filter(e => e.grupo === 'cancelado');
  return (
    <section className="chm-legenda" aria-label="O que significa cada status">
      <button type="button" className="chm-legenda-topo" aria-expanded={aberta} onClick={alternar}>
        <span className={`entrega-seta${aberta ? ' aberta' : ''}`}><IconChevronRight size={12} /></span>
        <span className="chm-legenda-titulo">Como ler o status</span>
        <span className="chm-legenda-sub">passe o mouse ou toque em uma etapa para ver o que ela quer dizer</span>
      </button>
      <div className={`revelar${aberta ? ' aberto' : ''}`}>
        <div>
          <div className="chm-trilha">
            <ol className="chm-trilha-caminho" style={{ ['--passos' as string]: caminho.length }}>
              {caminho.map(e => <PassoDaLegenda key={e.nome} etapa={e} />)}
            </ol>
            {fora.length > 0 && (
              <ol className="chm-trilha-fora" aria-label="Fora do caminho">
                {fora.map(e => <PassoDaLegenda key={e.nome} etapa={e} fora />)}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** O seletor do tipo, o mesmo do cartão de reportar de dentro: Bug ou
 *  Melhoria, cada um com a linha que ajuda a escolher e o ícone na cor dele. */
function SeletorDeTipo({ valor, onMudar }: { valor: string; onMudar: (v: string) => void }) {
  return (
    <SelectSistema valor={valor} onChange={onMudar} placeholder="Escolher"
      opcoes={TIPOS_DO_RELATO.map(t => ({
        valor: t.valor,
        label: t.label,
        descricao: DESCRICAO_DO_TIPO[t.valor],
        icone: <span style={{ display: 'inline-flex', color: t.cor }}><t.Icone size={14} /></span>,
      }))} />
  );
}

/** O tipo na linha: a pílula da fila de dentro, na cor do tipo. O chamado
 *  antigo, sem tipo, mostra só um traço. */
function ChipDoTipo({ tipo }: { tipo: string | null }) {
  const t = tipo ? ROTULO_DO_TIPO[tipo] : undefined;
  if (!t) return <span className="chm-previsao-vazia">-</span>;
  return (
    <span className="reportes-status" style={{ ['--cor' as string]: t.cor }}>
      <t.Icone size={12} />
      {t.label}
    </span>
  );
}

/** Cada correção com o que valia antes dela: o envio original somado às
 *  correções anteriores. É o "de" do "de → para". */
function passosDosAjustes(c: ChamadoNaTela): { ajuste: Ajuste; de: Versao }[] {
  let v: Versao = { ...c.original };
  return c.ajustes.map(ajuste => {
    const de = v;
    v = { ...v };
    for (const k of CAMPOS_AJUSTAVEIS) if (ajuste.mudou[k] != null) v[k] = ajuste.mudou[k]!;
    return { ajuste, de };
  });
}

const NOME_DO_CAMPO: Record<CampoAjustavel, string> = {
  titulo: 'Título', descricao: 'Descrição', solicitante: 'Quem pede', urgencia: 'Urgência', tipo: 'Tipo',
};

/** O histórico dos ajustes, enxuto: uma linha por ajuste - quando e o que
 *  mudou, sem o nome de quem editou. Nos campos curtos, de onde para onde; na descrição, só o aviso
 *  de que mudou, porque a versão em vigor já está no alto do chamado. */
function HistoricoDeAjustes({ chamado }: { chamado: ChamadoNaTela }) {
  const valor = (k: CampoAjustavel, v: string) => {
    if (k === 'tipo') return ROTULO_DO_TIPO[v]?.label ?? 'sem tipo';
    return v;
  };
  // O valor longo (um título comprido) encurta no texto, e não no CSS: o corte
  // do CSS deixava a largura cheia depois das reticências, e o vão aparecia
  // antes da vírgula. Por extenso, ele fica na dica da linha.
  const curto = (v: string) => (v.length > 28 ? `${v.slice(0, 27).trimEnd()}…` : v);
  return (
    <div className="chm-ajustes">
      <p className="chm-historico-titulo">Histórico de edições</p>
      <ul className="chm-ajustes-lista">
        {passosDosAjustes(chamado).map(({ ajuste, de }, i) => {
          const campos = (['titulo', 'tipo', 'solicitante', 'urgencia', 'descricao'] as CampoAjustavel[])
            .filter(k => ajuste.mudou[k] != null);
          // O ajuste inteiro por extenso, para a dica: a linha é uma só e os
          // valores longos levam reticências, então o texto completo mora aqui.
          const porExtenso = campos.map(k => (k === 'descricao'
            ? 'descrição atualizada'
            : `${NOME_DO_CAMPO[k].toLocaleLowerCase('pt-BR')} ${valor(k, de[k])} para ${valor(k, ajuste.mudou[k]!)}`)).join(', ');
          return (
            <li key={`${ajuste.seq ?? 'novo'}-${i}`} className={ajuste.seq == null ? 'enviando' : undefined}
              title={`${instante(ajuste.em)}: ${porExtenso}`}>
              <span className="chm-ajustes-quando">{instante(ajuste.em)}</span>
              <span className="chm-ajustes-oque">
                {/* A vírgula vai colada no fim do campo anterior, e não solta
                    entre os dois: solta, o espaço entre as peças da linha
                    abria um vão antes dela. */}
                {campos.map((k, j) => (
                  <span key={k} className="chm-ajustes-campo">
                    {k === 'descricao' ? 'descrição atualizada' : (
                      <>{NOME_DO_CAMPO[k].toLocaleLowerCase('pt-BR')} <s>{curto(valor(k, de[k]))}</s> para <b>{curto(valor(k, ajuste.mudou[k]!))}</b></>
                    )}
                    {j < campos.length - 1 && ','}
                  </span>
                ))}
                {ajuste.seq == null && <IconSpinner size={11} />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Uma reabertura: quem pediu de volta, quando, e o que veio junto. */
function PassoDaReabertura({ ev, chamado, onVer }: {
  ev: Reabertura; chamado: Chamado; onVer: (indice: number) => void;
}) {
  const anexos = ev.seq == null
    ? chamado.anexos.filter(a => a.reabertura === -1)
    : chamado.anexos.filter(a => a.reabertura === ev.seq);
  // No desenho do comentário da tarefa: o selo de quem falou, o cabeçalho com
  // nome e hora, e o texto num cartão - recuado do resto do chamado, para a
  // reabertura ler como uma conversa à parte, e não como parte do pedido.
  return (
    <li className={`chm-reabertura${ev.seq == null ? ' enviando' : ''}`}>
      <span className="chm-reabertura-selo" aria-hidden="true">
        {/* A primeira letra do nome, e não o primeiro caractere: um nome que
            começa com colchete ou número mostraria o símbolo no selo. */}
        {ev.autor.match(/\p{L}/u)?.[0]?.toUpperCase() ?? <IconUndo size={11} />}
      </span>
      <div className="chm-reabertura-corpo">
        <p className="chm-reabertura-cabeca">
          <strong>{ev.autor}</strong>
          <span className="chm-reabertura-marca"><IconUndo size={10} /> reabriu</span>
          <time dateTime={ev.em}>{instante(ev.em)}</time>
          {ev.seq == null && <IconSpinner size={11} />}
        </p>
        <TextoRico texto={ev.texto} className="reportes-detalhe-texto" />
        <ListaDeLinks links={ev.links} />
        <ChipsDeAnexos chamado={chamado} anexos={anexos} onVer={onVer} />
      </div>
    </li>
  );
}

/** A moldura dos dois formulários: o fundo que fecha, a saída animada e o
 *  Escape - que é de uma lista do sistema quando há uma aberta. */
function Janela({ rotulo, titulo, sub, onFechar, rodape, children }: {
  rotulo: string; titulo: string; sub: string; onFechar: () => void;
  rodape: (fechar: () => void) => ReactNode; children: ReactNode;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  useEffect(() => {
    const naTecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.status-select-dropdown, .filter-dropdown-list')) return;
      e.preventDefault();
      fechar();
    };
    document.addEventListener('keydown', naTecla);
    return () => document.removeEventListener('keydown', naTecla);
  }, [fechar]);
  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <div className="modal-central chm-form" role="dialog" aria-label={rotulo} onClick={e => e.stopPropagation()}>
        <div className="chm-form-topo">
          <div style={{ minWidth: 0 }}>
            <p className="painel-rotulo">{rotulo}</p>
            {titulo && <p className="chm-form-titulo">{titulo}</p>}
            <p className="chm-form-sub">{sub}</p>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>
        <div className="chm-form-corpo">{children}</div>
        <div className="chm-form-rodape">{rodape(fechar)}</div>
      </div>
    </div>,
    document.body,
  );
}

/** O campo de anexos dos dois formulários: soltar, clicar ou colar com Ctrl+V,
 *  com a prévia de cada arquivo e o teto de quantidade e de tamanho. */
function CampoDeAnexos({ anexos, onMudar, onErro }: {
  anexos: Anexo[]; onMudar: (a: Anexo[]) => void; onErro: (e: string | null) => void;
}) {
  const seletor = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  async function receber(entrada: FileList | File[] | null | undefined) {
    const arquivos = [...(entrada ?? [])];
    if (!arquivos.length) return;
    onErro(null);
    let soma = anexos.reduce((t, a) => t + a.tamanho, 0);
    const novos: Anexo[] = [];
    for (const arquivo of arquivos) {
      if (anexos.length + novos.length >= MAX_ANEXOS) { onErro(`São no máximo ${MAX_ANEXOS} anexos.`); break; }
      if (!TIPOS_DE_ANEXO.includes(arquivo.type)) { onErro(`"${arquivo.name}" precisa ser uma imagem ou um PDF.`); continue; }
      if (soma + arquivo.size > LIMITE_SOMA) { onErro('Os anexos juntos passam de 4 MB.'); continue; }
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error('leitura'));
        fr.readAsDataURL(arquivo);
      }).catch(() => null);
      if (!base64) { onErro(`Não foi possível ler "${arquivo.name}".`); continue; }
      soma += arquivo.size;
      novos.push({ ordem: anexos.length + novos.length + 1, nome: arquivo.name || 'anexo', tipo: arquivo.type, tamanho: arquivo.size, base64 });
    }
    if (novos.length) onMudar([...anexos, ...novos]);
  }

  // Colar um print com Ctrl+V: o jeito mais comum de um print chegar.
  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const colados = [...(e.clipboardData?.files ?? [])];
      if (colados.length) { e.preventDefault(); void receber(colados); }
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  });

  return (
    <div className="form-group">
      <span className="form-label">Anexos <em className="chm-opcional">(imagens ou PDF, até 4 MB no total)</em></span>
      <input ref={seletor} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
        onChange={e => { void receber(e.target.files); e.target.value = ''; }} />
      {anexos.length > 0 && (
        <ul className="pub-pedido-anexos">
          {anexos.map((a, i) => (
            <li key={`${a.nome}-${i}`} className="pub-pedido-anexo surge">
              {a.tipo === 'application/pdf'
                ? <span className="pub-pedido-anexo-icone"><IconDoc size={14} /></span>
                : <img src={a.base64} alt="" />}
              <span className="pub-pedido-anexo-nome" title={a.nome}>{a.nome}</span>
              <span className="pub-pedido-anexo-peso">{fmtTamanho(a.tamanho)}</span>
              <button type="button" aria-label={`Remover ${a.nome}`}
                onClick={() => onMudar(anexos.filter((_, j) => j !== i))}>
                <IconTrash size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {anexos.length < MAX_ANEXOS && (
        <button type="button" className={`pub-pedido-solta${arrastando ? ' sobre' : ''}`}
          onClick={() => seletor.current?.click()}
          onDragOver={e => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={e => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files); }}>
          <IconImage size={14} />
          <span>
            <b>{anexos.length ? 'Anexar mais um arquivo' : 'Anexe prints ou PDFs'}</b>
            <small>solte aqui, clique ou cole com Ctrl+V</small>
          </span>
          <IconUpload size={13} />
        </button>
      )}
    </div>
  );
}

/** O campo de links: cola o endereço e Enter (ou o botão) acrescenta. Só
 *  endereço web inteiro - o servidor confere de novo. */
function CampoDeLinks({ links, onMudar, onErro }: {
  links: string[]; onMudar: (l: string[]) => void; onErro: (e: string | null) => void;
}) {
  const [novo, setNovo] = useState('');
  function acrescentar() {
    const bruto = novo.trim();
    if (!bruto) return;
    const comEsquema = /^[a-z]+:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
    let url: URL;
    try { url = new URL(comEsquema); } catch { onErro('Esse link não parece válido.'); return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') { onErro('Os links precisam ser http ou https.'); return; }
    if (links.length >= MAX_LINKS) { onErro(`São no máximo ${MAX_LINKS} links.`); return; }
    onErro(null);
    const limpo = url.toString();
    if (!links.includes(limpo)) onMudar([...links, limpo]);
    setNovo('');
  }
  return (
    <div className="form-group">
      <span className="form-label">Links <em className="chm-opcional">(onde aconteceu, um vídeo, um documento)</em></span>
      {links.length > 0 && (
        <ul className="chm-links chm-links-edicao">
          {links.map(l => (
            <li key={l} className="surge">
              <span title={l}><IconLink size={12} /> {rotuloDoLink(l)}</span>
              <button type="button" aria-label={`Remover ${l}`} onClick={() => onMudar(links.filter(x => x !== l))}>
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {links.length < MAX_LINKS && (
        <div className="chm-link-novo">
          <input className="form-input" value={novo} placeholder="https://"
            onChange={e => setNovo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); acrescentar(); } }} />
          <button type="button" className="delete-confirm-cancel" disabled={!novo.trim()} onClick={acrescentar}>
            <IconPlus size={13} /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

/** O campo de nome com os nomes já usados neste projeto numa lista embaixo.
 *  Continua sendo texto livre: a lista só poupa a digitação de quem volta, e
 *  quem é novo escreve o nome como sempre. Abre no clique (e o segundo clique
 *  fecha), ao digitar e na seta para baixo; digitar filtra. Com o campo já
 *  preenchido por um nome da lista, ela mostra todos, e não só aquele. */
function CampoDeNome({ valor, nomes, onMudar, onEscolher }: {
  valor: string;
  nomes: NomeLembrado[];
  onMudar: (v: string) => void;
  onEscolher: (n: NomeLembrado) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [campo, lista], () => setAberto(false));

  const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
  const q = semAcento(valor);
  const exato = nomes.some(n => semAcento(n.nome) === q);
  const opcoes = !q || exato ? nomes : nomes.filter(n => semAcento(n.nome).includes(q));
  const visivel = aberto && opcoes.length > 0;

  function abrir() {
    const r = campo.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    setAtivo(-1);
    setAberto(true);
  }
  function escolher(n: NomeLembrado) {
    onEscolher(n);
    setAberto(false);
  }

  return (
    <>
      <input ref={campo} className="form-input" value={valor} maxLength={80} placeholder="Seu nome"
        autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={visivel}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onChange={e => { onMudar(e.target.value); if (!aberto) abrir(); else setAtivo(-1); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!aberto) { abrir(); return; }
            setAtivo(i => Math.min(i + 1, opcoes.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAtivo(i => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && visivel && opcoes[ativo]) {
            e.preventDefault();
            escolher(opcoes[ativo]);
          } else if (e.key === 'Escape' && aberto) {
            // O primeiro Esc fecha só a lista: parado aqui, ele não chega à
            // janela, que fecharia o formulário inteiro junto.
            e.stopPropagation();
            setAberto(false);
          } else if (e.key === 'Tab') {
            setAberto(false);
          }
        }} />
      {visivel && createPortal(
        <div ref={lista} className="status-select-dropdown" role="listbox" aria-label="Nomes já usados"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10050 }}>
          {opcoes.map((n, i) => (
            <div key={chaveDoNome(n.nome)} role="option" aria-selected={i === ativo}
              className={`status-select-option${i === ativo ? ' active' : ''}`}
              onMouseEnter={() => setAtivo(i)}
              // O foco fica no campo: saindo dele, o clique chegaria a uma
              // lista que já começou a fechar.
              onMouseDown={e => e.preventDefault()}
              onClick={() => escolher(n)}>
              <span style={{ minWidth: 0 }}>{n.nome}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/** O formulário do chamado, no centro da tela. O rascunho mora em quem abre:
 *  fechar sem querer e reabrir devolve o que já estava escrito. */
function FormularioDoChamado({ rascunho, erro, nomes, onMudar, onFechar, onEnviar }: {
  rascunho: Rascunho;
  erro: string | null;
  nomes: NomeLembrado[];
  onMudar: (r: Rascunho) => void;
  onFechar: () => void;
  onEnviar: (r: Rascunho) => void;
}) {
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const r = rascunho;
  const mudar = (parte: Partial<Rascunho>) => onMudar({ ...r, ...parte });
  const pronto = r.titulo.trim().length >= 3 && r.descricao.trim().length >= 5
    && r.solicitante.trim().length >= 2 && !!r.tipo;

  return (
    <Janela rotulo="NOVO CHAMADO" titulo="" sub="Conte o que precisa. O time recebe na hora."
      onFechar={onFechar}
      rodape={fechar => (
        <>
          <button type="button" className="delete-confirm-cancel" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={() => onEnviar(r)}>
            Abrir chamado
          </button>
        </>
      )}>
      <label className="form-group">
        <span className="form-label">Título</span>
        <input className="form-input" value={r.titulo} maxLength={140} autoFocus
          placeholder="Em poucas palavras, do que se trata"
          onChange={e => mudar({ titulo: e.target.value })} />
      </label>

      <div className="form-group">
        <span className="form-label">Descrição</span>
        <CampoTexto valor={r.descricao} onMudar={v => mudar({ descricao: v })} linhas={5} alturaMaxima={260}
          ariaLabel="Descrição do chamado"
          placeholder="Onde aconteceu, o que você esperava e o que aconteceu no lugar." />
      </div>

      <div className="chm-form-dupla">
        <label className="form-group">
          <span className="form-label">Quem está pedindo</span>
          <CampoDeNome valor={r.solicitante} nomes={nomes}
            onMudar={v => mudar({ solicitante: v })} onEscolher={n => mudar({ solicitante: n.nome })} />
        </label>
        {/* O tipo no lugar do e-mail: é a pergunta que separa a fila do time
            em duas leituras, o que quebrou e o que falta. */}
        <div className="form-group">
          <span className="form-label">Tipo</span>
          <SeletorDeTipo valor={r.tipo} onMudar={tipo => mudar({ tipo })} />
        </div>
      </div>

      <div className="form-group chm-form-urgencia">
        <span className="form-label">Urgência</span>
        <SelectSistema valor={r.urgencia} onChange={v => mudar({ urgencia: v })}
          opcoes={[...PRIORIDADES].sort((a, b) => posicaoDaPrioridade(a) - posicaoDaPrioridade(b))
            .map(p => ({ valor: p as string, label: p, icone: ICONE_PRIORIDADE[p]({ size: 13 }) }))} />
      </div>

      <CampoDeLinks links={r.links} onMudar={links => mudar({ links })} onErro={setErroCampo} />
      <CampoDeAnexos anexos={r.anexos} onMudar={anexos => mudar({ anexos })} onErro={setErroCampo} />

      {(erro || erroCampo) && (
        <p className="pub-pedido-erro surge"><IconX size={11} /> {erroCampo ?? erro}</p>
      )}
    </Janela>
  );
}

/** Reabrir um chamado encerrado: por que ele precisa voltar, quem pede, e o
 *  que vem junto. Ele volta para a Triagem, e o time é avisado. */
function FormularioDeReabertura({ chamado, rascunho, erro, nomes, onMudar, onFechar, onEnviar }: {
  chamado: Chamado;
  rascunho: RascunhoDeReabertura;
  erro: string | null;
  nomes: NomeLembrado[];
  onMudar: (r: RascunhoDeReabertura) => void;
  onFechar: () => void;
  onEnviar: (r: RascunhoDeReabertura) => void;
}) {
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const r = rascunho;
  const mudar = (parte: Partial<RascunhoDeReabertura>) => onMudar({ ...r, ...parte });
  const pronto = r.texto.trim().length >= 5 && r.autor.trim().length >= 2;

  return (
    <Janela rotulo={`REABRIR O CHAMADO #${chamado.numero}`} titulo={chamado.titulo}
      sub="Ele volta para a triagem e o time recebe o aviso na hora."
      onFechar={onFechar}
      rodape={fechar => (
        <>
          <button type="button" className="delete-confirm-cancel" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!pronto} onClick={() => onEnviar(r)}>
            <IconUndo size={14} /> Reabrir chamado
          </button>
        </>
      )}>
      <div className="form-group">
        <span className="form-label">O que ainda precisa</span>
        <CampoTexto valor={r.texto} onMudar={v => mudar({ texto: v })} linhas={4} alturaMaxima={260} autoFocus
          ariaLabel="Por que o chamado precisa ser reaberto"
          placeholder="O que voltou a acontecer, ou o que ficou faltando." />
      </div>
      <label className="form-group">
        <span className="form-label">Quem está reabrindo</span>
        <CampoDeNome valor={r.autor} nomes={nomes}
          onMudar={v => mudar({ autor: v })} onEscolher={n => mudar({ autor: n.nome })} />
      </label>
      <CampoDeLinks links={r.links} onMudar={links => mudar({ links })} onErro={setErroCampo} />
      <CampoDeAnexos anexos={r.anexos} onMudar={anexos => mudar({ anexos })} onErro={setErroCampo} />
      {(erro || erroCampo) && (
        <p className="pub-pedido-erro surge"><IconX size={11} /> {erroCampo ?? erro}</p>
      )}
    </Janela>
  );
}

/** Corrigir um chamado que ainda está com o time. O formulário abre com a
 *  versão em vigor; o que for trocado vira uma correção guardada junto do
 *  chamado, e o envio original continua como foi. */
function FormularioDeAjuste({ chamado, rascunho, erro, nomes, onMudar, onFechar, onEnviar }: {
  chamado: ChamadoNaTela;
  rascunho: RascunhoDeAjuste;
  erro: string | null;
  nomes: NomeLembrado[];
  onMudar: (r: RascunhoDeAjuste) => void;
  onFechar: () => void;
  onEnviar: (r: RascunhoDeAjuste) => void;
}) {
  const r = rascunho;
  const mudar = (parte: Partial<RascunhoDeAjuste>) => onMudar({ ...r, ...parte });
  const vigente = versaoEmVigor(chamado);
  const mudou = CAMPOS_AJUSTAVEIS.some(k => r[k].trim() !== vigente[k]);
  const valido = r.titulo.trim().length >= 3 && r.descricao.trim().length >= 5
    && r.solicitante.trim().length >= 2;

  return (
    <Janela rotulo={`EDITAR O CHAMADO #${chamado.numero}`} titulo={chamado.titulo}
      sub="O que você mandou continua guardado. A edição aparece no histórico do chamado, e o time é avisado."
      onFechar={onFechar}
      rodape={fechar => (
        <>
          <button type="button" className="delete-confirm-cancel" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!mudou || !valido}
            title={!mudou ? 'Troque alguma informação para salvar a edição' : undefined}
            onClick={() => onEnviar(r)}>
            <IconEdit size={14} /> Salvar edição
          </button>
        </>
      )}>
      <label className="form-group">
        <span className="form-label">Título</span>
        <input className="form-input" value={r.titulo} maxLength={140} autoFocus
          onChange={e => mudar({ titulo: e.target.value })} />
      </label>

      <div className="form-group">
        <span className="form-label">Descrição</span>
        <CampoTexto valor={r.descricao} onMudar={v => mudar({ descricao: v })} linhas={5} alturaMaxima={260}
          ariaLabel="Descrição do chamado" />
      </div>

      <div className="chm-form-dupla">
        <div className="form-group">
          <span className="form-label">Tipo</span>
          <SeletorDeTipo valor={r.tipo} onMudar={tipo => mudar({ tipo })} />
        </div>
        <div className="form-group">
          <span className="form-label">Urgência</span>
          <SelectSistema valor={r.urgencia} onChange={v => mudar({ urgencia: v })}
            opcoes={[...PRIORIDADES].sort((a, b) => posicaoDaPrioridade(a) - posicaoDaPrioridade(b))
              .map(p => ({ valor: p as string, label: p, icone: ICONE_PRIORIDADE[p]({ size: 13 }) }))} />
        </div>
      </div>

      <label className="form-group">
        <span className="form-label">Quem está pedindo</span>
        <CampoDeNome valor={r.solicitante} nomes={nomes}
          onMudar={v => mudar({ solicitante: v })} onEscolher={n => mudar({ solicitante: n.nome })} />
      </label>

      {erro && <p className="pub-pedido-erro surge"><IconX size={11} /> {erro}</p>}
    </Janela>
  );
}
