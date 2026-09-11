// ─────────────────────────────────────────────────────────────────────────────
//  A gaveta da análise de vaga.
//
//  Entra o que se sabe da vaga - texto colado, o PDF que o cliente mandou, o
//  print da conversa no WhatsApp - e sai a casa inteira em ordem de encaixe,
//  lida e ordenada pelo modelo da Anthropic. Não é filtro nem busca: é leitura.
//
//  Duas abas, como no painel de projeto: a análise nova e o histórico. Toda
//  consulta fica gravada, e o histórico é só de leitura - relatório guardado é
//  retrato de um dia, e retrato não se corrige. O que se pode fazer com um é
//  refazê-lo: mesma pergunta, base de hoje, entrada nova no histórico. Assim dá
//  para pôr as duas leituras lado a lado em vez de perder a primeira.
//
//  A gaveta é só a tela. Quem chama o servidor e guarda o resultado da análise
//  em curso é a página, de propósito: assim fechar a gaveta no meio da análise
//  não joga fora o que já foi pago, e reabri-la mostra o que chegou enquanto ela
//  estava fechada.
//
//  O rodapé diz qual modelo respondeu e quando. Uma leitura de máquina que não
//  se identifica vira "o sistema disse", e ninguém confere o que o sistema
//  disse - é uma lista de gente, e ela se confere.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from './FormularioTarefa';
import { Abas } from '../components/Abas';
import { Skeleton } from '../components/Skeleton';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { useLarguraPainel } from '../lib/painelLateral';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import {
  IconAlert, IconArrowLeft, IconCheck, IconChevronRight, IconDoc, IconHelp, IconImage,
  IconRefresh, IconRelogio, IconSparkles, IconSpinner, IconTrash, IconUpload, IconUser, IconX,
} from '../components/icons';

/** Um anexo já lido: o `base64` é a data URL inteira, que serve de prévia na
 *  tela e vai para o servidor sem uma segunda leitura do arquivo. */
export interface AnexoDaVaga {
  nome: string;
  tipo: string;
  tamanho: number;
  base64: string;
}

/** Um requisito da vaga, respondido para uma pessoa. A lista é a mesma para
 *  todo mundo e na mesma ordem: é isso que faz duas pessoas se compararem
 *  linha a linha, em vez de cada uma trazer os pontos que lhe convêm. */
export interface ItemDoChecklist {
  requisito: string;
  /** 'sem' é o item que a análise não respondeu - ausência de leitura, e não
   *  ausência do requisito. */
  situacao: 'atende' | 'parcial' | 'nao' | 'sem';
  nota: string;
}

export interface PessoaNoRanking {
  ref: string;
  tipo: 'interno' | 'externo';
  id: string;
  nome: string;
  foto_url: string | null;
  /** De 0 a 100. `null` é a pessoa que a análise não alcançou. */
  aderencia: number | null;
  veredito: 'forte' | 'possivel' | 'fraco';
  justificativa: string;
  /** A pessoa parou na triagem: a nota é a leitura rápida, e não houve parecer.
   *  Só o topo da triagem é lido em detalhe - é isso que faz a análise caber em
   *  um minuto em vez de cinco, e escalar para um banco de mil pessoas. */
  so_triagem?: boolean;
  /** O checklist da vaga, item por item. */
  checklist?: ItemDoChecklist[];
  /** Como era antes do checklist. Continua aqui porque análise guardada não se
   *  reescreve: as antigas seguem sendo lidas do jeito que foram gravadas. */
  pontos_fortes?: string[];
  lacunas?: string[];
}

/** O que a análise já fez, contado por ela mesma enquanto acontece. */
export interface AndamentoDaAnalise {
  fase: 'preparando' | 'lendo' | 'triando' | 'comparando' | 'fechando';
  /** Quantas pessoas o dossiê tem. Zero até o servidor dizer. */
  total: number;
  feitas: number;
  /** A última pessoa avaliada. */
  nome: string | null;
  /** O título da vaga, assim que o modelo termina de escrevê-lo. */
  titulo: string | null;
  /** Quantas letras da resposta já chegaram. É o sinal de vida do trecho em que
   *  o modelo escreve e ainda não há pessoa nenhuma para contar. */
  letras: number;
}

export interface AnaliseFeita {
  vaga: { titulo: string; resumo: string; requisitos: string[]; faltou: string | null };
  ranking: PessoaNoRanking[];
  observacoes: string;
  modelo: string;
  analisado_em: string;
  /** O que a análise gastou, somado das chamadas que ela fez. Vem da versão em
   *  funil; análise guardada antes dela não tem. */
  uso?: {
    chamadas: number;
    entrada: number;
    saida: number;
    cache_lido: number;
    cache_escrito: number;
    segundos: number;
  };
  /** A resposta bateu no teto de tamanho e foi aproveitada até onde deu. */
  cortado?: boolean;
  /** O id no histórico, que o servidor devolve ao gravar. */
  id?: string;
}

/** Uma linha do histórico - o bastante para escolher qual abrir. */
interface EntradaDoHistorico {
  id: string;
  criado_em: string;
  autor: string | null;
  titulo: string;
  pessoas: number;
  cortado: boolean;
  topo_nome: string | null;
  topo_nota: number | null;
  refeita: boolean;
  anexos: number;
}

/** Uma análise guardada, aberta para leitura. */
interface AnaliseGuardada {
  id: string;
  criado_em: string;
  autor: string | null;
  texto: string;
  refeita: boolean;
  anexos: { nome: string; tipo: string; tamanho: number }[];
  relatorio: AnaliseFeita;
}

const LIMITE_ANEXO = 5 * 1024 * 1024;
const MAX_ANEXOS = 5;
const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];

const peso = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const VEREDITOS: Record<PessoaNoRanking['veredito'], string> = {
  forte: 'Encaixa',
  possivel: 'Talvez',
  fraco: 'Não é para esta vaga',
};

function lerDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    fr.readAsDataURL(f);
  });
}

export function PainelAnaliseVaga({
  onFechar, texto, onTexto, anexos, onAnexos, resultado, carregando, erro,
  onAnalisar, onLimpar, onAbrirPessoa, andamento, api, onRefazer,
}: {
  onFechar: () => void;
  texto: string;
  onTexto: (v: string) => void;
  anexos: AnexoDaVaga[];
  onAnexos: (v: AnexoDaVaga[]) => void;
  resultado: AnaliseFeita | null;
  carregando: boolean;
  erro: string | null;
  onAnalisar: () => void;
  onLimpar: () => void;
  onAbrirPessoa: (tipo: 'interno' | 'externo', id: string) => void;
  /** O andamento da análise em curso. `null` quando não há nenhuma. */
  andamento: AndamentoDaAnalise | null;
  /** A busca do painel, para o histórico se virar sozinho. */
  api: (busca: string) => Promise<any>;
  /** Refaz uma análise guardada: mesma entrada, base de hoje. */
  onRefazer: (id: string) => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const painel = useLarguraPainel('analise-vaga');
  const raiz = useRef<HTMLDivElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const [aba, setAba] = useState<'nova' | 'historico'>('nova');
  const [arrastando, setArrastando] = useState(false);
  const [avisoDoAnexo, setAvisoDoAnexo] = useState<string | null>(null);

  // ── O histórico ────────────────────────────────────────────────────────────
  const [lista, setLista] = useState<EntradaDoHistorico[] | null>(null);
  const [aberta, setAberta] = useState<AnaliseGuardada | null>(null);
  const [carregandoAberta, setCarregandoAberta] = useState(false);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);

  const carregarLista = useCallback(async () => {
    const d = await api('action=analises_vaga').catch(() => null);
    if (!d) { setErroHistorico('Não foi possível carregar o histórico.'); return; }
    if (d.error) { setErroHistorico(d.error); return; }
    setErroHistorico(null);
    setLista(d.analises ?? []);
  }, [api]);

  // A lista entra na carga da gaveta - o número dela fica no rótulo da aba - e
  // de novo a cada análise gravada, que é o que faz a nova aparecer no topo.
  useEffect(() => { void carregarLista(); }, [carregarLista, resultado?.id]);

  const abrirGuardada = async (id: string) => {
    setCarregandoAberta(true);
    setErroHistorico(null);
    const d = await api(`action=analise_vaga&id=${encodeURIComponent(id)}`).catch(() => null);
    setCarregandoAberta(false);
    if (!d || d.error) { setErroHistorico(d?.error ?? 'Não foi possível abrir esta análise.'); return; }
    setAberta(d as AnaliseGuardada);
  };

  // ── Anexos ─────────────────────────────────────────────────────────────────
  const receber = async (arquivos: FileList | File[] | null | undefined) => {
    const arquivosNovos = [...(arquivos ?? [])];
    if (!arquivosNovos.length) return;
    setAvisoDoAnexo(null);
    const cabem = MAX_ANEXOS - anexos.length;
    if (cabem <= 0) { setAvisoDoAnexo(`São no máximo ${MAX_ANEXOS} anexos.`); return; }
    const novos: AnexoDaVaga[] = [];
    for (const f of arquivosNovos.slice(0, cabem)) {
      if (!TIPOS_ACEITOS.includes(f.type)) {
        setAvisoDoAnexo(`"${f.name}" não é imagem nem PDF - a IA só lê esses dois.`);
        continue;
      }
      if (f.size > LIMITE_ANEXO) {
        setAvisoDoAnexo(`"${f.name}" passa de 5 MB.`);
        continue;
      }
      try {
        novos.push({ nome: f.name || 'anexo', tipo: f.type, tamanho: f.size, base64: await lerDataUrl(f) });
      } catch {
        setAvisoDoAnexo(`Não foi possível ler "${f.name}".`);
      }
    }
    if (novos.length) onAnexos([...anexos, ...novos]);
  };

  /* Colar direto na gaveta, como no cartão de reportar: o print recém-recortado
     é o jeito mais comum de a vaga chegar. O ouvinte fica no documento porque o
     `paste` só nasce em quem tem o foco, e a colagem que tem dono - a área de
     texto da vaga - só é assumida quando esse dono está aqui dentro. */
  useEffect(() => {
    if (aba !== 'nova') return;
    const aoColar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const dono = alvo?.closest?.('input, textarea, [contenteditable="true"]');
      if (dono && !raiz.current?.contains(dono)) return;
      const dados = e.clipboardData;
      if (!dados) return;
      const arquivos = [...(dados.files ?? [])];
      const doItem = [...(dados.items ?? [])]
        .filter(i => i.kind === 'file')
        .map(i => i.getAsFile())
        .filter(Boolean) as File[];
      const uteis = (arquivos.length ? arquivos : doItem).filter(f => TIPOS_ACEITOS.includes(f.type));
      if (uteis.length) {
        // Só engole o evento quando havia arquivo: colar texto na descrição
        // continua sendo colar texto.
        e.preventDefault();
        void receber(uteis);
      }
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  });

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [fechar]);

  const podeAnalisar = (!!texto.trim() || anexos.length > 0) && !carregando;

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 10000 }} {...fundo}>
      <PuxadorDoPainel {...painel} />
      <div className="admin-modal painel-analise" ref={raiz}
        style={{ width: `min(${painel.largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>

        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="analise-sobretitulo">Banco de talentos</p>
            <h3 className="painel-titulo">
              <IconSparkles size={16} /> Analisar vaga com IA
            </h3>
            <Abas
              valor={aba}
              onChange={v => { setAba(v); setAberta(null); }}
              style={{ marginBottom: 0, marginTop: 8 }}
              opcoes={[
                { valor: 'nova', label: 'Nova análise' },
                { valor: 'historico', label: `Histórico${lista ? ` (${lista.length})` : ''}` },
              ]}
            />
          </div>
          <button type="button" className="admin-modal-close" aria-label="Fechar" onClick={fechar}>
            <IconX size={16} />
          </button>
        </div>

        {/* A classe da animação vai no próprio corpo, com a chave da aba: é ela
            que repete a entrada a cada troca e devolve a rolagem ao topo. */}
        <div className="admin-modal-body analise-corpo aba-painel" key={aba}>

          {aba === 'nova' && (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="analise-texto">A vaga ou a demanda</label>
                <textarea
                  id="analise-texto"
                  className="form-input analise-texto"
                  rows={7}
                  placeholder="Cole aqui a descrição da vaga, o pedido do cliente, o que precisa ser entregue e em quanto tempo."
                  value={texto}
                  onChange={e => onTexto(e.target.value)}
                />
              </div>

              <input ref={seletor} type="file" multiple accept="image/*,application/pdf"
                style={{ display: 'none' }}
                onChange={e => { void receber(e.target.files); e.target.value = ''; }} />

              {anexos.length > 0 && (
                <ul className="analise-anexos surge">
                  {anexos.map((a, i) => (
                    <li key={`${a.nome}-${i}`} className="analise-anexo">
                      {a.tipo === 'application/pdf'
                        ? <span className="analise-anexo-icone"><IconDoc size={14} /></span>
                        : <img className="analise-anexo-previa" src={a.base64} alt="" />}
                      <span className="analise-anexo-nome" title={a.nome}>{a.nome}</span>
                      <span className="analise-anexo-peso">{peso(a.tamanho)}</span>
                      <button type="button" className="analise-anexo-tirar"
                        aria-label={`Remover ${a.nome}`}
                        onClick={() => onAnexos(anexos.filter((_, j) => j !== i))}>
                        <IconTrash size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {anexos.length < MAX_ANEXOS && (
                // Soltar, clicar ou colar: três formas de chegar no mesmo arquivo,
                // porque cada pessoa recebe a vaga de um jeito.
                <button type="button"
                  className={`analise-solta${arrastando ? ' sobre' : ''}`}
                  onClick={() => seletor.current?.click()}
                  onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={e => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files); }}>
                  <IconImage size={14} />
                  <span>
                    <b>Anexe o PDF da vaga ou um print</b>
                    <small>solte aqui, clique ou cole com Ctrl+V</small>
                  </span>
                  <IconUpload size={13} />
                </button>
              )}

              {avisoDoAnexo && (
                <p className="analise-erro surge"><IconAlert size={11} /> {avisoDoAnexo}</p>
              )}

              <button type="button" className="btn btn-primary analise-botao"
                disabled={!podeAnalisar} onClick={onAnalisar}>
                {carregando
                  ? <><IconSpinner size={14} /> Analisando</>
                  : <><IconSparkles size={14} /> {resultado ? 'Analisar de novo' : 'Analisar'}</>}
              </button>

              {carregando && andamento && <Andamento andamento={andamento} />}

              {erro && <p className="analise-erro surge"><IconAlert size={12} /> {erro}</p>}

              {resultado && !carregando && (
                <div className="analise-resultado surge">
                  <Relatorio relatorio={resultado} onAbrirPessoa={onAbrirPessoa} />
                  <div className="analise-rodape">
                    <span>{assinatura(resultado)}</span>
                    <button type="button" className="analise-limpar" onClick={onLimpar}>Começar outra</button>
                  </div>
                </div>
              )}
            </>
          )}

          {aba === 'historico' && !aberta && (
            <>
              {erroHistorico && <p className="analise-erro"><IconAlert size={12} /> {erroHistorico}</p>}

              {lista === null && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[0, 1, 2].map(i => <Skeleton key={i} h={64} radius="12px" />)}
                </div>
              )}

              {lista?.length === 0 && (
                <p className="analise-ninguem">
                  Nenhuma análise ainda. Toda consulta feita na aba ao lado fica guardada aqui.
                </p>
              )}

              {!!lista?.length && (
                <ul className="analise-hist lista-anima" key={lista.length}>
                  {lista.map(e => (
                    <li key={e.id}>
                      <button type="button" className="analise-hist-item" onClick={() => void abrirGuardada(e.id)}>
                        <span className="analise-hist-texto">
                          <strong>{e.titulo}</strong>
                          <small>
                            <IconRelogio size={11} /> {quando(e.criado_em)}
                            {e.autor ? ` | ${e.autor}` : ''}
                            {` | ${e.pessoas} pessoas`}
                            {e.anexos > 0 ? ` | ${e.anexos} anexo${e.anexos > 1 ? 's' : ''}` : ''}
                            {e.refeita ? ' | refeita' : ''}
                          </small>
                        </span>
                        {e.topo_nome && (
                          <span className="analise-hist-topo">
                            <strong>{e.topo_nota}%</strong>
                            <small title={e.topo_nome}>{e.topo_nome}</small>
                          </span>
                        )}
                        <IconChevronRight size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {aba === 'historico' && aberta && (
            <div className="analise-guardada surge">
              <div className="analise-guardada-cabeca">
                <button type="button" className="analise-voltar" onClick={() => setAberta(null)}>
                  <IconArrowLeft size={13} /> Histórico
                </button>
                <button type="button" className="analise-refazer" disabled={carregando}
                  onClick={() => { setAba('nova'); setAberta(null); onRefazer(aberta.id); }}>
                  <IconRefresh size={13} /> Refazer com a base de hoje
                </button>
              </div>

              {/* O que foi perguntado fica à vista: sem isso, o relatório é uma
                  resposta sem pergunta. Em caixa de leitura, e não em campo:
                  análise guardada não se edita. */}
              <section className="analise-guardada-pergunta">
                <p className="analise-secao">O que foi perguntado</p>
                <p className="analise-guardada-texto">{aberta.texto || 'Só os anexos, sem texto digitado.'}</p>
                {aberta.anexos.length > 0 && (
                  <ul className="analise-anexos">
                    {aberta.anexos.map((a, i) => (
                      <li key={i} className="analise-anexo">
                        <span className="analise-anexo-icone">
                          {a.tipo === 'application/pdf' ? <IconDoc size={14} /> : <IconImage size={14} />}
                        </span>
                        <span className="analise-anexo-nome" title={a.nome}>{a.nome}</span>
                        <span className="analise-anexo-peso">{peso(a.tamanho)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Relatorio relatorio={aberta.relatorio} onAbrirPessoa={onAbrirPessoa} />

              <div className="analise-rodape">
                <span>
                  {assinatura(aberta.relatorio)}
                  {aberta.autor ? ` Pedida por ${aberta.autor}.` : ''}
                </span>
              </div>
            </div>
          )}

          {carregandoAberta && (
            <p className="analise-esperando-hist"><IconSpinner size={13} /> Abrindo a análise guardada.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A frase do rodapé: quem respondeu, quando, e o aviso de que aquilo é opinião
 *  de máquina. Vale para a análise nova e para a guardada. */
function assinatura(r: AnaliseFeita): string {
  const lidas = r.ranking.filter(p => !p.so_triagem).length;
  const triadas = r.ranking.length - lidas;
  // O que custou fica escrito junto: a análise é a ação mais cara do portal, e
  // "está consumindo demais" é uma conversa que só anda com número na mão.
  const conta = r.uso
    ? ` ${r.uso.chamadas} chamadas, ${Math.round((r.uso.entrada + r.uso.saida) / 1000)} mil tokens`
      + `, ${String(r.uso.segundos).replace('.', ',')}s.`
    : '';
  return `Leitura de ${r.modelo}, em ${quando(r.analisado_em)}.`
    + (triadas > 0
      ? ` Parecer detalhado de ${lidas} pessoas; as outras ${triadas} passaram só pela triagem.`
      : '')
    + conta
    + ' É opinião de máquina sobre o que está na base: confira antes de decidir.';
}

/** O andamento da análise em curso. */
function Andamento({ andamento }: { andamento: AndamentoDaAnalise }) {
  // O andamento é contado pelo servidor enquanto o modelo escreve, e não um
  // relógio fingindo progresso: a barra anda quando uma pessoa foi de fato
  // avaliada, e o nome que aparece é o dela.
  return (
    <div className="analise-andamento surge">
      <p className="analise-andamento-fase troca" key={andamento.fase}>
        <IconSpinner size={13} /> {fraseDaFase(andamento)}
      </p>
      {/* Antes da primeira pessoa não há o que contar, e é justamente o trecho
          mais longo: o tamanho do que já chegou é a prova de que a resposta
          está vindo. */}
      {andamento.feitas === 0 && andamento.letras > 0 && (
        <p className="analise-andamento-conta">
          <span>resposta chegando</span>
          <strong>{(andamento.letras / 1000).toFixed(1).replace('.', ',')} mil letras</strong>
        </p>
      )}
      {andamento.total > 0 && (
        <>
          <span className="talentos-media-trilho analise-trilho">
            <span className="talentos-media-tinta analise-tinta"
              style={{ width: `${Math.round((andamento.feitas / andamento.total) * 100)}%` }} />
          </span>
          <p className="analise-andamento-conta">
            <span>{andamento.feitas} de {andamento.total} pessoas</span>
            {andamento.nome && <strong className="troca" key={andamento.nome}>{andamento.nome}</strong>}
          </p>
        </>
      )}
    </div>
  );
}

/** O relatório em si - o mesmo desenho para a análise que acabou de sair e para
 *  a que foi aberta no histórico. Duas leituras iguais não podem ter duas
 *  caras. */
function Relatorio({ relatorio, onAbrirPessoa }: {
  relatorio: AnaliseFeita;
  onAbrirPessoa: (tipo: 'interno' | 'externo', id: string) => void;
}) {
  const [verDescartados, setVerDescartados] = useState(false);
  /** Uma vez aberto, o bloco fica montado: `.revelar` anima de nada para nada
   *  quando o conteúdo nasce junto com a classe. */
  const [jaViu, setJaViu] = useState(false);

  const mostrados = relatorio.ranking.filter(p => p.veredito !== 'fraco');
  const descartados = relatorio.ranking.filter(p => p.veredito === 'fraco');

  return (
    <>
      {relatorio.cortado && (
        <p className="analise-erro">
          <IconAlert size={12} /> A resposta bateu no teto de tamanho. O que está abaixo
          é o que chegou inteiro - quem ficou sem leitura aparece no fim, sem nota.
        </p>
      )}

      <section className="analise-leitura">
        <p className="analise-secao">O que a IA entendeu</p>
        <h4 className="analise-vaga-titulo">{relatorio.vaga.titulo}</h4>
        {relatorio.vaga.resumo && <p className="analise-vaga-resumo">{relatorio.vaga.resumo}</p>}
        {relatorio.vaga.requisitos.length > 0 && (
          <ul className="analise-requisitos">
            {relatorio.vaga.requisitos.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        {relatorio.vaga.faltou && (
          <p className="analise-faltou"><IconAlert size={11} /> {relatorio.vaga.faltou}</p>
        )}
      </section>

      <p className="analise-secao">
        Quem se encaixa
        <span className="analise-contagem">
          {relatorio.ranking.length} pessoas, da que mais encaixa à que menos
        </span>
      </p>

      <ol className="analise-ranking lista-anima" key={relatorio.analisado_em}>
        {mostrados.map((p, i) => (
          <LinhaDoRanking key={p.ref} pessoa={p} posicao={i + 1} onAbrir={onAbrirPessoa} />
        ))}
      </ol>

      {mostrados.length === 0 && (
        <p className="analise-ninguem">
          A IA não achou ninguém que encaixe nesta vaga. O que ela pensou de cada pessoa está abaixo.
        </p>
      )}

      {descartados.length > 0 && (
        <>
          <button type="button" className="analise-mais"
            onClick={() => { setVerDescartados(v => !v); setJaViu(true); }}
            aria-expanded={verDescartados}>
            <span className={`entrega-seta${verDescartados ? ' aberta' : ''}`}>
              <IconChevronRight size={13} />
            </span>
            {verDescartados ? 'Esconder' : 'Ver'} as {descartados.length} pessoas que ficaram de fora
          </button>
          <div className={`revelar${verDescartados ? ' aberto' : ''}`}>
            <div>
              {jaViu && (
                <ol className="analise-ranking analise-ranking-fraco">
                  {descartados.map((p, i) => (
                    <LinhaDoRanking key={p.ref} pessoa={p} posicao={mostrados.length + i + 1}
                      onAbrir={onAbrirPessoa} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}

      {relatorio.observacoes && (
        <section className="analise-observacoes">
          <p className="analise-secao">O recado da IA</p>
          <p>{relatorio.observacoes}</p>
        </section>
      )}
    </>
  );
}

/** O que dizer em cada etapa. A frase muda de assunto, e não só de número:
 *  "montando o dossiê" e "comparando" são trabalhos diferentes, e quem espera
 *  quer saber em qual dos dois está. */
function fraseDaFase(a: AndamentoDaAnalise): string {
  if (a.fase === 'preparando') return 'Enviando a vaga e montando o dossiê da casa.';
  if (a.fase === 'lendo') return `Lendo a vaga, com o dossiê de ${a.total} pessoas pronto.`;
  if (a.fase === 'triando') return 'Triagem rápida do banco inteiro, para saber quem merece leitura.';
  if (a.fase === 'fechando') return 'Fechando o relatório.';
  return a.titulo
    ? `Entendeu: ${a.titulo}. Agora escreve o parecer de quem passou.`
    : 'Escrevendo o parecer de quem passou.';
}

/** O desenho de cada situação do checklist. */
const SITUACAO: Record<ItemDoChecklist['situacao'], { icone: JSX.Element; titulo: string }> = {
  atende: { icone: <IconCheck size={11} />, titulo: 'Atende' },
  parcial: { icone: <IconAlert size={11} />, titulo: 'Atende em parte' },
  nao: { icone: <IconX size={10} />, titulo: 'Não atende' },
  sem: { icone: <IconHelp size={11} />, titulo: 'A análise não respondeu este item' },
};

/**
 * Uma pessoa na lista, no desenho das entregas: linha fechada com o essencial,
 * e o resto atrás de um clique.
 *
 * Fechado por padrão porque a lista tem trinta e tantas pessoas e a pergunta de
 * quem abre é "quem encaixa", não "por quê" - o porquê é a pergunta seguinte, e
 * ela se faz numa pessoa de cada vez. O conteúdo fica montado depois da
 * primeira abertura: montado só enquanto aberto, o bloco animaria de nada para
 * nada.
 */
function LinhaDoRanking({ pessoa, posicao, onAbrir }: {
  pessoa: PessoaNoRanking;
  posicao: number;
  onAbrir: (tipo: 'interno' | 'externo', id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [jaAbriu, setJaAbriu] = useState(false);
  const nota = pessoa.aderencia;
  const checklist = pessoa.checklist ?? [];
  const atendidos = checklist.filter(i => i.situacao === 'atende').length;
  const antigos = [...(pessoa.pontos_fortes ?? []), ...(pessoa.lacunas ?? [])].length > 0;

  return (
    <li className={`admin-file-item analise-pessoa veredito-${pessoa.veredito}${aberto ? ' aberta' : ''}`}>
      <div className="entrega-linha analise-pessoa-linha">
        <span className="analise-posicao">{posicao}</span>
        <Avatar nome={pessoa.nome} foto={pessoa.foto_url} size={28} />
        <button type="button" className="analise-pessoa-abre" aria-expanded={aberto}
          onClick={() => { setAberto(a => !a); setJaAbriu(true); }}>
          <span className="analise-pessoa-quem">
            <strong>{pessoa.nome}</strong>
            <small>
              {pessoa.tipo === 'interno' ? 'Do time' : 'Interessado'}
              {' | '}
              {pessoa.so_triagem ? 'Ficou na triagem' : VEREDITOS[pessoa.veredito]}
            </small>
          </span>
          <span className={`entrega-seta${aberto ? ' aberta' : ''}`}>
            <IconChevronRight size={12} />
          </span>
        </button>

        {checklist.length > 0 && (
          <span className="analise-check-conta" title={`${atendidos} de ${checklist.length} requisitos atendidos`}>
            {atendidos}/{checklist.length}
          </span>
        )}

        <span className="analise-aderencia">
          {nota == null ? <em>sem leitura</em> : <><strong>{nota}</strong><small>%</small></>}
        </span>

        {/* A ficha da pessoa fica num botão só dela: a linha inteira agora abre
            o detalhe, e um clique que às vezes expande e às vezes troca de tela
            seria um clique em que não se confia. */}
        <button type="button" className="analise-ficha" aria-label={`Abrir a ficha de ${pessoa.nome}`}
          title="Abrir a ficha" onClick={() => onAbrir(pessoa.tipo, pessoa.id)}>
          <IconUser size={13} />
        </button>
      </div>

      <span className="talentos-media-trilho analise-trilho">
        <span className="talentos-media-tinta analise-tinta" style={{ width: `${nota ?? 0}%` }} />
      </span>

      <div className={`entrega-detalhe${aberto ? ' aberta' : ''}`}>
        <div>
          {jaAbriu && (
            <div className="analise-detalhe">
              {pessoa.justificativa && <p className="analise-justificativa">{pessoa.justificativa}</p>}

              {/* Sem parecer não é sem leitura: a nota existe, e dizer de onde
                  ela veio é o que impede que um número solto pareça descuido. */}
              {pessoa.so_triagem && (
                <p className="analise-justificativa">
                  {pessoa.aderencia == null
                    ? 'A triagem não chegou a esta pessoa.'
                    : 'Nota da triagem rápida. O parecer detalhado foi escrito para quem ficou à frente dela.'}
                </p>
              )}

              {checklist.length > 0 && (
                <ul className="analise-check">
                  {checklist.map((item, i) => (
                    <li key={i} className={`check-${item.situacao}`}>
                      <span className="analise-check-icone" title={SITUACAO[item.situacao].titulo}>
                        {SITUACAO[item.situacao].icone}
                      </span>
                      <span className="analise-check-texto">
                        <strong>{item.requisito}</strong>
                        <small>{item.nota || SITUACAO[item.situacao].titulo}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Análise guardada antes do checklist: lê-se como foi gravada. */}
              {checklist.length === 0 && antigos && (
                <ul className="analise-pontos">
                  {(pessoa.pontos_fortes ?? []).map((x, i) => (
                    <li key={`f${i}`} className="ponto-forte"><IconCheck size={11} /> {x}</li>
                  ))}
                  {(pessoa.lacunas ?? []).map((x, i) => (
                    <li key={`l${i}`} className="ponto-lacuna"><IconX size={10} /> {x}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
