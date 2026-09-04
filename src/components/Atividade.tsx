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
  IconAlert, IconChevronRight, IconClip, IconDownload, IconEye, IconTrash, IconX,
} from './icons';
import { PreviaArquivo } from './PreviaArquivo';
import { quando, tamanho as fmtTamanho } from '../lib/datas';
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

const LIMITE_ANEXO = 8 * 1024 * 1024;

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

function pedacosSoltos(texto: string, etapas?: EtapaMarcavel[]): React.ReactNode[] {
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
        <a key={i++} href={url} target="_blank" rel="noopener noreferrer"
          className="ativ-endereco" onClick={e => e.stopPropagation()}>{url}</a>,
      );
      if (cauda) saida.push(cauda);
    } else if (m[2]) {
      const etapa = etapas?.find(x => x.nome === m[2]);
      saida.push(
        <span key={i++} className="ativ-marca ativ-marca-etapa"
          style={etapa ? ({ ['--marca-cor' as string]: etapa.cor }) : undefined}>#{m[2]}</span>,
      );
    } else {
      saida.push(<span key={i++} className="ativ-marca">@{m[3]}</span>);
    }
    ultimo = em + m[0].length;
  }
  if (ultimo < texto.length) saida.push(texto.slice(ultimo));
  return saida;
}

function TextoDoComentario({ texto, etapas }: { texto: string; etapas?: EtapaMarcavel[] }) {
  return (
    <p className="ativ-texto">
      {pedacos(texto).map((p, i) => (
        p.tipo === 'marca'
          ? <span key={i} className="ativ-marca">@{p.valor}</span>
          : <span key={i}>{pedacosSoltos(p.valor, etapas)}</span>
      ))}
    </p>
  );
}

/** Caixa de escrita, com marcação por `@` e anexos. */
function Escrever({ pessoas, etapas, autoFoco, rotuloEnvio, enviando, permiteAnexo, onEnviar, onCancelar }: {
  pessoas: Pessoa[];
  /** Quando existem, `#` abre a lista delas. Só o funil as tem. */
  etapas?: EtapaMarcavel[];
  autoFoco?: boolean;
  /** Onde não há onde guardar o arquivo, o clipe não aparece: um botão que
   *  promete o que o outro lado não faz é pior que a ausência dele. */
  permiteAnexo?: boolean;
  rotuloEnvio: string;
  enviando: boolean;
  onEnviar: (texto: string, anexos: AnexoPendente[]) => void;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<AnexoPendente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  /** Busca aberta pelo `@`: o trecho digitado depois dele e onde ele começa. */
  /** A marcação sendo escrita. `paraCima` e `altura` são medidos na hora de
   *  abrir: a caixa de comentário fica no pé do painel, e a lista para baixo
   *  nascia atrás da borda dele. */
  const [busca, setBusca] = useState<
    { tipo: 'pessoa' | 'etapa'; termo: string; inicio: number; paraCima: boolean; altura: number } | null
  >(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  /** Procura um `@` - ou um `#`, onde há etapas - em aberto imediatamente antes
   *  do cursor. Só vale se ele começar palavra: um e-mail digitado no meio da
   *  frase não abre a lista. */
  function verMarcacao(valor: string, cursor: number) {
    const antes = valor.slice(0, cursor);
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
   *  quando alguém muda de nome. Mas o que se escreve é `@Nome`: a caixa é um
   *  `textarea`, e o formato cru punha um código de 36 caracteres no meio da
   *  frase de quem está escrevendo. A conversão acontece no envio. */
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

  function inserir(trecho: string) {
    if (!busca) return;
    const el = campo.current;
    const cursor = el?.selectionStart ?? texto.length;
    setTexto(`${texto.slice(0, busca.inicio)}${trecho}${texto.slice(cursor)}`);
    setBusca(null);
    // Devolve o foco e põe o cursor depois da marcação recém-inserida.
    requestAnimationFrame(() => {
      const pos = busca.inicio + trecho.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  async function escolherArquivos(lista: FileList | null) {
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

  function enviar() {
    const limpo = texto.trim();
    if (!limpo && anexos.length === 0) return;
    onEnviar(comMarcacoes(limpo), anexos);
    setTexto('');
    setAnexos([]);
    setErro(null);
  }

  return (
    <div className="ativ-escrever">
      <div className="ativ-campo-caixa">
        <textarea
          ref={campo}
          className="form-input ativ-campo"
          rows={2}
          value={texto}
          autoFocus={autoFoco}
          placeholder={etapas?.length
            ? 'Escreva um comentário. Use @ para marcar alguém e # para uma etapa.'
            : 'Escreva um comentário. Use @ para marcar alguém.'}
          onChange={e => { setTexto(e.target.value); verMarcacao(e.target.value, e.target.selectionStart); }}
          onKeyDown={e => {
            if (e.key === 'Escape' && busca) { e.preventDefault(); setBusca(null); return; }
            // Enter envia, Shift+Enter quebra linha: é o que a mão já espera de
            // uma caixa de comentário.
            if (e.key === 'Enter' && !e.shiftKey && !busca) { e.preventDefault(); enviar(); }
          }}
          onBlur={() => setTimeout(() => setBusca(null), 120)}
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

      {erro && <p className="ativ-erro"><IconAlert size={12} />{erro}</p>}

      <div className="ativ-acoes">
        {permiteAnexo && (
          <>
            <input ref={arquivo} type="file" multiple hidden
              onChange={e => void escolherArquivos(e.target.files)} />
            <button type="button" className="ativ-botao-fraco" onClick={() => arquivo.current?.click()}>
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
          onClick={enviar}>
          {enviando ? 'Enviando…' : rotuloEnvio}
        </button>
      </div>
    </div>
  );
}

function Comentario({ c, respostas, pessoas, etapas, usuarioId, podeComentar, enviando, permiteAnexo,
  respondendo, onResponder, onEnviarResposta, onExcluir, onBaixar, onVer }: {
  c: ComentarioAtividade;
  respostas: ComentarioAtividade[];
  etapas?: EtapaMarcavel[];
  pessoas: Pessoa[];
  usuarioId: string | undefined;
  podeComentar: boolean;
  enviando: boolean;
  permiteAnexo: boolean;
  respondendo: boolean;
  onResponder: (id: number | null) => void;
  onEnviarResposta: (texto: string, anexos: AnexoPendente[]) => void;
  onExcluir: (c: ComentarioAtividade) => void;
  onBaixar: (a: AnexoDoComentario) => void;
  onVer: (a: AnexoDoComentario) => void;
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
          {(!!usuarioId && x.usuario_id === usuarioId) && (
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
              {respostas.map(r => bloco(r, true))}
            </div>
          </div>
        </>
      )}
      {podeComentar && (
        respondendo
          ? (
            <div className="ativ-responder">
              <Escrever pessoas={pessoas} etapas={etapas} autoFoco rotuloEnvio="Responder" enviando={enviando}
                permiteAnexo={permiteAnexo}
                onEnviar={onEnviarResposta} onCancelar={() => onResponder(null)} />
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
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState<number | null>(null);
  /** O que o servidor recusou, com o texto de volta para não se perder. */
  const [falhou, setFalhou] = useState<{ texto: string; erro: string } | null>(null);

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

  // O que a tela mostra é o que fica guardado, inclusive o comentário que
  // acabou de subir e ainda não voltou do servidor: reabrir a tarefa não pode
  // mostrar a conversa de antes dele.
  useEffect(() => { lidas.set(chave, { eventos, comentarios }); }, [chave, eventos, comentarios]);

  async function enviar(texto: string, anexos: AnexoPendente[], paiId: number | null) {
    // O balão sobe no gesto. Antes eram duas idas ao servidor antes de aparecer
    // qualquer coisa - gravar e depois reler a conversa inteira -, e o que se
    // escreveu ficava sumido nesse meio tempo.
    const eu = pessoas.find(p => p.id === usuarioId);
    const provisorio: ComentarioAtividade = {
      // Id negativo: não colide com nenhum do servidor, e some quando a
      // conversa é relida com o id de verdade.
      id: -Date.now(),
      pai_id: paiId,
      usuario_id: usuarioId ?? null,
      usuario_nome: eu?.nome ?? 'Você',
      foto_url: eu?.foto_url ?? null,
      texto,
      criado_em: new Date().toISOString(),
      editado_em: null,
      mencoes: [],
      anexos: anexos.map((a, i) => ({
        id: -Date.now() - i, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho,
      })),
    };
    setComentarios(cs => [...cs, provisorio]);
    setRespondendo(null);
    setFalhou(null);

    const r = await dono.enviar(texto, anexos, paiId);
    if (r?.error) {
      // Tira o balão e devolve o texto: quem escreveu não perde o que escreveu
      // porque o servidor recusou.
      setComentarios(cs => cs.filter(c => c.id !== provisorio.id));
      setFalhou({ texto, erro: String(r.error) });
      return;
    }
    // Troca o provisório pelo gravado: id de verdade, menções conferidas e
    // anexos com o id com que serão baixados.
    void carregar();
  }

  async function excluir(c: ComentarioAtividade) {
    // Some da tela na hora: apagar a própria fala é decisão de quem escreveu, e
    // esperar a volta do servidor para ver o efeito é atrito à toa.
    setComentarios(cs => cs.filter(x => x.id !== c.id && x.pai_id !== c.id));
    const r = await dono.excluir(c.id);
    if (r?.error) await carregar();
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

      {/* A chave é a aba: trocá-la remonta o conteúdo, e é a remontagem que faz
          a entrada tocar. É o mesmo `.aba-painel` das abas do painel de
          projeto - trocar de aba num quadro só não é lido, é notado. */}
      <div className="aba-painel" key={aba}>
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
              <Comentario
                key={c.id}
                c={c}
                respostas={respostasDe(c.id)}
                pessoas={pessoas}
                etapas={etapas}
                usuarioId={usuarioId}
                podeComentar={podeComentar}
                enviando={enviando}
                permiteAnexo={!!dono.anexo}
                respondendo={respondendo === c.id}
                onResponder={setRespondendo}
                onEnviarResposta={(t, a) => void enviar(t, a, c.id)}
                onExcluir={c2 => void excluir(c2)}
                onBaixar={a => void baixar(a)}
                onVer={setVendo}
              />
            ))}
          {podeComentar && (
            <div className="ativ-escrever-pe">
              {falhou && (
                <p className="ativ-falha surge">
                  <IconAlert size={13} />
                  <span>
                    {falhou.erro}
                    <em>{falhou.texto}</em>
                  </span>
                </p>
              )}
              <Escrever pessoas={pessoas} etapas={etapas} rotuloEnvio="Comentar" enviando={enviando}
                permiteAnexo={!!dono.anexo}
                onEnviar={(t, a) => void enviar(t, a, null)} />
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
