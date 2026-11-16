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
  IconAlert, IconChevronRight, IconDoc, IconExternal, IconImage, IconImagemSem, IconLink, IconPlus,
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
import { instante, tempoRelativo, tamanho as fmtTamanho } from '../lib/datas';
import { contemTermo } from '../lib/texto';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { iniciarOndas } from '../lib/ondas';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

type Grupo = 'triagem' | 'andamento' | 'concluido' | 'cancelado';

/** `ordem` é a posição do arquivo no chamado: é por ela que ele se pede.
 *  `reabertura` é a reabertura em que ele veio; nulo, veio na abertura. */
interface Anexo {
  ordem: number; nome: string; tipo: string; tamanho: number; base64?: string; reabertura?: number | null;
}

/** Uma reabertura do chamado, com o que o cliente escreveu nela. `seq` nulo é
 *  a que ainda está indo para o servidor. */
interface Reabertura { em: string; seq: number | null; autor: string; texto: string; links: string[] }

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
  criado_em: string;
  status: string;
  cor: string;
  grupo: Grupo;
  links: string[];
  anexos: Anexo[];
  reaberturas: Reabertura[];
  /** Ainda indo para o servidor: a linha já está na fila, sem o número. */
  enviando?: boolean;
  /** A reabertura ainda indo para o servidor. */
  reabrindo?: boolean;
}

interface Dados {
  projeto: { nome: string; cliente: string | null };
  etapas: { nome: string; cor: string; grupo: Grupo }[];
  chamados: Chamado[];
}

/** O recorte dos números do alto. "Abertos" junta triagem e andamento. */
type Recorte = 'abertos' | Grupo;

/** As colunas que ordenam. */
type Coluna = 'numero' | 'titulo' | 'urgencia' | 'anexos' | 'status' | 'solicitante' | 'aberto';
/** A fila abre do mais novo para o mais velho: é a pergunta de quem volta ao
 *  painel - o que eu pedi por último e como ele está. */
const ORDEM_PADRAO: OrdemDaTabela<Coluna> = { col: 'aberto', dir: 'desc' };

const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ANEXOS = 5;
/** A soma tem teto: o corpo da requisição na Vercel para em 4,5 MB. */
const LIMITE_SOMA = 4 * 1024 * 1024;
/** Quem pediu e o e-mail ficam lembrados neste navegador: quem abre um chamado
 *  costuma abrir outros, e redigitar o nome a cada vez é atrito à toa. */
const CHAVE_QUEM = 'sheep_chamados_quem';
/** De quanto em quanto tempo a fila confere o status, com a aba à vista. */
const ATUALIZAR_MS = 60_000;

interface Rascunho {
  titulo: string;
  descricao: string;
  urgencia: string;
  solicitante: string;
  email: string;
  links: string[];
  anexos: Anexo[];
}

/** O que se manda ao reabrir: por que, quem, e o que vem junto. */
interface RascunhoDeReabertura { texto: string; autor: string; links: string[]; anexos: Anexo[] }

/** Até quantos links por envio. O servidor confere de novo. */
const MAX_LINKS = 5;

function lerQuem(): { solicitante: string; email: string } {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_QUEM) ?? 'null');
    return { solicitante: String(v?.solicitante ?? ''), email: String(v?.email ?? '') };
  } catch { return { solicitante: '', email: '' }; }
}

const rascunhoVazio = (): Rascunho => ({
  titulo: '', descricao: '', urgencia: 'Média', ...lerQuem(), links: [], anexos: [],
});
const reaberturaVazia = (): RascunhoDeReabertura => ({
  texto: '', autor: lerQuem().solicitante, links: [], anexos: [],
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
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoVazio);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  /** O chamado que está sendo reaberto, e o rascunho da reabertura. */
  const [reabrindo, setReabrindo] = useState<number | null>(null);
  const [reabertura, setReabertura] = useState<RascunhoDeReabertura>(reaberturaVazia);
  const [erroReabertura, setErroReabertura] = useState<string | null>(null);

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

  const chamados = dados?.chamados ?? [];
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
    if (busca.trim() && !contemTermo(`${c.numero ?? ''} ${c.titulo} ${c.descricao} ${c.solicitante}`, busca)) return false;
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
      urgencia: c => posicaoDaPrioridade(c.urgencia),
      anexos: c => c.anexos.length,
      status: c => posEtapa(c.status),
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

  // ── Abrir um chamado ───────────────────────────────────────────────────
  //  O formulário fecha no gesto e a linha nasce na fila com o que foi escrito.
  //  Recusado pelo servidor, a linha sai e o formulário volta com o rascunho e
  //  o motivo.
  async function enviar(r: Rascunho) {
    try { localStorage.setItem(CHAVE_QUEM, JSON.stringify({ solicitante: r.solicitante, email: r.email })); } catch { /* sem armazenamento */ }
    const entrada = dados?.etapas.find(e => e.grupo === 'triagem');
    const temporario = -Date.now();
    const linha: Chamado = {
      id: temporario, numero: null, titulo: r.titulo.trim(), descricao: r.descricao.trim(),
      solicitante: r.solicitante.trim(), urgencia: r.urgencia, criado_em: new Date().toISOString(),
      status: entrada?.nome ?? 'Triagem', cor: entrada?.cor ?? '#8D939B', grupo: 'triagem',
      links: r.links, anexos: r.anexos, enviando: true,
      reaberturas: [],
    };
    setDados(d => d && { ...d, chamados: [linha, ...d.chamados] });
    setRascunho(rascunhoVazio());
    setErroEnvio(null);
    try {
      const resp = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: linha.titulo, descricao: linha.descricao, urgencia: linha.urgencia,
          solicitante: linha.solicitante, email: r.email.trim(), links: r.links,
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
    try {
      const quem = lerQuem();
      localStorage.setItem(CHAVE_QUEM, JSON.stringify({ ...quem, solicitante: r.autor.trim() }));
    } catch { /* sem armazenamento */ }
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
    setReabertura(reaberturaVazia());
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
                    <ThOrdem col="urgencia" ordem={ordem} onOrdenar={ordenarPor}>Urgência</ThOrdem>
                    <ThOrdem col="anexos" ordem={ordem} onOrdenar={ordenarPor}>Anexos</ThOrdem>
                    <ThOrdem col="status" ordem={ordem} onOrdenar={ordenarPor}>Status</ThOrdem>
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
                              <p className="reportes-texto" title={c.titulo}>{c.titulo}</p>
                            </div>
                          </td>
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
                            <span className="reportes-status" style={{ ['--cor' as string]: c.cor }}>
                              <span className="reportes-ponto" style={{ background: c.cor }} />
                              {c.status}
                            </span>
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
                          <td colSpan={7}>
                            <div className={`revelar${abertaAqui ? ' aberto' : ''}`}>
                              <div>
                                <div className="reportes-detalhe-corpo chm-detalhe">
                                  <TextoRico texto={c.descricao} className="reportes-detalhe-texto" />
                                  <ListaDeLinks links={c.links} />
                                  <ChipsDeAnexos chamado={c} anexos={c.anexos.filter(a => !a.reabertura)}
                                    onVer={i => setVendo({ chamado: c, indice: i })} />
                                  {/* As reaberturas, uma embaixo da outra: o que
                                      o cliente escreveu cada vez que pediu o
                                      chamado de volta. Só aparecem se houver. */}
                                  {c.reaberturas.length > 0 && (
                                    <>
                                      <p className="chm-historico-titulo">
                                        {c.reaberturas.length === 1 ? 'Reabertura' : `Reaberturas (${c.reaberturas.length})`}
                                      </p>
                                      <ol className="chm-historico">
                                        {c.reaberturas.map((ev, i) => (
                                          <PassoDaReabertura key={`${ev.seq ?? 'nova'}-${i}`} ev={ev} chamado={c}
                                            onVer={j => setVendo({ chamado: c, indice: j })} />
                                        ))}
                                      </ol>
                                    </>
                                  )}
                                  {encerrado && !c.reabrindo && (
                                    <div className="chm-detalhe-acoes surge">
                                      <span>Precisa de mais alguma coisa neste chamado?</span>
                                      <button type="button" className="reportes-acao"
                                        onClick={e => { e.stopPropagation(); setErroReabertura(null); setReabrindo(c.numero); }}>
                                        <IconUndo size={12} /> Reabrir chamado
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
        <FormularioDoChamado rascunho={rascunho} erro={erroEnvio}
          onMudar={setRascunho}
          onFechar={() => setFormAberto(false)}
          onEnviar={r => { setFormAberto(false); void enviar(r); }} />
      )}

      {reabrindo != null && (() => {
        const alvo = chamados.find(c => c.numero === reabrindo);
        if (!alvo) return null;
        return (
          <FormularioDeReabertura chamado={alvo} rascunho={reabertura} erro={erroReabertura}
            onMudar={setReabertura}
            onFechar={() => setReabrindo(null)}
            onEnviar={r => { setReabrindo(null); void reabrir(alvo.numero!, r); }} />
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

/** Uma reabertura: quem pediu de volta, quando, e o que veio junto. */
function PassoDaReabertura({ ev, chamado, onVer }: {
  ev: Reabertura; chamado: Chamado; onVer: (indice: number) => void;
}) {
  const anexos = ev.seq == null
    ? chamado.anexos.filter(a => a.reabertura === -1)
    : chamado.anexos.filter(a => a.reabertura === ev.seq);
  return (
    <li className={`chm-passo chm-passo-reaberto${ev.seq == null ? ' enviando' : ''}`}>
      <span className="chm-passo-ponto"><IconUndo size={9} /></span>
      <p className="chm-passo-linha">
        <strong>{ev.autor}</strong> reabriu o chamado
        {ev.seq == null && <IconSpinner size={11} />}
      </p>
      <p className="chm-passo-quando">{instante(ev.em)}</p>
      <div className="chm-passo-corpo">
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

/** O formulário do chamado, no centro da tela. O rascunho mora em quem abre:
 *  fechar sem querer e reabrir devolve o que já estava escrito. */
function FormularioDoChamado({ rascunho, erro, onMudar, onFechar, onEnviar }: {
  rascunho: Rascunho;
  erro: string | null;
  onMudar: (r: Rascunho) => void;
  onFechar: () => void;
  onEnviar: (r: Rascunho) => void;
}) {
  const [erroCampo, setErroCampo] = useState<string | null>(null);
  const r = rascunho;
  const mudar = (parte: Partial<Rascunho>) => onMudar({ ...r, ...parte });
  const pronto = r.titulo.trim().length >= 3 && r.descricao.trim().length >= 5 && r.solicitante.trim().length >= 2;

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
          <input className="form-input" value={r.solicitante} maxLength={80} placeholder="Seu nome"
            onChange={e => mudar({ solicitante: e.target.value })} />
        </label>
        <label className="form-group">
          <span className="form-label">E-mail <em className="chm-opcional">(opcional, para retorno)</em></span>
          <input className="form-input" type="email" value={r.email} maxLength={120} placeholder="voce@empresa.com"
            onChange={e => mudar({ email: e.target.value })} />
        </label>
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
function FormularioDeReabertura({ chamado, rascunho, erro, onMudar, onFechar, onEnviar }: {
  chamado: Chamado;
  rascunho: RascunhoDeReabertura;
  erro: string | null;
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
        <input className="form-input" value={r.autor} maxLength={80} placeholder="Seu nome"
          onChange={e => mudar({ autor: e.target.value })} />
      </label>
      <CampoDeLinks links={r.links} onMudar={links => mudar({ links })} onErro={setErroCampo} />
      <CampoDeAnexos anexos={r.anexos} onMudar={anexos => mudar({ anexos })} onErro={setErroCampo} />
      {(erro || erroCampo) && (
        <p className="pub-pedido-erro surge"><IconX size={11} /> {erroCampo ?? erro}</p>
      )}
    </Janela>
  );
}
