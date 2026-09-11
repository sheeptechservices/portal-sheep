// ─────────────────────────────────────────────────────────────────────────────
//  O inbox do topo.
//
//  Três coisas chegam ao portal sem que ninguém aqui dentro tenha pedido: a
//  reunião que o Fireflies gravou e ainda não virou nota de projeto, o pedido
//  que o cliente abriu pela página pública, e o chamado que alguém do time
//  escreveu. As três moram em telas diferentes, e antes disto a única forma de
//  saber que chegaram era abrir as três.
//
//  A gaveta não guarda aviso nenhum: ela pede ao servidor, que monta a lista a
//  partir das próprias tabelas. O que fica gravado é só quem já leu o quê - ver
//  `inbox_lidos`, no handler.
//
//  O balão vermelho conta o que ainda não foi lido, e some quando a conta zera:
//  bolinha em cima de caixa vazia é aviso que ninguém pode atender.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconBalao, IconCheck, IconInbox, IconMegafone, IconPlay, IconX,
} from './icons';
import { Dialogo } from './Dialogo';
import { SelectSistema } from './SelectSistema';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorarCaixa } from '../lib/ancorar';
import { instante, tempoRelativo } from '../lib/datas';
import { useToast } from '../lib/toast';

/** Um aviso, no formato que o servidor manda para as três fontes. */
export interface ItemDoInbox {
  chave: string;
  tipo: 'chamado' | 'pedido' | 'reuniao';
  titulo: string;
  descricao: string;
  etiqueta: string;
  quando: string;
  lido: boolean;
  /** O que já aconteceu com o assunto: reunião atrelada, chamado resolvido. */
  situacao?: string;
  alvo?: string;
}

/** Um projeto a que a reunião pode ser atrelada. */
export interface ProjetoDoInbox {
  id: string;
  nome: string;
  /** De quem é o projeto. Nulo no projeto interno, que não tem cliente. */
  cliente?: string | null;
}

/** A medida da gaveta, escrita uma vez: o CSS desenha com ela e o ancoramento
 *  reserva o espaço dela na janela. Em dois lugares, as duas divergem no dia em
 *  que uma mudar. */
const INBOX_LARGURA = 380;
const INBOX_ALTURA = 440;

/** O desenho e a palavra de cada fonte. O ícone é o que diferencia as linhas de
 *  relance - sem ele, três avisos seguidos viram um parágrafo só. */
const FONTES = {
  chamado: { icone: IconMegafone, nome: 'Chamado do time' },
  pedido: { icone: IconBalao, nome: 'Pedido de cliente' },
  reuniao: { icone: IconPlay, nome: 'Reunião no Fireflies' },
} as const;

export function Inbox({ listar, marcarLido, limpar, vincularReuniao, onIr }: {
  listar: () => Promise<{
    itens?: ItemDoInbox[];
    naoLidos?: number;
    /** Os projetos a que uma reunião pode ser atrelada, já filtrados por quem
     *  pergunta. Vêm com a lista para a caixa de vincular abrir cheia. */
    projetos?: ProjetoDoInbox[];
    error?: string;
  }>;
  /** Marca uma ou várias. A tela manda as chaves que está mostrando. */
  marcarLido: (chaves: string[]) => Promise<{ error?: string } | null>;
  /** Tira da gaveta - a única coisa que faz um aviso sumir. */
  limpar: (chaves: string[]) => Promise<{ error?: string } | null>;
  /** Atrela a reunião do Fireflies ao projeto escolhido. */
  vincularReuniao: (firefliesId: string, projetoId: string) => Promise<{ error?: string } | null>;
  /** Leva ao lugar onde o aviso se resolve. */
  onIr: (item: ItemDoInbox) => void;
}) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<ItemDoInbox[] | null>(null);
  const [projetos, setProjetos] = useState<ProjetoDoInbox[]>([]);
  /** A reunião que está sendo atrelada, e o projeto escolhido para ela. */
  const [atrelando, setAtrelando] = useState<ItemDoInbox | null>(null);
  const [projetoEscolhido, setProjetoEscolhido] = useState('');
  const [atrelado, setAtrelado] = useState(false);
  const [erro, setErro] = useState('');
  const gatilho = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const buscar = useCallback(async () => {
    try {
      const r = await listar();
      if (r?.error) { setErro(r.error); return; }
      setErro('');
      setItens(r?.itens ?? []);
      setProjetos(r?.projetos ?? []);
    } catch {
      setErro('Não foi possível carregar os avisos.');
    }
  }, [listar]);

  // A primeira leitura acontece com a casca, e não na abertura: é ela que
  // acende o balão, e um balão que só aparece depois do clique não avisa nada.
  useEffect(() => { void buscar(); }, [buscar]);

  // Reabrir busca de novo. A gaveta fica aberta enquanto se lê, e o que chegou
  // nesse meio tempo entra na próxima abertura.
  useEffect(() => { if (aberto) void buscar(); }, [aberto, buscar]);

  useDropdownDismiss(aberto, [gatilho, gaveta], () => setAberto(false));

  // A gaveta desce do gatilho e fica presa dentro da janela - no topo, onde o
  // botão vive, isso a encosta no canto direito, que é de onde ela sai.
  useEffect(() => {
    if (!aberto || !gatilho.current) return;
    setPos(ancorarCaixa(gatilho.current, INBOX_LARGURA, INBOX_ALTURA));
  }, [aberto]);

  const naoLidos = (itens ?? []).filter(i => !i.lido).length;

  /** Pinta na hora e manda depois: marcar como lido é gesto de leitura, e
   *  esperar a volta do servidor para apagar um negrito não se justifica. */
  const marcar = useCallback(async (chaves: string[]) => {
    if (!chaves.length) return;
    const antes = itens;
    setItens(atual => (atual ?? []).map(i => (chaves.includes(i.chave) ? { ...i, lido: true } : i)));
    const r = await marcarLido(chaves);
    if (r?.error) setItens(antes);
  }, [itens, marcarLido]);

  /**
   * Tira da gaveta. Some na hora e volta se o servidor recusar.
   *
   * É o único jeito de um aviso sair do inbox: atrelar a reunião e resolver o
   * chamado mudam a linha, não a tiram. Quem decide quando o aviso acabou é
   * quem está olhando.
   */
  const limparAvisos = useCallback(async (chaves: string[]) => {
    if (!chaves.length) return;
    const antes = itens;
    setItens(atual => (atual ?? []).filter(i => !chaves.includes(i.chave)));
    const r = await limpar(chaves);
    if (r?.error) setItens(antes);
  }, [itens, limpar]);

  return (
    <>
      <button ref={gatilho} type="button" className="topo-icone inbox-gatilho"
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        aria-label={naoLidos ? `Inbox, ${naoLidos} por ler` : 'Inbox'}
        title={naoLidos ? `${naoLidos} aviso${naoLidos === 1 ? '' : 's'} por ler` : 'Inbox'}>
        <IconInbox size={16} />
        {naoLidos > 0 && (
          <span className="inbox-balao surge" aria-hidden="true">
            {naoLidos > 9 ? '9+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && createPortal(
        <div ref={gaveta} className="inbox-gaveta" role="dialog" aria-label="Inbox"
          style={{ top: pos.top, left: pos.left }}>
          <div className="inbox-topo">
            <p className="inbox-titulo">Inbox</p>
            {/* Cada botão some quando não tem o que fazer: botão que não faz
                nada é promessa quebrada. */}
            <span className="inbox-acoes">
              {naoLidos > 0 && (
                <button type="button" className="inbox-tudo troca"
                  onClick={() => { void marcar((itens ?? []).filter(i => !i.lido).map(i => i.chave)); }}>
                  <IconCheck size={12} /> Marcar todas como lidas
                </button>
              )}
              {!!itens?.length && (
                <button type="button" className="inbox-tudo troca"
                  onClick={() => { void limparAvisos((itens ?? []).map(i => i.chave)); }}>
                  <IconX size={12} /> Limpar todas
                </button>
              )}
            </span>
          </div>

          <div className="inbox-lista">
            {erro ? (
              <p className="inbox-vazio">{erro}</p>
            ) : itens == null ? (
              <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
            ) : !itens.length ? (
              <div className="admin-empty" style={{ padding: '28px 0' }}>
                <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={26} /></p>
                <p>Nada novo por aqui.</p>
                <p className="inbox-vazio-nota">
                  Reunião gravada, pedido de cliente e chamado do time aparecem nesta
                  gaveta assim que chegam, e ficam até você limpar.
                </p>
              </div>
            ) : (
              <ul className="inbox-itens lista-anima" key={itens.length}>
                {itens.map(item => {
                  const fonte = FONTES[item.tipo];
                  const Icone = fonte.icone;
                  return (
                    <li key={item.chave} className={`inbox-item${item.lido ? ' lido' : ''}`}>
                      {/* A linha inteira é o gatilho: o alvo do clique é o aviso
                          que se estava lendo, e não um botão a mais no fim dele.

                          E ela fecha a gaveta ao levar - a gaveta cobre
                          justamente o canto onde a ficha vai abrir, e ficar em
                          cima dela faria o clique parecer que não fez nada. */}
                      <button type="button" className="inbox-item-alvo"
                        onClick={() => {
                          void marcar([item.chave]);
                          setAberto(false);
                          // A reunião não tem tela para onde levar: ela vira
                          // nota de projeto, e a escolha do projeto é a
                          // pergunta. A caixa abre aqui mesmo.
                          if (item.tipo === 'reuniao') {
                            setProjetoEscolhido('');
                            setAtrelando(item);
                            return;
                          }
                          onIr(item);
                        }}>
                        <span className="inbox-item-icone"><Icone size={14} /></span>
                        <span className="inbox-item-texto">
                          <span className="inbox-item-titulo">{item.titulo}</span>
                          <span className="inbox-item-desc">{item.descricao}</span>
                          <span className="inbox-item-rodape">
                            {fonte.nome}
                            {item.etiqueta && <> · {item.etiqueta}</>}
                            {/* O que já aconteceu com ele: a reunião foi
                                atrelada, o chamado foi resolvido. O aviso fica
                                na gaveta contando isso até alguém limpá-lo. */}
                            {item.situacao && (
                              <span className="inbox-item-situacao">{item.situacao}</span>
                            )}
                            <span className="inbox-item-quando" title={instante(item.quando)}>
                              {tempoRelativo(item.quando)}
                            </span>
                          </span>
                        </span>
                      </button>
                      <span className="inbox-item-acoes">
                        {!item.lido && (
                          <button type="button" className="inbox-marcar"
                            title="Marcar como lido" aria-label={`Marcar "${item.titulo}" como lido`}
                            onClick={() => { void marcar([item.chave]); }}>
                            <IconCheck size={12} />
                          </button>
                        )}
                        <button type="button" className="inbox-marcar inbox-limpar"
                          title="Limpar" aria-label={`Limpar "${item.titulo}"`}
                          onClick={() => { void limparAvisos([item.chave]); }}>
                          <IconX size={12} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* Vincular a reunião a um projeto: a pergunta é uma só, então ela vem na
          caixa da casa em vez de uma tela nova. Sem projeto para escolher, a
          caixa diz isso em vez de oferecer um seletor vazio. */}
      {atrelando && (
        <Dialogo
          titulo="Vincular reunião a um projeto"
          descricao={<><strong>{atrelando.titulo}</strong> vira nota no diário do projeto escolhido, com o resumo do Fireflies.</>}
          rotuloOk="Vincular"
          perigo={false}
          ocupado={atrelado}
          ocupadoRotulo="Vinculando"
          largura={420}
          onFechar={() => setAtrelando(null)}
          onConfirmar={() => {
            if (!projetoEscolhido || atrelado) return;
            setAtrelado(true);
            void (async () => {
              const r = await vincularReuniao(atrelando.chave.replace(/^reuniao:/, ''), projetoEscolhido);
              setAtrelado(false);
              if (r?.error) { toast('error', 'Não consegui vincular', r.error); return; }
              const projeto = projetos.find(p => p.id === projetoEscolhido);
              toast('success', 'Reunião vinculada', `${atrelando.titulo} entrou em ${projeto?.nome ?? 'o projeto'}`);
              setAtrelando(null);
              // A lista volta do servidor com ela ainda lá, agora marcada como
              // atrelada: o aviso vira registro do que se fez, e quem o tira da
              // gaveta é quem limpa.
              void buscar();
            })();
          }}
        >
          {projetos.length ? (
            <label className="inbox-campo">
              <span className="form-label">Projeto</span>
              {/* O cliente vai na segunda linha da opção: dois projetos com o
                  mesmo nome só se distinguem por ele. */}
              <SelectSistema valor={projetoEscolhido} onChange={setProjetoEscolhido}
                placeholder="Escolha o projeto"
                opcoes={projetos.map(p => ({
                  valor: p.id,
                  label: p.nome,
                  descricao: p.cliente ?? 'Sem cliente',
                }))} />
            </label>
          ) : (
            <p className="inbox-vazio" style={{ padding: '12px 0 0' }}>
              Nenhum projeto ativo para vincular.
            </p>
          )}
        </Dialogo>
      )}
    </>
  );
}
