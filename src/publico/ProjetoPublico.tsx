// ─────────────────────────────────────────────────────────────────────────────
//  Acompanhamento do projeto, para o cliente.
//
//  Página de leitura, e só. Não há formulário, não há botão que grave nada, e
//  não há caminho daqui para o portal interno - nem link de entrada, nem menção
//  a ele. O que chega aqui é o que a rota pública devolve, que é um punhado de
//  campos escolhidos a dedo.
//
//  Mora fora de `src/admin` de propósito: nada deste arquivo importa de lá, e
//  por isso o código do portal nem é baixado por quem abre este link.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react';
import { logoDoCliente } from '../lib/marcas';
// Vive em `components/`, e não em `admin/`: dá para reusar aqui sem arrastar o
// portal junto, e o filtro fica com o mesmo desenho dos dois lados.
import FilterDropdown from '../components/FilterDropdown';
import {
  IconAgrupar, IconChevronRight, IconMarcoAndamento, IconMarcoBloqueado, IconMarcoCancelado,
  IconMarcoConcluido, IconMarcoPlanejado, IconMarcoValidado, IconOrdenar, IconSearch, IconX,
} from '../components/icons';
import { porNivelDeContato } from '../lib/papeisDeEquipe';

interface Evidencia {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
  criado_em: string;
  etapa: string;
}

interface Entrega {
  id: number;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: string;
  prazo: string | null;
  progresso: number;
  responsaveis: { nome: string; foto_url: string | null }[];
  evidencias: Evidencia[];
  tarefas_total: number;
  tarefas_feitas: number;
}

interface Dados {
  projeto: {
    nome: string;
    descricao: string | null;
    status: string;
    previsao_entrega: string | null;
    progresso: number;
    publicado_em: string | null;
    cliente: string | null;
  };
  equipe: { nome: string; papel: string; foto_url: string | null }[];
  entregas: Entrega[];
  ordem_status: string[];
}

/** O mesmo desenho de dentro: cada situação tem seu marco, e é ele que abre a
 *  linha da entrega. Repetir o ícone do painel evita que o cliente e a equipe
 *  falem de "aquela bolinha" com desenhos diferentes na cabeça. */
const ICONE: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Planejada': IconMarcoPlanejado,
  'Em andamento': IconMarcoAndamento,
  'Bloqueada': IconMarcoBloqueado,
  'Entregue': IconMarcoConcluido,
  'Validada': IconMarcoValidado,
  'Cancelada': IconMarcoCancelado,
};

const ORDENS = [
  { valor: 'padrao', label: 'Ordem do projeto' },
  { valor: 'prazo', label: 'Prazo mais próximo' },
  { valor: 'titulo', label: 'Título (A a Z)' },
  { valor: 'progresso', label: 'Mais avançadas' },
] as const;

/** A ordem em que os grupos de situação aparecem para o cliente. Não é a ordem
 *  do fluxo de trabalho, que vem da rota em `ordem_status`: é a ordem da
 *  conversa. Primeiro o que está travado e o que acabou de chegar para ele
 *  olhar, depois o que está em curso, e por último o que já se resolveu ou nem
 *  começou. Situação que não estiver nesta lista cai no fim. */
const ORDEM_GRUPOS = [
  'Bloqueada', 'Entregue', 'Em andamento', 'Validada', 'Planejada', 'Cancelada',
];

const AGRUPAMENTOS = [
  { valor: 'nenhum', label: 'Sem agrupamento' },
  { valor: 'categoria', label: 'Categoria' },
  { valor: 'status', label: 'Situação' },
  { valor: 'responsavel', label: 'Responsável' },
] as const;

/** As mesmas cores de dentro: a entrega bloqueada é vermelha nos dois lados. */
const COR: Record<string, string> = {
  'Planejada': '#8A8B84',
  'Em andamento': '#B58300',
  'Bloqueada': '#D93025',
  'Entregue': '#7C3AED',
  'Validada': '#23A455',
  'Cancelada': '#8A857A',
};

/** Onde a situação entra na ordem dos grupos. Desconhecida vai para o fim. */
const posicaoDoGrupo = (st: string) => {
  const i = ORDEM_GRUPOS.indexOf(st);
  return i === -1 ? ORDEM_GRUPOS.length : i;
};

const fmtData = (v: string | null) => {
  if (!v) return null;
  const [a, m, d] = v.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : null;
};

const fmtTamanho = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

const ehImagem = (tipo: string) => tipo.startsWith('image/');

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2)
  .map(p => p[0]?.toUpperCase() ?? '').join('');

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return <img className="pub-avatar" src={foto} alt="" referrerPolicy="no-referrer"
      onError={() => setFalhou(true)} />;
  }
  return <span className="pub-avatar pub-avatar-vazio">{iniciais(nome)}</span>;
}

function Logo({ cliente }: { cliente: string | null }) {
  const marca = logoDoCliente(cliente);
  if (!marca) {
    return cliente ? <span className="pub-cliente-nome">{cliente}</span> : null;
  }
  // Logo de uma cor só é máscara pintada por trás; as demais entram como
  // imagem. É a mesma regra do carrossel da entrada.
  if (marca.cor) {
    return (
      <span
        className="pub-logo"
        role="img"
        aria-label={cliente ?? 'Cliente'}
        style={{
          height: marca.altura,
          width: marca.altura * (marca.proporcao ?? 3),
          background: marca.cor,
          maskImage: `url(${marca.src})`,
          WebkitMaskImage: `url(${marca.src})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
        }}
      />
    );
  }
  return (
    <img className="pub-logo" src={marca.src} alt={cliente ?? 'Cliente'}
      style={{ height: marca.altura, filter: marca.escurecer ? 'brightness(0.2)' : undefined }} />
  );
}

/** Seletor de uma opção só, no desenho enxuto da página: gatilho de ícone e a
 *  lista logo abaixo. Não é o do portal - nada aqui importa de `src/admin`. */
function Seletor({ valor, opcoes, icone: Icone, rotulo, onChange }: {
  valor: string;
  opcoes: readonly { valor: string; label: string }[];
  icone: (p: { size?: number }) => JSX.Element;
  rotulo: string;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const atual = opcoes.find(o => o.valor === valor);
  return (
    <div className="pub-seletor" ref={caixa}>
      <button type="button" title={`${rotulo}: ${atual?.label ?? ''}`} aria-label={rotulo}
        aria-expanded={aberto} className={aberto ? 'aberto' : undefined}
        onClick={() => setAberto(a => !a)}>
        <Icone size={14} />
      </button>
      {aberto && (
        <div className="pub-seletor-lista" role="listbox" aria-label={rotulo}>
          {opcoes.map(o => (
            <button key={o.valor} type="button" role="option" aria-selected={o.valor === valor}
              className={o.valor === valor ? 'ativo' : undefined}
              onClick={() => { onChange(o.valor); setAberto(false); }}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A linha da entrega, no mesmo desenho do painel de dentro: o marco da
 *  situação abre a linha, o título ocupa o meio, e prazo, contagem de tarefas
 *  e percentual fecham à direita. */
function LinhaEntrega({ e, aberta, onAlternar, onAbrirPrevia }: {
  e: Entrega;
  aberta: boolean;
  onAlternar: () => void;
  onAbrirPrevia: (ev: Evidencia) => void;
}) {
  const cor = COR[e.status] ?? '#8A8B84';
  const Marco = ICONE[e.status] ?? IconMarcoPlanejado;
  const feita = e.status === 'Validada';
  // Sem descrição e sem evidência não há o que abrir: a linha deixa de fingir
  // que leva a algum lugar.
  const temDetalhe = !!e.descricao || e.evidencias.length > 0;
  // O conteúdo nasce junto com a abertura, não um quadro depois: montado por
  // efeito, a primeira abertura animaria de nada para nada e só então apareceria
  // de supetão. Uma vez montado, fica - fechar e reabrir não recomeça do zero.
  const [jaAbriu, setJaAbriu] = useState(false);
  if (aberta && !jaAbriu) setJaAbriu(true);

  return (
    <li className={`pub-entrega${aberta ? ' aberta' : ''}${temDetalhe ? ' abrivel' : ''}`}>
      <button type="button" className="pub-entrega-topo"
        disabled={!temDetalhe} aria-expanded={temDetalhe ? aberta : undefined}
        onClick={onAlternar}>
      <span className="pub-marco" title={`Situação: ${e.status}`}
        style={{ ['--mc' as string]: cor }}>
        <Marco size={14} />
      </span>
      <span className="pub-entrega-meio">
        <span className="pub-entrega-titulo" title={e.titulo}>{e.titulo}</span>
        {temDetalhe && (
          <span className="pub-seta" aria-hidden="true"><IconChevronRight size={12} /></span>
        )}
        {e.categoria && <span className="pub-categoria">{e.categoria}</span>}
        {e.descricao && <span className="pub-entrega-desc">{e.descricao}</span>}
      </span>
      <span className="pub-entrega-fim">
        {/* Quem responde pela entrega, antes do prazo: é a pergunta que vem
            junto com "como está" - com quem falo sobre isso. */}
        {e.responsaveis.length > 0 && (
          <span className="pub-donos">
            {e.responsaveis.map(p => (
              <span key={p.nome} title={p.nome}>
                <Avatar nome={p.nome} foto={p.foto_url} />
              </span>
            ))}
          </span>
        )}
        {fmtData(e.prazo) && <span className="pub-prazo">{fmtData(e.prazo)}</span>}
        {e.tarefas_total > 0 && (
          <span className="pub-tarefas" title={`${e.tarefas_feitas} de ${e.tarefas_total} tarefas concluídas`}>
            {e.tarefas_feitas}/{e.tarefas_total} tarefas
          </span>
        )}
        <span className="pub-pct" style={{ color: feita ? cor : undefined }}>
          {e.progresso}%
        </span>
      </span>
      </button>

      {temDetalhe && (
        <div className={`pub-detalhe${aberta ? ' aberta' : ''}`}>
          <div>
            <div className="pub-detalhe-corpo">
              {jaAbriu && (<>
                {e.descricao && <p className="pub-detalhe-desc">{e.descricao}</p>}
                {e.evidencias.length > 0 && (
                  <div className="pub-evidencias">
                    <p className="pub-evidencias-titulo">
                      Evidências
                      <span>{e.evidencias.length}</span>
                    </p>
                    <ul>
                      {e.evidencias.map(ev => (
                        <li key={ev.id}>
                          <button type="button" onClick={() => onAbrirPrevia(ev)}
                            title={ehImagem(ev.tipo) ? `Ver ${ev.nome}` : `Abrir ${ev.nome}`}>
                            <span className="pub-ev-etapa">{ev.etapa}</span>
                            <span className="pub-ev-nome">{ev.nome}</span>
                            <span className="pub-ev-peso">{fmtTamanho(ev.tamanho)}</span>
                            <span className="pub-ev-data">{fmtData(ev.criado_em)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>)}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

/** Prévia da evidência. Imagem abre aqui mesmo; o resto oferece o download,
 *  porque PDF e planilha o navegador abre melhor do que qualquer visualizador
 *  que eu desenhasse. */
function Previa({ evidencia, token, onFechar }: {
  evidencia: Evidencia;
  token: string;
  onFechar: () => void;
}) {
  const [dados, setDados] = useState<{ nome: string; tipo: string; base64: string } | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projeto-publico?token=${encodeURIComponent(token)}&anexo=${evidencia.id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sem acesso'))))
      .then(d => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [evidencia.id, token]);

  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [onFechar]);

  function baixar() {
    if (!dados) return;
    const a = document.createElement('a');
    a.href = `data:${dados.tipo};base64,${dados.base64}`;
    a.download = dados.nome;
    a.click();
  }

  return (
    <div className="pub-previa" role="dialog" aria-modal="true" aria-label={evidencia.nome}
      onClick={onFechar}>
      <div className="pub-previa-caixa" onClick={ev => ev.stopPropagation()}>
        <div className="pub-previa-topo">
          <span>
            <strong>{evidencia.nome}</strong>
            <em>{evidencia.etapa} · {fmtTamanho(evidencia.tamanho)}</em>
          </span>
          <button type="button" aria-label="Fechar" onClick={onFechar}>
            <IconX size={16} />
          </button>
        </div>

        <div className="pub-previa-corpo">
          {erro ? (
            <p className="pub-nada">Não foi possível abrir este arquivo.</p>
          ) : !dados ? (
            <div className="pub-girando" />
          ) : ehImagem(dados.tipo) ? (
            <img src={`data:${dados.tipo};base64,${dados.base64}`} alt={dados.nome} />
          ) : (
            <p className="pub-nada">
              Este arquivo não abre na tela. Baixe para ver no seu computador.
            </p>
          )}
        </div>

        <div className="pub-previa-pe">
          <button type="button" disabled={!dados} onClick={baixar}>Baixar</button>
        </div>
      </div>
    </div>
  );
}

/** Os números que o cliente procura primeiro: quanto já foi aceito, o que está
 *  sendo trabalhado agora e o que já foi entregue esperando o aceite.
 *
 *  Mesmo cartão do funil, por dentro: rótulo em caixa alta, número grande na
 *  cor da situação e uma linha de contexto embaixo. Quem vê os dois lados
 *  reconhece o mesmo desenho.
 *
 *  Não são clicáveis de propósito. Filtrar já tem lugar próprio logo abaixo, e
 *  um cartão que às vezes filtra e às vezes não confunde mais do que ajuda. */
function Indicadores({ entregas }: { entregas: Entrega[] }) {
  const validadas = entregas.filter(e => e.status === 'Validada').length;
  const andando = entregas.filter(e => e.status === 'Em andamento').length;
  const entregues = entregas.filter(e => e.status === 'Entregue').length;
  // A fração aceita, no lugar da barra que ficava acima: o número já está ali,
  // e a porcentagem é a mesma leitura sem custar uma faixa inteira de tela.
  const pctValidadas = entregas.length > 0
    ? Math.round((validadas / entregas.length) * 100)
    : 0;

  const cartoes = [
    {
      chave: 'validadas',
      valor: String(validadas),
      // Só aparece havendo entrega: "0 (0%)" numa lista vazia é ruído.
      fracao: entregas.length > 0 ? `${pctValidadas}%` : null,
      rotulo: 'Validadas',
      nota: `de ${entregas.length} no total`,
      cor: COR['Validada'],
    },
    {
      chave: 'andando',
      valor: String(andando),
      rotulo: 'Em andamento',
      fracao: null,
      nota: andando === 1 ? 'sendo trabalhada agora' : 'sendo trabalhadas agora',
      cor: COR['Em andamento'],
    },
    {
      chave: 'entregues',
      valor: String(entregues),
      rotulo: 'Entregues',
      fracao: null,
      nota: 'aguardando seu aceite',
      cor: COR['Entregue'],
    },
  ];

  return (
    <div className="pub-kpis">
      {cartoes.map((c, i) => (
        <div key={c.chave} className="admin-stat-card-v2"
          style={{ '--accent-color': c.cor, animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
          <p className="stat-v2-label">{c.rotulo}</p>
          <p className="stat-v2-value">
            {c.valor}
            {c.fracao && <span className="stat-v2-fracao">{c.fracao}</span>}
          </p>
          <p className="stat-v2-desc">{c.nota}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProjetoPublico({ token }: { token: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  /** Recortes. Filtrar é olhar de outro jeito, não editar. */
  const [fSituacao, setFSituacao] = useState<string[]>([]);
  const [fCategoria, setFCategoria] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  /** Entregas com o detalhe aberto, e a evidência em prévia. */
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const [previa, setPrevia] = useState<Evidencia | null>(null);
  /** Grupos recolhidos, por nome. */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<string>('padrao');
  // Agrupado por situação desde a primeira olhada: a lista corrida obrigava o
  // cliente a varrer 46 linhas para descobrir o que está travado.
  const [agrupamento, setAgrupamento] = useState<string>('status');

  // Trocar o critério de agrupamento reabre tudo: senão a pessoa muda de eixo e
  // encontra uma lista fechada que ela não fechou.
  useEffect(() => { setRecolhidos(new Set()); }, [agrupamento]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projeto-publico?token=${encodeURIComponent(token)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sem acesso'))))
      .then(d => { if (vivo) setDados(d); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [token]);

  useEffect(() => {
    if (dados) document.title = `${dados.projeto.nome} - Acompanhamento`;
  }, [dados]);

  if (erro) {
    return (
      <div className="pub-vazio">
        <h1>Página não encontrada</h1>
        <p>
          Este link não está mais disponível. Se você recebeu ele de alguém da
          equipe, peça um link novo.
        </p>
      </div>
    );
  }

  if (!dados) {
    return <div className="pub-vazio"><div className="pub-girando" /></div>;
  }

  const { projeto, equipe, entregas, ordem_status } = dados;
  // Na mesma ordem dos grupos: o filtro lista as situações como a página as
  // mostra, senão a primeira opção da lista seria a última da tela.
  const situacoes = ordem_status
    .filter(st => entregas.some(e => e.status === st))
    .sort((x, y) => posicaoDoGrupo(x) - posicaoDoGrupo(y));

  const categorias = [...new Set(entregas.map(e => e.categoria).filter(Boolean))]
    .sort((a, b) => a!.localeCompare(b!, 'pt-BR')) as string[];

  const q = busca.trim().toLocaleLowerCase('pt-BR');
  const filtradas = entregas.filter(e =>
    (fSituacao.length === 0 || fSituacao.includes(e.status))
    && (fCategoria.length === 0 || fCategoria.includes(e.categoria ?? ''))
    // A busca olha título, categoria e descrição: é onde o cliente procura o
    // nome do módulo que ele conhece, que nem sempre é o do título.
    && (!q || [e.titulo, e.categoria, e.descricao].some(v =>
      (v ?? '').toLocaleLowerCase('pt-BR').includes(q))));

  const lista = [...filtradas].sort((a, b) => {
    if (ordem === 'titulo') return a.titulo.localeCompare(b.titulo, 'pt-BR');
    // Sem prazo vai para o fim: nada é mais distante que uma data que não existe.
    if (ordem === 'prazo') return (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999');
    if (ordem === 'progresso') return b.progresso - a.progresso;
    return ordem_status.indexOf(a.status) - ordem_status.indexOf(b.status);
  });

  /** O resultado visível, como uma linha só: serve de `key` da lista, e a troca
   *  de chave remonta os itens para a animação de entrada tocar de novo. Uma
   *  letra a mais que não muda o resultado não reanima nada. */
  const assinatura = lista.map(e => e.id).join(',');

  const grupos = agrupamento === 'nenhum' ? [{ nome: '', itens: lista }] : (() => {
    // Entrega com dois responsáveis aparece nos dois grupos: ela é de ambos, e
    // esconder uma cópia faria o cliente procurar e não achar.
    const chavesDe = (e: Entrega): string[] => {
      if (agrupamento === 'status') return [e.status];
      if (agrupamento === 'categoria') return [e.categoria || 'Sem categoria'];
      return e.responsaveis.length
        ? e.responsaveis.map(p => p.nome)
        : ['Sem responsável'];
    };
    const mapa = new Map<string, Entrega[]>();
    // Por situação, todas aparecem, mesmo as vazias: o cliente lê "nada
    // bloqueado" em vez de ter que deduzir isso da ausência de um bloco. Com
    // um filtro de situação ligado, só as escolhidas: ali ele já disse o que
    // quer ver. Categoria e responsável não entram nisso - a lista deles vem
    // dos próprios dados, e nomes de gente sem entrega nenhuma seria ruído.
    if (agrupamento === 'status') {
      for (const st of ordem_status) {
        if (fSituacao.length === 0 || fSituacao.includes(st)) mapa.set(st, []);
      }
    }
    for (const e of lista) {
      for (const k of chavesDe(e)) {
        const itens = mapa.get(k);
        if (itens) itens.push(e); else mapa.set(k, [e]);
      }
    }
    // O balde de sobra vai para o fim: o que não foi classificado não abre a
    // lista.
    const sobra = agrupamento === 'categoria' ? 'Sem categoria' : 'Sem responsável';
    const ordena = agrupamento === 'status'
      ? (a: string, b: string) => posicaoDoGrupo(a) - posicaoDoGrupo(b)
      : (a: string, b: string) => (a === sobra ? 1 : b === sobra ? -1
        : a.localeCompare(b, 'pt-BR'));
    return [...mapa.entries()].sort((x, y) => ordena(x[0], y[0]))
      .map(([nome, itens]) => ({ nome, itens }));
  })();

  return (
    <div className="pub-pagina">
      {/* Faixa de ponta a ponta com o essencial: de que projeto se trata e de
          quem ele é. A descrição desceu para uma seção própria - no cabeçalho
          ela empurrava a marca do cliente para longe do nome. */}
      <header className="pub-topo">
        <div className="pub-topo-dentro">
          <div className="pub-topo-texto">
            <p className="pub-sobre">Acompanhamento do projeto</p>
            <h1 className="pub-nome">{projeto.nome}</h1>
          </div>
          <div className="pub-topo-marca"><Logo cliente={projeto.cliente} /></div>
        </div>
      </header>

      <div className="pub">

      {projeto.descricao && (
        <section className="pub-secao">
          <div className="pub-secao-cabeca">
            <h2 className="pub-secao-titulo">Sobre</h2>
          </div>
          <p className="pub-descricao">{projeto.descricao}</p>
        </section>
      )}

      <section className="pub-secao">
        <div className="pub-secao-cabeca">
          <h2 className="pub-secao-titulo">Equipe</h2>
        </div>
        {equipe.length === 0 ? (
          <p className="pub-nada">Nenhuma pessoa alocada ainda.</p>
        ) : (
          // Todo mundo lado a lado, numa galeria só. A ordem continua sendo a
          // de contato com o cliente - quem abre a conversa aparece primeiro -,
          // mas sem faixa e sem rótulo de degrau: para quem olha de fora, o
          // time é um time, e o papel de cada um já está embaixo do nome.
          <ul className="pub-galeria">
            {porNivelDeContato(equipe, p => p.papel)
              .flatMap(nivel => nivel.membros)
              .map(p => (
                <li key={p.nome}>
                  <Avatar nome={p.nome} foto={p.foto_url} />
                  <strong>{p.nome}</strong>
                  <span>{p.papel}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="pub-secao">
        <div className="pub-secao-cabeca">
          <h2 className="pub-secao-titulo">Entregas</h2>
          <span className="pub-conta">{entregas.length}</span>
        </div>

        <Indicadores entregas={entregas} />

        <div className="pub-barra-ferramentas">
          <span className="pub-filtros-rotulo">Filtrar</span>
          <FilterDropdown
            label="Situação"
            values={fSituacao}
            options={situacoes.map(st => ({
              value: st,
              label: `${st} (${entregas.filter(e => e.status === st).length})`,
            }))}
            onChange={setFSituacao}
          />
          {categorias.length > 0 && (
            <FilterDropdown
              label="Categoria"
              values={fCategoria}
              options={categorias.map(c => ({
                value: c,
                label: `${c} (${entregas.filter(e => e.categoria === c).length})`,
              }))}
              onChange={setFCategoria}
            />
          )}
          {(fSituacao.length > 0 || fCategoria.length > 0) && (
            <button type="button" className="pub-limpar"
              onClick={() => { setFSituacao([]); setFCategoria([]); }}>
              Limpar
            </button>
          )}

          {/* Agrupar e ordenar, no mesmo canto do quadro de dentro. Nenhum
              deles grava nada. */}
          <div className="pub-ferramentas">
            <Seletor valor={agrupamento} opcoes={AGRUPAMENTOS} icone={IconAgrupar}
              rotulo="Agrupar entregas" onChange={setAgrupamento} />
            <Seletor valor={ordem} opcoes={ORDENS} icone={IconOrdenar}
              rotulo="Ordenar entregas" onChange={setOrdem} />
          </div>
        </div>

        {/* Numa faixa própria, de ponta a ponta. Sempre à vista, e não atrás de
            um botão: numa lista de dezenas de entregas, procurar uma é o
            primeiro gesto de quem chega. */}
        <div className="pub-busca">
          <IconSearch size={14} />
          <input
            value={busca}
            aria-label="Buscar entrega"
            placeholder="Buscar por título, categoria ou descrição"
            onChange={ev => setBusca(ev.target.value)}
            onKeyDown={ev => { if (ev.key === 'Escape') setBusca(''); }}
          />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
              <IconX size={12} />
            </button>
          )}
        </div>

        {lista.length === 0 ? (
          <p className="pub-nada">
            {q ? 'Nenhuma entrega encontrada para essa busca.' : 'Nenhuma entrega neste recorte.'}
          </p>
        ) : grupos.map(g => {
          const fechado = recolhidos.has(g.nome);
          return (
          // A árvore só existe havendo cabeçalho: sem agrupamento não há de
          // onde os ramos sairem.
          <div key={g.nome} className={`pub-grupo${g.nome ? ' arvore' : ''}`}>
            {g.nome && (
              <button type="button" className={`pub-grupo-titulo${fechado ? '' : ' aberto'}`}
                aria-expanded={!fechado}
                onClick={() => setRecolhidos(r => {
                  const n = new Set(r);
                  if (n.has(g.nome)) n.delete(g.nome); else n.add(g.nome);
                  return n;
                })}>
                <span className="pub-grupo-seta" aria-hidden="true" />
                {g.nome}
                <span>{g.itens.length}</span>
              </button>
            )}
            <div className={`grupo-corpo${fechado ? '' : ' aberto'}`}>
             <div>
            {g.itens.length === 0 ? (
              <p className="pub-grupo-vazio">Nenhuma entrega nesta situação.</p>
            ) : (
            <ul className="pub-entregas lista-anima" key={assinatura}>
              {g.itens.map(e => (
                <LinhaEntrega
                  key={e.id}
                  e={e}
                  aberta={abertas.has(e.id)}
                  onAlternar={() => setAbertas(a => {
                    const n = new Set(a);
                    if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                    return n;
                  })}
                  onAbrirPrevia={setPrevia}
                />
              ))}
            </ul>
            )}
             </div>
            </div>
          </div>
          );
        })}
      </section>

      {previa && (
        <Previa evidencia={previa} token={token} onFechar={() => setPrevia(null)} />
      )}

      <footer className="pub-rodape">
        <span>Sheep Technology</span>
        {fmtData(projeto.publicado_em) && <span>Publicado em {fmtData(projeto.publicado_em)}</span>}
      </footer>
      </div>
    </div>
  );
}
