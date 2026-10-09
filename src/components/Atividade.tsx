// ─────────────────────────────────────────────────────────────────────────────
//  Atividade: o diário e a conversa, de qualquer coisa que tenha os dois.
//
//  Duas coisas diferentes, e por isso duas abas. O diário é escrito pelo
//  sistema, não se responde e não se apaga - é o que aconteceu. A conversa é
//  escrita por gente, tem thread, marcação e anexo. Misturar as duas numa lista
//  só faz a conversa se perder no meio de vinte "mudou o prazo".
//
//  Nasceu na gaveta de tarefa e saiu de lá quando o painel da oportunidade passou a
//  querer a mesma coisa. O que muda de um dono para o outro fica todo nas
//  quatro funções que ele recebe - ler, enviar, excluir e baixar o anexo -, e
//  nada aqui dentro sabe se está falando de uma tarefa ou de uma oportunidade.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IconAlert, IconChevronRight, IconClip, IconDownload, IconEye, IconJoinha, IconSpinner, IconTrash, IconX,
} from './icons';
import { PreviaArquivo } from './PreviaArquivo';
import { quando, tamanho as fmtTamanho } from '../lib/datas';
import { arquivosColados } from '../lib/colarArquivos';
import { CampoTexto } from './CampoTexto';
import { TextoRico } from './TextoRico';
import { Avatar, type Pessoa } from '../admin/FormularioTarefa';

/** Uma linha do diário, já em português.
 *
 *  A frase vem pronta de quem chama: "alterou a etapa" numa tarefa e "moveu o
 *  oportunidade" no funil saem de vocabulários diferentes, e traduzir os dois aqui
 *  dentro amarraria este arquivo às duas telas. */
export interface EventoAtividade {
  id: number;
  usuario_nome: string;
  /** O verbo e o complemento: "criou a tarefa", "anexou um arquivo". */
  texto: string;
  /** O antes e o depois, quando existem. Saem como "de X para Y". */
  de: string | null;
  para: string | null;
  /** O que a ação atingiu, quando não é uma passagem de um valor a outro:
   *  "anexou contrato.pdf". Sai destacado, e sem preposição na frente. */
  alvo?: string | null;
  criado_em: string;
}

export interface AnexoDoComentario {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface ComentarioAtividade {
  id: number;
  pai_id: number | null;
  usuario_id: string | null;
  usuario_nome: string;
  foto_url: string | null;
  texto: string;
  criado_em: string;
  editado_em: string | null;
  mencoes: { usuario_id: string; nome: string | null }[];
  anexos: AnexoDoComentario[];
  /** Quem deu joinha. Ausente onde a conversa não tem joinha - o funil. */
  joinhas?: { usuario_id: string; nome: string | null }[];
}

/** Uma etapa que pode ser marcada no texto com `#`. Só o funil tem: numa
 *  tarefa não há etapa a que chamar alguém. */
export interface EtapaMarcavel {
  id: number;
  nome: string;
  cor: string;
}

/** Anexo ainda no navegador, esperando o envio do comentário. */
export interface AnexoPendente {
  nome: string;
  tipo: string;
  tamanho: number;
  base64: string;
}

/** Por arquivo. Cada anexo sobe num pedido só dele, e o pedido da Vercel para
 *  em 4,5 MB: em base64, 3 MB chegam com folga. */
const LIMITE_ANEXO = 3 * 1024 * 1024;

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

/** Rótulo de cada campo no diário. */
/** Texto com marcações, dividido em pedaços para o chip ser desenhado.
 *  O formato gravado é `@[Nome](id)`: guarda o nome do momento e o id para a
 *  ligação, sem depender de o nome continuar igual daqui a um ano. */
const MARCA = /@\[([^\]]+)\]\(([^)]+)\)/g;

function pedacos(texto: string): { tipo: 'texto' | 'marca'; valor: string; id?: string }[] {
  const saida: { tipo: 'texto' | 'marca'; valor: string; id?: string }[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCA)) {
    if (m.index > ultimo) saida.push({ tipo: 'texto', valor: texto.slice(ultimo, m.index) });
    saida.push({ tipo: 'marca', valor: m[1], id: m[2] });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) saida.push({ tipo: 'texto', valor: texto.slice(ultimo) });
  return saida;
}

/** Os ids marcados dentro do texto, para o servidor gravar a ligação. */
function idsMarcados(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCA)].map(m => m[2]))];
}

/** O que aparece dentro de um pedaço de texto puro: endereço clicável, marcação
 *  antiga (`@apelido`, escrita antes do formato com id) e etapa (`#[Nome]`).
 *
 *  As duas últimas existem porque a conversa do funil já estava escrita assim
 *  quando esta caixa virou a de lá: um comentário de seis meses atrás continua
 *  se lendo igual. */
const SOLTAS = /(https?:\/\/[^\s]+)|#\[([^\]]+)\]|@([\w.]+)/g;

function pedacosSoltos(texto: string, etapas?: EtapaMarcavel[], chave = ''): React.ReactNode[] {
  const saida: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of texto.matchAll(SOLTAS)) {
    const em = m.index ?? 0;
    if (em > ultimo) saida.push(texto.slice(ultimo, em));
    if (m[1]) {
      // Pontuação colada no fim não é do endereço: "veja o link." não abre
      // uma página terminada em ponto.
      let url = m[1];
      const cauda = /[.,;:!?)\]]+$/.exec(url)?.[0] ?? '';
      if (cauda) url = url.slice(0, -cauda.length);
      saida.push(
        <a key={`${chave}${i++}`} href={url} target="_blank" rel="noopener noreferrer"
          className="ativ-endereco" onClick={e => e.stopPropagation()}>{url}</a>,
      );
      if (cauda) saida.push(cauda);
    } else if (m[2]) {
      const etapa = etapas?.find(x => x.nome === m[2]);
      saida.push(
        <span key={`${chave}${i++}`} className="ativ-marca ativ-marca-etapa"
          style={etapa ? ({ ['--marca-cor' as string]: etapa.cor }) : undefined}>#{m[2]}</span>,
      );
    } else {
      saida.push(<span key={`${chave}${i++}`} className="ativ-marca">@{m[3]}</span>);
    }
    ultimo = em + m[0].length;
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo));
  return saida;
}

/** O comentário lido: as marcas da casa - negrito, itálico, sublinhado, lista,
 *  link -, pela mesma regra da descrição da tarefa, e as menções e etapas como
 *  chips dentro de cada trecho. */
function TextoDoComentario({ texto, etapas }: { texto: string; etapas?: EtapaMarcavel[] }) {
  return (
    <TextoRico texto={texto} className="ativ-texto"
      trecho={(t, chave) => pedacos(t).flatMap((p, i): React.ReactNode[] => (
        p.tipo === 'marca'
          ? [<span key={`${chave}m${i}`} className="ativ-marca">@{p.valor}</span>]
          : pedacosSoltos(p.valor, etapas, `${chave}s${i}-`)
      ))} />
  );
}

/** Caixa de escrita, com marcação por `@` e anexos. */
function Escrever({ pessoas, etapas, autoFoco, rotuloEnvio, permiteAnexo, onEnviar, onCancelar }: {
  pessoas: Pessoa[];
  /** Quando existem, `#` abre a lista delas. Só o funil as tem. */
  etapas?: EtapaMarcavel[];
  autoFoco?: boolean;
  /** Onde não há onde guardar o arquivo, o clipe não aparece: um botão que
   *  promete o que o outro lado não faz é pior que a ausência dele. */
  permiteAnexo?: boolean;
  rotuloEnvio: string;
  /** Envia e espera. Devolve o erro do servidor, ou `null` quando gravou - e só
   *  então a caixa se esvazia. */
  onEnviar: (texto: string, anexos: AnexoPendente[]) => Promise<string | null>;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Busca aberta pelo `@`: o trecho digitado depois dele e onde ele começa. */
  /** A marcação sendo escrita. `paraCima` e `altura` são medidos na hora de
   *  abrir: a caixa de comentário fica no pé do painel, e a lista para baixo
   *  nascia atrás da borda dele. */
  const [busca, setBusca] = useState<{
    tipo: 'pessoa' | 'etapa'; termo: string; paraCima: boolean; altura: number;
    /** Onde o `@` está: o pedaço de texto da caixa e a posição dentro dele. */
    no: Text; inicio: number;
  } | null>(null);
  const campo = useRef<HTMLDivElement | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /** Procura um `@` - ou um `#`, onde há etapas - em aberto imediatamente antes
   *  do cursor. Só vale se ele começar palavra: um e-mail digitado no meio da
   *  frase não abre a lista.
   *
   *  A caixa é o campo formatado da casa, e não um `textarea`: o cursor é lido
   *  da seleção, no pedaço de texto em que ele está. */
  function verMarcacao() {
    const sel = window.getSelection();
    const faixa = sel && sel.rangeCount && sel.isCollapsed ? sel.getRangeAt(0) : null;
    const no = faixa?.startContainer;
    if (!faixa || !no || no.nodeType !== Node.TEXT_NODE || !campo.current?.contains(no)) {
      setBusca(null);
      return;
    }
    const cursor = faixa.startOffset;
    const antes = (no.textContent ?? '').slice(0, cursor);
    const m = /(^|\s)@([^\s@]*)$/.exec(antes);
    const e = etapas?.length ? /(^|\s)#([^\s#\[\]]*)$/.exec(antes) : null;
    const achado = m ?? e;
    if (!achado) { setBusca(null); return; }
    // Abre para o lado que tem espaço, e nunca maior que ele: melhor curta e
    // inteira do que longa e cortada.
    const r = campo.current?.getBoundingClientRect();
    const abaixo = r ? window.innerHeight - r.bottom - 12 : 999;
    const acima = r ? r.top - 12 : 0;
    const paraCima = abaixo < 200 && acima > abaixo;
    setBusca({
      tipo: m ? 'pessoa' : 'etapa',
      termo: achado[2],
      no: no as Text,
      inicio: cursor - achado[2].length - 1,
      paraCima,
      altura: Math.max(120, Math.min(220, (paraCima ? acima : abaixo) - 8)),
    });
  }

  const contem = (nome: string) => nome.toLocaleLowerCase('pt-BR')
    .includes((busca?.termo ?? '').toLocaleLowerCase('pt-BR'));
  const candidatos = busca?.tipo === 'pessoa'
    ? pessoas.filter(p => contem(p.nome)).slice(0, 6) : [];
  const candidatasEtapas = busca?.tipo === 'etapa'
    ? (etapas ?? []).filter(x => contem(x.nome)).slice(0, 6) : [];

  /** Quem foi marcado nesta escrita: nome que foi para o texto -> id.
   *
   *  O texto gravado continua sendo `@[Nome](id)`, que é o que segura a ligação
   *  quando alguém muda de nome. Mas o que se escreve é `@Nome`: o formato cru
   *  punha um código de 36 caracteres no meio da frase de quem está escrevendo.
   *  A conversão acontece no envio. */
  const marcados = useRef(new Map<string, string>());

  /** Devolve o texto com as marcações no formato de gravação. Os nomes mais
   *  longos primeiro: "Ana" não pode comer o "@Ana Paula" de alguém. */
  function comMarcacoes(t: string) {
    let saida = t;
    for (const [nome, id] of [...marcados.current].sort((a, b) => b[0].length - a[0].length)) {
      saida = saida.split(`@${nome}`).join(`@[${nome}](${id})`);
    }
    return saida;
  }

  function marcar(p: Pessoa) {
    marcados.current.set(p.nome, p.id);
    inserir(`@${p.nome} `);
  }

  /** A etapa entra já no formato final, `#[Nome]`: o nome dela tem espaço, e
   *  `#Confecção da proposta` não teria onde terminar. */
  function marcarEtapa(x: EtapaMarcavel) {
    inserir(`#[${x.nome}] `);
  }

  /** Troca o `@termo` digitado pela marcação. Pela seleção e pelo comando de
   *  escrever do navegador, como uma digitação: o campo avisa a mudança sozinho,
   *  o cursor fica depois do nome, e o Ctrl+Z desfaz. */
  function inserir(trecho: string) {
    const sel = window.getSelection();
    if (!busca || !sel || !sel.rangeCount || !busca.no.isConnected) { setBusca(null); return; }
    const cursor = sel.getRangeAt(0);
    const alvo = document.createRange();
    alvo.setStart(busca.no, Math.max(0, busca.inicio));
    alvo.setEnd(cursor.startContainer, cursor.startOffset);
    sel.removeAllRanges();
    sel.addRange(alvo);
    document.execCommand('insertText', false, trecho);
    setBusca(null);
  }

  async function escolherArquivos(lista: FileList | File[] | null) {
    setErro(null);
    const novos: AnexoPendente[] = [];
    for (const f of Array.from(lista ?? [])) {
      if (f.size > LIMITE_ANEXO) {
        setErro(`"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      const base64 = await new Promise<string>(resolve => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
        fr.readAsDataURL(f);
      });
      novos.push({ nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64 });
    }
    setAnexos(a => [...a, ...novos]);
    if (arquivo.current) arquivo.current.value = '';
  }

  /**
   * O comentário só aparece na conversa depois de gravado e relido.
   *
   * Ele subia no gesto, com um id provisório, e o anexo dele não tinha de onde
   * ser aberto até a releitura trazer o id de verdade: o print aparecia, o
   * clique no olho não fazia nada, e um segundo depois abria. Enquanto vai e
   * volta, o botão gira e o texto fica na caixa - se o servidor recusar, nada
   * do que se escreveu se perde.
   */
  async function enviar() {
    // O campo editável escreve o espaço do fim como espaço que não quebra; no
    // texto guardado ele volta a ser espaço comum.
    const limpo = texto.replace(/\u00a0/g, ' ').trim();
    if ((!limpo && anexos.length === 0) || enviando) return;
    setEnviando(true);
    setErro(null);
    const falha = await onEnviar(comMarcacoes(limpo), anexos);
    setEnviando(false);
    if (falha) { setErro(falha); return; }
    setTexto('');
    setAnexos([]);
  }

  return (
    <div className="ativ-escrever">
      <div className="ativ-campo-caixa">
        {/* O campo da casa: Ctrl+B, Ctrl+I e Ctrl+U formatam, "- " abre lista,
            e o texto sai guardado com as marcas leves, como a descrição da
            tarefa. */}
        <CampoTexto
          caixaRef={campo}
          className="ativ-campo"
          linhas={2}
          alturaMaxima={240}
          valor={texto}
          autoFocus={autoFoco}
          ariaLabel="Comentário"
          placeholder={etapas?.length
            ? 'Escreva um comentário. Use @ para marcar alguém e # para uma etapa.'
            : 'Escreva um comentário. Use @ para marcar alguém.'}
          onMudar={t => { setTexto(t); verMarcacao(); }}
          aoTeclar={e => {
            const lista = busca && (candidatos.length > 0 || candidatasEtapas.length > 0);
            if (e.key === 'Escape' && busca) { e.preventDefault(); setBusca(null); return; }
            // Com a lista de menções aberta, Enter e Tab escolhem a primeira.
            if (lista && (e.key === 'Enter' || e.key === 'Tab')) {
              e.preventDefault();
              if (candidatos[0]) marcar(candidatos[0]);
              else marcarEtapa(candidatasEtapas[0]);
              return;
            }
            // Enter envia, Shift+Enter quebra linha: é o que a mão já espera de
            // uma caixa de comentário. Dentro de uma lista, Enter abre o item
            // seguinte - e num item vazio, sai dela -, como em qualquer editor.
            // Shift+Enter abre uma linha nova como bloco próprio, que é o que o
            // Enter faz na descrição da tarefa. Deixado ao navegador, ele põe
            // uma quebra dentro do mesmo bloco, e o "- " da linha de baixo
            // transformaria as duas linhas numa lista só.
            if (e.key === 'Enter' && e.shiftKey) {
              e.preventDefault();
              document.execCommand('insertParagraph');
              return;
            }
            if (e.key === 'Enter') {
              if (document.queryCommandState('insertUnorderedList')) return;
              e.preventDefault();
              void enviar();
            }
          }}
          onBlur={() => setTimeout(() => setBusca(null), 120)}
          // O print colado entra como anexo, igual ao que o clipe traria. Texto
          // colado segue sendo texto: o evento só é engolido quando veio arquivo.
          aoColar={e => {
            if (!permiteAnexo) return;
            const colados = arquivosColados(e.clipboardData);
            if (!colados.length) return;
            e.preventDefault();
            void escolherArquivos(colados);
          }}
        />
        {busca && (candidatos.length > 0 || candidatasEtapas.length > 0) && (
          <ul className={`ativ-mencoes${busca.paraCima ? ' para-cima' : ''}`}
            style={{ maxHeight: busca.altura }} role="listbox">
            {candidatos.map(p => (
              <li key={p.id}>
                <button type="button" onMouseDown={e => { e.preventDefault(); marcar(p); }}>
                  <Avatar nome={p.nome} foto={p.foto_url} size={20} />
                  <span>{p.nome}</span>
                </button>
              </li>
            ))}
            {candidatasEtapas.map(x => (
              <li key={x.id}>
                <button type="button" onMouseDown={e => { e.preventDefault(); marcarEtapa(x); }}>
                  {/* O mesmo ponto da pílula de etapa: a cor é o que identifica
                      a etapa em todo o funil. */}
                  <span className="ativ-mencao-ponto" style={{ background: x.cor }} aria-hidden="true" />
                  <span>{x.nome}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {anexos.length > 0 && (
        <ul className="ativ-anexos">
          {anexos.map((a, i) => (
            <li key={i}>
              <IconClip size={12} />
              <span className="ativ-anexo-nome">{a.nome}</span>
              <span className="ativ-anexo-peso">{fmtTamanho(a.tamanho)}</span>
              <button type="button" aria-label={`Tirar ${a.nome}`}
                onClick={() => setAnexos(x => x.filter((_, k) => k !== i))}>
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && <p className="ativ-erro surge"><IconAlert size={12} />{erro}</p>}

      <div className="ativ-acoes">
        {permiteAnexo && (
          <>
            <input ref={arquivo} type="file" multiple hidden
              onChange={e => void escolherArquivos(e.target.files)} />
            <button type="button" className="ativ-botao-fraco" onClick={() => arquivo.current?.click()}
              title="Anexar arquivo, ou cole um print com Ctrl+V no campo">
              <IconClip size={13} />
              Anexar
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {onCancelar && (
          <button type="button" className="ativ-botao-fraco" onClick={onCancelar}>Cancelar</button>
        )}
        <button type="button" className="ativ-botao" disabled={enviando || (!texto.trim() && !anexos.length)}
          aria-busy={enviando} onClick={() => void enviar()}>
          {enviando && <IconSpinner size={13} />}
          {rotuloEnvio}
        </button>
      </div>
    </div>
  );
}

/** Quanto dura a abertura. Espelha o `--transition-spring` do `.revelar`, com
 *  uma folga para as classes só saírem depois de a animação terminar. */
const ABERTURA_MS = 260;

/** A fala que acabou de chegar entra abrindo espaço, em vez de aparecer pronta.
 *
 *  Um comentário novo empurra o campo de escrever para baixo, e o que empurra o
 *  resto da coluna anima a altura: é o `.revelar` da casa, aberto um quadro
 *  depois de montar, que é o que dá à animação de onde sair. A fala que já
 *  estava na tela quando a conversa abriu não passa por aqui - só o que chega
 *  depois.
 *
 *  Terminada a abertura, as classes saem e sobra um `div` pelado: o
 *  `overflow: hidden` do `.revelar` recortaria a sombra do cartão, e a conversa
 *  ficaria com um chip mais chato que os vizinhos para sempre. */
function Chegando({ novo, children }: { novo: boolean; children: React.ReactNode }) {
  const [fase, setFase] = useState<'fechado' | 'abrindo' | 'pronto'>(novo ? 'fechado' : 'pronto');

  useEffect(() => {
    if (fase === 'fechado') {
      const q = requestAnimationFrame(() => setFase('abrindo'));
      return () => cancelAnimationFrame(q);
    }
    if (fase === 'abrindo') {
      const t = window.setTimeout(() => setFase('pronto'), ABERTURA_MS);
      return () => window.clearTimeout(t);
    }
  }, [fase]);

  return (
    <div className={fase === 'pronto'
      ? 'ativ-item'
      : `ativ-item revelar${fase === 'abrindo' ? ' aberto' : ''}`}>
      <div>{children}</div>
    </div>
  );
}

/** O joinha do comentário: o desenho e a conta, e os nomes na dica. Quem já deu
 *  vê o botão aceso, e clicar de novo tira. */
function Joinha({ c, usuarioId, pode, onAlternar }: {
  c: ComentarioAtividade;
  usuarioId: string | undefined;
  pode: boolean;
  onAlternar: (c: ComentarioAtividade, ligar: boolean) => void;
}) {
  const lista = c.joinhas ?? [];
  const meu = !!usuarioId && lista.some(j => j.usuario_id === usuarioId);
  const nomes = lista.map(j => (j.usuario_id === usuarioId ? 'você' : j.nome ?? 'alguém'));
  const dica = lista.length
    ? `Joinha de ${nomes.join(', ')}`
    : 'Dar joinha';
  return (
    <button type="button" className={`ativ-joinha${meu ? ' meu' : ''}${lista.length ? ' com-conta' : ''}`}
      title={pode ? (meu ? `${dica}. Clique para tirar o seu.` : dica) : dica}
      aria-label={meu ? 'Tirar joinha' : 'Dar joinha'} aria-pressed={meu}
      disabled={!pode}
      onClick={() => onAlternar(c, !meu)}>
      <IconJoinha size={12} />
      {lista.length > 0 && <span className="ativ-joinha-conta troca" key={lista.length}>{lista.length}</span>}
    </button>
  );
}

function Comentario({ c, respostas, pessoas, etapas, usuarioId, podeComentar, permiteAnexo,
  respondendo, onResponder, onEnviarResposta, onExcluir, onBaixar, onVer, onJoinha,
  ehNovo }: {
  /** Ausente onde a conversa não tem joinha. */
  onJoinha?: (c: ComentarioAtividade, ligar: boolean) => void;
  c: ComentarioAtividade;
  respostas: ComentarioAtividade[];
  etapas?: EtapaMarcavel[];
  pessoas: Pessoa[];
  usuarioId: string | undefined;
  podeComentar: boolean;
  permiteAnexo: boolean;
  respondendo: boolean;
  onResponder: (id: number | null) => void;
  onEnviarResposta: (texto: string, anexos: AnexoPendente[]) => Promise<string | null>;
  onExcluir: (c: ComentarioAtividade) => void;
  onBaixar: (a: AnexoDoComentario) => void;
  onVer: (a: AnexoDoComentario) => void;
  /** Se a fala acabou de chegar - a resposta que entra numa conversa que já
   *  está na tela abre espaço, em vez de nascer pronta. */
  ehNovo: (id: number) => boolean;
}) {
  const meu = !!usuarioId && c.usuario_id === usuarioId;
  /** Respostas à vista. Nascem fechadas. */
  const [abertas, setAbertas] = useState(false);

  const bloco = (x: ComentarioAtividade, resposta: boolean) => (
    <div key={x.id} className={`ativ-comentario${resposta ? ' resposta' : ''}`}>
      <Avatar nome={x.usuario_nome} foto={x.foto_url} size={resposta ? 22 : 26} />
      <div className="ativ-corpo">
        <p className="ativ-cabeca">
          <strong>{x.usuario_nome}</strong>
          <span title={fmtDataHora(x.criado_em)}>{quando(x.criado_em)}</span>
          {/* Só o autor apaga o próprio comentário, e só quem pode comentar: é a
              mesma regra do servidor, e a lixeira não aparece onde ele recusaria. */}
          {podeComentar && !!usuarioId && x.usuario_id === usuarioId && (
            <button type="button" className="ativ-apagar" title="Apagar comentário"
              aria-label="Apagar comentário" onClick={() => onExcluir(x)}>
              <IconTrash size={12} />
            </button>
          )}
        </p>
        {x.texto && <TextoDoComentario texto={x.texto} etapas={etapas} />}
        {x.anexos.length > 0 && (
          <ul className="ativ-anexos">
            {x.anexos.map(a => (
              <li key={a.id}>
                <IconClip size={12} />
                <span className="ativ-anexo-nome">{a.nome}</span>
                <span className="ativ-anexo-peso">{fmtTamanho(a.tamanho)}</span>
                {/* Ver antes de baixar: quase todo anexo de conversa é um print,
                    e abrir a janela custa menos que salvar o arquivo, olhar e
                    apagar depois. */}
                <button type="button" aria-label={`Visualizar ${a.nome}`}
                  title="Visualizar" onClick={() => onVer(a)}>
                  <IconEye size={12} />
                </button>
                <button type="button" aria-label={`Baixar ${a.nome}`}
                  title="Baixar" onClick={() => onBaixar(a)}>
                  <IconDownload size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {/* O joinha no pé da fala, e não no cabeçalho com o nome: é a resposta
            de quem leu ao que foi dito, e mora embaixo do que foi dito. */}
        {onJoinha && (
          <div className="ativ-reacoes">
            <Joinha c={x} usuarioId={usuarioId} pode={podeComentar && !!usuarioId} onAlternar={onJoinha} />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ativ-thread">
      {bloco(c, false)}

      {/* As respostas nascem recolhidas: uma conversa com quatro comentários e
          quinze respostas vira uma parede, e o que se procura é o comentário,
          não cada volta dele. Abre uma vez e fica aberta - é o `.revelar` da
          casa, que precisa do conteúdo montado para a altura ter de onde
          crescer. */}
      {respostas.length > 0 && (
        <>
          <button type="button" className="ativ-link ativ-abrir-respostas"
            aria-expanded={abertas} onClick={() => setAbertas(v => !v)}>
            <span className={`entrega-seta${abertas ? ' aberta' : ''}`}>
              <IconChevronRight size={11} />
            </span>
            {abertas
              ? 'Ocultar respostas'
              : `${respostas.length} resposta${respostas.length > 1 ? 's' : ''}`}
          </button>
          <div className={`revelar${abertas ? ' aberto' : ''}`}>
            <div>
              {respostas.map(r => (
                <Chegando key={r.id} novo={ehNovo(r.id)}>{bloco(r, true)}</Chegando>
              ))}
            </div>
          </div>
        </>
      )}
      {podeComentar && (
        respondendo
          ? (
            <div className="ativ-responder">
              <Escrever pessoas={pessoas} etapas={etapas} autoFoco rotuloEnvio="Responder"
                permiteAnexo={permiteAnexo}
                // A resposta gravada aparece com as respostas abertas: recolhidas,
                // ela entraria escondida e pareceria que não foi.
                onEnviar={async (t, a) => {
                  const falha = await onEnviarResposta(t, a);
                  if (!falha) setAbertas(true);
                  return falha;
                }}
                onCancelar={() => onResponder(null)} />
            </div>
          )
          : (
            <button type="button" className="ativ-link" onClick={() => onResponder(c.id)}>
              Responder
            </button>
          )
      )}
      {meu && null}
    </div>
  );
}

/** A última conversa lida de cada tarefa, guardada enquanto a aba do navegador
 *  viver.
 *
 *  Abrir a mesma tarefa duas vezes não deveria custar duas esperas: o conteúdo
 *  volta na hora e a releitura acontece por baixo. Fora do componente de
 *  propósito - dentro dele, o cache morreria junto com o painel, que é
 *  exatamente quando ele precisa sobreviver. */
/** O que já foi lido, por dono. Reabrir a mesma tarefa - ou o mesmo oportunidade -
 *  mostra a conversa que estava e se atualiza por baixo, em vez de piscar um
 *  vazio enquanto a leitura vai e volta. */
const lidas = new Map<string, { eventos: EventoAtividade[]; comentarios: ComentarioAtividade[] }>();

/** O que o dono precisa saber fazer. Quatro funções, e nenhuma delas conta ao
 *  componente de que coisa se trata. */
export interface DonoDaAtividade {
  /** Identidade do dono, para o que já foi lido não ser confundido com o de
   *  outro card: `tarefa:12`, `oportunidade:abc`. */
  chave: string;
  ler: () => Promise<{ eventos: EventoAtividade[]; comentarios: ComentarioAtividade[] }>;
  enviar: (texto: string, anexos: AnexoPendente[], paiId: number | null) => Promise<{ error?: string }>;
  excluir: (id: number) => Promise<{ error?: string }>;
  /** O conteúdo do anexo, na hora de ver ou baixar. Ausente onde comentário não
   *  leva anexo - e aí o clipe também não aparece na caixa de escrita. */
  anexo?: (id: number) => Promise<{ nome: string; tipo: string; base64: string } | null>;
  /** Dá (`ligar`) ou tira o joinha de quem está vendo. Ausente onde a conversa
   *  não tem joinha - e aí o botão não aparece. */
  joinha?: (id: number, ligar: boolean) => Promise<{ error?: string } | null>;
}

export function Atividade({ dono, pessoas, etapas, usuarioId, podeComentar }: {
  dono: DonoDaAtividade;
  pessoas: Pessoa[];
  /** As etapas marcáveis com `#`. Só o funil as tem; sem elas, `#` é só texto. */
  etapas?: EtapaMarcavel[];
  usuarioId: string | undefined;
  podeComentar: boolean;
}) {
  const { chave } = dono;
  const [aba, setAba] = useState<'conversa' | 'diario'>('conversa');
  // Já lida antes: abre com o que estava e se atualiza por baixo.
  const guardada = lidas.get(chave);
  const [eventos, setEventos] = useState<EventoAtividade[]>(guardada?.eventos ?? []);
  const [comentarios, setComentarios] = useState<ComentarioAtividade[]>(guardada?.comentarios ?? []);
  const [carregando, setCarregando] = useState(!guardada);
  const [respondendo, setRespondendo] = useState<number | null>(null);

  // A função de ler muda a cada render de quem chama; a identidade do dono
  // não. É ela que decide quando reler - com a função na dependência, isto
  // giraria a cada quadro.
  const ler = useRef(dono.ler);
  ler.current = dono.ler;

  const carregar = useCallback(async () => {
    const r = await ler.current();
    const eventos = r?.eventos ?? [];
    const comentarios = r?.comentarios ?? [];
    lidas.set(chave, { eventos, comentarios });
    setEventos(eventos);
    setComentarios(comentarios);
    setCarregando(false);
  }, [chave]);

  useEffect(() => {
    // Sem esqueleto quando já há o que mostrar: a releitura é para trazer o que
    // mudou, não para esvaziar a tela e enchê-la de novo.
    setCarregando(!lidas.has(chave));
    void carregar();
  }, [carregar, chave]);

  // O que a tela mostra é o que fica guardado: reabrir a tarefa não pode
  // mostrar a conversa de antes do último comentário.
  useEffect(() => { lidas.set(chave, { eventos, comentarios }); }, [chave, eventos, comentarios]);

  /** Grava e relê, e só então o comentário entra na conversa - com o id, as
   *  menções conferidas e os anexos já prontos para abrir. Devolve o erro do
   *  servidor para a caixa mostrar embaixo do texto, que continua lá. */
  async function enviar(texto: string, anexos: AnexoPendente[], paiId: number | null): Promise<string | null> {
    try {
      const r = await dono.enviar(texto, anexos, paiId);
      // Sem resposta nenhuma também é falha: o pedido recusado antes do
      // servidor volta vazio, e contar isso como gravado esvaziava a caixa de
      // um comentário que nunca existiu.
      if (!r) return 'O comentário não chegou ao servidor. Tente de novo.';
      if (r.error) return String(r.error);
      await carregar();
      setRespondendo(null);
      return null;
    } catch {
      return 'A conexão caiu antes de o comentário chegar. Tente de novo.';
    }
  }

  async function excluir(c: ComentarioAtividade) {
    // Some da tela na hora: apagar a própria fala é decisão de quem escreveu, e
    // esperar a volta do servidor para ver o efeito é atrito à toa.
    setComentarios(cs => cs.filter(x => x.id !== c.id && x.pai_id !== c.id));
    const r = await dono.excluir(c.id);
    if (r?.error) await carregar();
  }

  /** Dá ou tira o joinha. O botão acende no clique e apaga de volta se o
   *  servidor recusar: concordar com alguém não pode esperar a ida e a volta. */
  async function alternarJoinha(c: ComentarioAtividade, ligar: boolean) {
    if (!dono.joinha || !usuarioId) return;
    const eu = pessoas.find(p => p.id === usuarioId);
    const pintar = (ativo: boolean) => setComentarios(cs => cs.map(x => {
      if (x.id !== c.id) return x;
      const sem = (x.joinhas ?? []).filter(j => j.usuario_id !== usuarioId);
      return { ...x, joinhas: ativo ? [...sem, { usuario_id: usuarioId, nome: eu?.nome ?? null }] : sem };
    }));
    pintar(ligar);
    const r = await dono.joinha(c.id, ligar);
    if (r?.error) pintar(!ligar);
  }

  /** Anexo aberto na janela de prévia. */
  const [vendo, setVendo] = useState<AnexoDoComentario | null>(null);

  async function baixar(a: AnexoDoComentario) {
    const r = await dono.anexo?.(a.id);
    if (!r?.base64) return;
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  const conversas = comentarios.filter(c => c.pai_id == null);
  const respostasDe = (id: number) => comentarios.filter(c => c.pai_id === id);

  /** As falas que já estavam na tela no quadro anterior. O que não está aqui
   *  chegou agora - o comentário que se acabou de escrever, ou o de outra
   *  pessoa que veio na releitura - e entra abrindo espaço.
   *
   *  A conversa inteira da primeira leitura não conta como novidade: ela já
   *  entra junto com o painel, que tem a animação dele. Por isso o registro só
   *  começa quando o esqueleto sai. */
  const vistos = useRef<Set<number> | null>(null);
  const ehNovo = (id: number) => vistos.current !== null && !vistos.current.has(id);
  // Depois da pintura, e não durante: escrever a referência no meio do render
  // faria a segunda passada do modo estrito ver a fala nova como velha, e a
  // animação nunca tocaria em desenvolvimento.
  useEffect(() => {
    if (carregando) return;
    vistos.current = new Set(comentarios.map(c => c.id));
  }, [carregando, comentarios]);

  return (
    <div className="ativ">
      <div className="ativ-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'conversa'}
          className={aba === 'conversa' ? 'ativa' : undefined}
          onClick={() => setAba('conversa')}>
          Comentários
          {comentarios.length > 0 && <span className="ativ-conta">{comentarios.length}</span>}
        </button>
        <button type="button" role="tab" aria-selected={aba === 'diario'}
          className={aba === 'diario' ? 'ativa' : undefined}
          onClick={() => setAba('diario')}>
          Atividade
          {eventos.length > 0 && <span className="ativ-conta">{eventos.length}</span>}
        </button>
      </div>

      {/* A chave é a aba, e também a espera: trocá-la remonta o conteúdo, e é a
          remontagem que faz a entrada tocar. É o mesmo `.aba-painel` das abas do
          painel de projeto - trocar de aba num quadro só não é lido, é notado.
          A espera entra na chave para a conversa lida substituir o esqueleto
          entrando, e não trocando de estalo no lugar dele. */}
      <div className="aba-painel" key={`${aba}|${carregando}`}>
      {carregando ? (
        // Esqueleto no formato do que vem, e não um giro no meio do vazio: o
        // bloco já ocupa o tamanho da conversa, então nada pula quando ela
        // chega.
        <div className="ativ-esqueleto" aria-hidden="true">
          <span /><span /><span />
        </div>
      ) : aba === 'conversa' ? (
        // A conversa vem antes do campo, e o campo fecha a coluna: quem chega
        // lê o que foi dito e escreve embaixo, que é a ordem de qualquer
        // conversa. Com o campo em cima, o último comentário ficava longe de
        // onde se responde.
        <>
          {conversas.length === 0
            ? <p className="ativ-vazio">Nenhum comentário ainda.</p>
            : conversas.map(c => (
              <Chegando key={c.id} novo={ehNovo(c.id)}>
                <Comentario
                  c={c}
                  respostas={respostasDe(c.id)}
                  pessoas={pessoas}
                  etapas={etapas}
                  usuarioId={usuarioId}
                  podeComentar={podeComentar}
                  permiteAnexo={!!dono.anexo}
                  respondendo={respondendo === c.id}
                  onResponder={setRespondendo}
                  onEnviarResposta={(t, a) => enviar(t, a, c.id)}
                  onExcluir={c2 => void excluir(c2)}
                  onBaixar={a => void baixar(a)}
                  onVer={setVendo}
                  onJoinha={dono.joinha ? (c2, ligar) => void alternarJoinha(c2, ligar) : undefined}
                  ehNovo={ehNovo}
                />
              </Chegando>
            ))}
          {podeComentar && (
            <div className="ativ-escrever-pe">
              <Escrever pessoas={pessoas} etapas={etapas} rotuloEnvio="Comentar"
                permiteAnexo={!!dono.anexo}
                onEnviar={(t, a) => enviar(t, a, null)} />
            </div>
          )}
        </>
      ) : eventos.length === 0 ? (
        <p className="ativ-vazio">Nada registrado ainda.</p>
      ) : (
        <ul className="ativ-diario">
          {eventos.map(e => (
            <li key={e.id}>
              <span className="ativ-ponto" aria-hidden="true" />
              <span className="ativ-diario-texto">
                <strong>{e.usuario_nome}</strong> {e.texto}
                {e.alvo && <> <em>{e.alvo}</em></>}
                {e.para && (
                  <>
                    {e.de ? <> de <em>{e.de}</em></> : null}
                    {' '}para <em>{e.para}</em>
                  </>
                )}
                {!e.para && e.de && <> (era <em>{e.de}</em>)</>}
              </span>
              <span className="ativ-diario-quando" title={fmtDataHora(e.criado_em)}>
                {quando(e.criado_em)}
              </span>
            </li>
          ))}
        </ul>
      )}
      </div>

      {/* A mesma janela que abre anexo de projeto e evidência de entrega: um
          arquivo é um arquivo, e duas prévias diferentes seriam duas telas
          para aprender. */}
      {vendo && (
        <PreviaArquivo
          arquivo={{ nome: vendo.nome }}
          onCarregar={() => dono.anexo!(vendo.id)}
          onBaixar={() => void baixar(vendo)}
          onFechar={() => setVendo(null)}
        />
      )}
    </div>
  );
}
