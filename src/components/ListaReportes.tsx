// ─────────────────────────────────────────────────────────────────────────────
//  A fila de relatos, aberta pelo cartão do menu.
//
//  Ela existe pelo mesmo motivo da tabela: e-mail não é registro. Quem reportou
//  não tinha como saber se aquilo tinha chegado, e quem cuida do portal não
//  tinha lista nenhuma - só uma caixa de entrada onde o relato de ontem já
//  desceu para baixo de outra coisa.
//
//  A ordem é por urgência, e é fixa: a fila responde "o que atacar primeiro", e
//  ordenada por chegada ela devolveria a caixa de entrada. Quem ordena é o
//  servidor; aqui só se desenha o que veio.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconChevronRight, IconImage, IconImagemSem, IconX } from './icons';
import { Dialogo } from './Dialogo';
import { PreviaArquivo } from './PreviaArquivo';
import { SelectSistema } from './SelectSistema';
import { Avatar } from '../admin/FormularioTarefa';
import { ICONE_PRIORIDADE } from '../lib/prioridades';
import { instante, tempoRelativo } from '../lib/datas';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useToast } from '../lib/toast';

/**
 * Andamento do relato. Quatro estados e nada de "reaberto": se voltou, volta
 * para Aberto - estado a mais numa fila pequena só cria dúvida sobre qual usar.
 *
 * A cor sai de token, e não de hex: é ela que tinge o ponto e o fundo do chip
 * nos dois temas.
 */
export const STATUS_DO_RELATO = [
  { valor: 'aberto', label: 'Aberto', cor: 'var(--gray2)' },
  { valor: 'em_analise', label: 'Em análise', cor: 'var(--amber)' },
  { valor: 'resolvido', label: 'Resolvido', cor: 'var(--green-light)' },
  // Descartado é vermelho porque é decisão, e não esquecimento: alguém olhou e
  // disse que não vai ser feito. Em cinza ele lia como "some da fila".
  { valor: 'descartado', label: 'Descartado', cor: 'var(--red)' },
];
const ROTULO_STATUS: Record<string, { label: string; cor: string }> =
  Object.fromEntries(STATUS_DO_RELATO.map(s => [s.valor, s]));

/** Uma nota do chamado: o recado que acompanhou uma mudanca de andamento. */
export interface NotaDoRelato {
  texto: string;
  /** O andamento que a nota acompanhou. */
  status: string | null;
  autor_nome: string;
  criado_em: string;
}

export interface ReporteNaLista {
  id: number;
  texto: string;
  urgencia: string;
  pagina: string | null;
  autor_nome: string;
  autor_email: string | null;
  /** Vem de `usuarios` na hora da leitura: relato antigo mostra a foto de hoje. */
  autor_foto: string | null;
  print_nome: string | null;
  tem_print: boolean;
  status: string;
  criado_em: string;
  /** As notas ja escritas, da mais antiga para a mais nova. */
  notas?: NotaDoRelato[];
}

export function ListaReportes({ carregar, carregarPrint, mudarStatus, podeMudarStatus, onFechar }: {
  carregar: () => Promise<{ reportes?: ReporteNaLista[]; error?: string }>;
  /** O conteúdo do print vem um por vez: na lista ele não viaja. */
  carregarPrint: (id: number) => Promise<{ nome: string; tipo: string; base64: string } | null>;
  mudarStatus?: (id: number, status: string, avisar: boolean, comentario: string) => Promise<{ error?: string; aviso?: string | null } | null>;
  /**
   * Só o dono do painel muda o andamento. Esconder aqui é não oferecer um
   * caminho que voltaria 403 - a trava de verdade é o servidor, onde a ação
   * está marcada `SO_ADMIN`.
   */
  podeMudarStatus?: boolean;
  onFechar: () => void;
}) {
  const [lista, setLista] = useState<ReporteNaLista[] | null>(null);
  const [erro, setErro] = useState('');
  const [vendo, setVendo] = useState<ReporteNaLista | null>(null);
  const [erroStatus, setErroStatus] = useState('');
  /** O andamento escolhido, esperando a resposta sobre o e-mail. A troca só
   *  acontece depois: perguntar depois de aplicar deixaria a pergunta sem efeito
   *  sobre o que já tinha acontecido. */
  const [confirmando, setConfirmando] = useState<{ id: number; status: string } | null>(null);
  /** O recado que acompanha a mudança. Opcional, e some junto com a pergunta. */
  const [comentario, setComentario] = useState('');
  const campoNota = useRef<HTMLTextAreaElement>(null);
  const limparPergunta = () => { setConfirmando(null); setComentario(''); };
  /** Uma linha aberta por vez: a fila é para varrer, e três detalhes abertos
   *  juntos empurram o resto para fora da tela. */
  const [aberta, setAberta] = useState<number | null>(null);
  /** Os ids já abertos alguma vez. O detalhe deles fica montado daí em diante:
   *  montado só enquanto aberto, o bloco animaria de nada para nada. */
  const [jaAbertas, setJaAbertas] = useState<Set<number>>(new Set());
  /** O quadro agendado para abrir uma linha recém-montada. Guardado para ser
   *  cancelado se a janela fechar antes de ele chegar. */
  const quadro = useRef(0);
  useEffect(() => () => cancelAnimationFrame(quadro.current), []);
  const { toast } = useToast();
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then(r => { if (!vivo) return; if (r.error) setErro(r.error); else setLista(r.reportes ?? []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os relatos.'); });
    return () => { vivo = false; };
  }, []);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela. Com a
  // prévia ou a pergunta do e-mail abertas, o Esc é delas - senão duas caixas
  // fechavam no mesmo toque, e a fila sumia junto com a pergunta.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !vendo && !confirmando) fechar();
    };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [fechar, vendo, confirmando]);

  /** Pinta primeiro e desfaz no erro: ninguém espera a ida e a volta para ver o
   *  próprio gesto. */
  async function trocar(id: number, status: string, avisar: boolean, texto = '') {
    if (!mudarStatus) return;
    const antes = lista;
    const recado = texto.trim();
    setErroStatus('');
    // A nota entra na hora com o que a pessoa acabou de escrever; do servidor
    // só viria o carimbo de data, e esperá-lo para ver o próprio texto seria
    // esperar a ida e a volta por nada.
    const provisoria: NotaDoRelato | null = recado
      ? { texto: recado, status, autor_nome: 'Você', criado_em: new Date().toISOString() }
      : null;
    setLista(l => l?.map(x => (x.id === id
      ? { ...x, status, notas: provisoria ? [...(x.notas ?? []), provisoria] : x.notas }
      : x)) ?? l);
    const r = await mudarStatus(id, status, avisar, recado);
    if (r?.error) {
      setLista(antes);
      setErroStatus(r.error);
      return;
    }
    // Gravou, mas o e-mail não saiu: não é erro - o andamento mudou -, e mesmo
    // assim precisa ser dito, senão quem clicou acha que avisou alguém. Fica na
    // linha de aviso, e não no balão: isso é ressalva a resolver, e ressalva que
    // some sozinha em quatro segundos é ressalva perdida.
    if (r?.aviso) { setErroStatus(r.aviso); return; }
    // Deu tudo certo: o balão confirma o que aconteceu, inclusive quando a
    // escolha foi não avisar ninguém. Sem ele, "Não enviar" fechava a caixa e
    // não acontecia nada visível fora a cor do chip mudando lá na linha.
    const quem = antes?.find(x => x.id === id)?.autor_nome;
    const rotulo = ROTULO_STATUS[status]?.label ?? status;
    toast(
      'success',
      `Chamado marcado como ${rotulo.toLowerCase()}`,
      avisar
        ? `${quem ?? 'Quem reportou'} recebeu o aviso por e-mail.`
        : 'Ninguém foi avisado por e-mail.',
    );
  }

  /** Quem o e-mail iria avisar, para a pergunta dizer o nome em vez de "a
   *  pessoa". */
  const alvoDoAviso = confirmando ? lista?.find(x => x.id === confirmando.id) : null;

  // O cursor já no comentário quando a pergunta abre: escrever é o que se faz
  // ali, e as duas saídas estão a um Tab. Por efeito, e não por `autoFocus` -
  // o campo vive dentro de uma caixa que entra animada.
  useEffect(() => { if (confirmando) campoNota.current?.focus(); }, [confirmando]);

  function alternar(id: number) {
    if (aberta === id) { setAberta(null); return; }
    if (jaAbertas.has(id)) { setAberta(id); return; }
    // Primeira vez desta linha. Montar o detalhe e pôr a classe `aberto` no
    // mesmo quadro faz o bloco nascer já com a altura final: não há estado
    // anterior para interpolar, e a primeira abertura de cada linha saía seca.
    // Aqui o detalhe entra fechado e a classe vem depois - dois quadros, um
    // para o conteúdo existir e outro para o navegador ter de onde animar, que
    // é o mesmo que o `useRevelar` faz.
    setAberta(null);
    setJaAbertas(s => new Set(s).add(id));
    quadro.current = requestAnimationFrame(() => {
      quadro.current = requestAnimationFrame(() => setAberta(id));
    });
  }

  return createPortal(
    <>
      <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 10040 }} {...fundo}>
        <div className="modal-central reportes-modal" onClick={e => e.stopPropagation()}>
          <div className="gravacao-topo">
            <p className="gravacao-titulo">
              <span className="gravacao-nome">Chamados</span>
              <span className="gravacao-meta">
                O que o time reportou, do mais urgente para o menos
              </span>
            </p>
            <button type="button" className="admin-modal-close" onClick={fechar} aria-label="Fechar">
              <IconX size={16} />
            </button>
          </div>

          <div className="reportes-corpo">
            {erroStatus && (
              <p className="ff-vazio ff-erro surge"><IconAlert size={13} /> {erroStatus}</p>
            )}
            {erro ? (
              <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
            ) : !lista ? (
              <div className="dux-spinner-row" style={{ padding: 48 }}><span className="dux-spinner" /></div>
            ) : lista.length === 0 ? (
              <p className="reportes-vazio">
                Nada reportado ainda. O que for enviado pelo cartão do menu aparece aqui.
              </p>
            ) : (
              <table className="reportes-tabela">
                <thead>
                  <tr>
                    <th>Urgência</th>
                    <th>Relato</th>
                    <th>Print</th>
                    <th>Status</th>
                    <th>Solicitado por</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(r => {
                    const Icone = ICONE_PRIORIDADE[r.urgencia];
                    const abertaAqui = aberta === r.id;
                    // Resolvido sai do caminho sem sair da lista: fica riscado e
                    // apagado, do jeito que um item feito fica numa lista de
                    // tarefas. Some da fila ele nao pode - a fila tambem serve
                    // para ver que aquilo ja foi tratado, e para desfazer.
                    const resolvido = r.status === 'resolvido';
                    return (
                      <Fragment key={r.id}>
                      <tr className={`reportes-linha${abertaAqui ? ' aberta' : ''}${resolvido ? ' resolvida' : ''}`}
                        role="button" tabIndex={0} aria-expanded={abertaAqui}
                        onClick={() => alternar(r.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(r.id); }
                        }}>
                        <td>
                          {/* O selo vai num `span`, e não na própria célula: uma
                              célula com `display: flex` deixa de ser célula de
                              tabela, e a borda de baixo dela para de acompanhar
                              a linha - era o traço torto embaixo da urgência. */}
                          <span className="reportes-urgencia">
                            {Icone && <Icone size={13} />} {r.urgencia}
                          </span>
                        </td>
                        <td className="reportes-col-relato">
                          {/* A linha mostra o começo; o resto abre no detalhe.
                              Numa fila, o que se lê de relance é a primeira
                              frase, e um relato de dez linhas empurrava todos os
                              outros para fora da tela. */}
                          <div className="reportes-relato">
                            <span className={`entrega-seta${abertaAqui ? ' aberta' : ''}`}>
                              <IconChevronRight size={12} />
                            </span>
                            <p className="reportes-texto">{r.texto}</p>
                          </div>
                        </td>
                        {/* Só a célula que TEM algo para clicar engole o clique:
                            ver o print não é abrir o detalhe. Sem print, ela
                            volta a ser parte da linha - engolir o clique de uma
                            célula vazia deixa um pedaço morto no meio da fila, e
                            quem clicasse ali acharia que a linha não abre. */}
                        <td onClick={r.tem_print ? (e => e.stopPropagation()) : undefined}>
                          {r.tem_print ? (
                            <button type="button" className="reportes-print" onClick={() => setVendo(r)}
                              title={r.print_nome ?? 'Ver o print'}>
                              <IconImage size={13} /> Ver
                            </button>
                          ) : (
                            <span className="reportes-sem" title="Sem print">
                              <IconImagemSem size={14} />
                            </span>
                          )}
                        </td>
                        {/* Mesma coisa aqui: o campo de status engole o clique
                            para escolher um status não abrir o detalhe junto.
                            Para quem só lê, a célula é um chip, e o clique volta
                            a ser da linha - expandir é de todo mundo. */}
                        <td onClick={podeMudarStatus && mudarStatus ? (e => e.stopPropagation()) : undefined}>
                          {podeMudarStatus && mudarStatus ? (
                            <div style={{ width: 138 }}>
                              <SelectSistema
                                valor={r.status}
                                // Escolher o andamento abre a pergunta do
                                // e-mail; a troca acontece na resposta dela.
                                onChange={v => setConfirmando({ id: r.id, status: v })}
                                opcoes={STATUS_DO_RELATO.map(st => ({
                                  valor: st.valor,
                                  label: st.label,
                                  icone: <PontoStatus cor={st.cor} />,
                                }))}
                                estiloGatilho={{
                                  height: 30, padding: '0 10px', fontSize: 12,
                                  borderRadius: 'var(--radius-pill)',
                                }}
                              />
                            </div>
                          ) : (
                            <ChipStatus status={r.status} />
                          )}
                        </td>
                        <td>
                          {/* O nome fica: a foto reconhece de relance, mas
                              quem entrou ontem ainda não sabe de quem é a
                              cara. O e-mail vai no `title`. */}
                          <span className="reportes-quem" title={r.autor_email ?? undefined}>
                            <Avatar nome={r.autor_nome} foto={r.autor_foto} size={22} />
                            {r.autor_nome}
                          </span>
                        </td>
                        <td className="reportes-quando">
                          {instante(r.criado_em)}
                          <span className="reportes-relativo">{tempoRelativo(r.criado_em)}</span>
                        </td>
                      </tr>
                      {/* O detalhe: o relato inteiro, sem corte, e de onde ele
                          veio. Fica montado depois da primeira abertura - montado
                          só enquanto aberto, o bloco animaria de nada para nada. */}
                      {jaAbertas.has(r.id) && (
                        <tr className={`reportes-detalhe${resolvido ? ' resolvida' : ''}`}>
                          <td colSpan={6}>
                            <div className={`revelar${abertaAqui ? ' aberto' : ''}`}>
                              <div>
                                <div className="reportes-detalhe-corpo">
                                  <p className="reportes-detalhe-texto">{r.texto}</p>
                                  <p className="reportes-detalhe-meta">
                                    {r.pagina && <>Reportado em <strong>{r.pagina}</strong></>}
                                    {r.pagina && r.autor_email ? ' · ' : ''}
                                    {r.autor_email}
                                  </p>
                                  {/* O que foi dito ao mudar o andamento, da nota
                                      mais antiga para a mais nova - é a história
                                      do chamado, e ela se lê na ordem em que
                                      aconteceu. */}
                                  {!!r.notas?.length && (
                                    <ul className="reportes-notas">
                                      {r.notas.map((n, i) => (
                                        <li key={i} className="reportes-nota">
                                          <p className="reportes-nota-texto">{n.texto}</p>
                                          <p className="reportes-nota-quem">
                                            {n.autor_nome}
                                            {n.status && <> · {ROTULO_STATUS[n.status]?.label ?? n.status}</>}
                                            {' · '}{instante(n.criado_em)}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Mudar o andamento pergunta se quem reportou deve saber. Três respostas:
          avisar, mudar sem avisar, ou deixar como estava. O Cancelar existe
          porque escolher o andamento errado na lista é fácil, e sem ele a única
          saída era aplicar a mudança e voltar atrás depois.
          Escape e clique no fundo valem por Cancelar: sair de uma caixa nunca
          pode ser o mesmo que responder a ela. */}
      {confirmando && (
        <Dialogo
          titulo="Avisar quem reportou?"
          descricao={
            <>
              O chamado passa para <strong>{ROTULO_STATUS[confirmando.status]?.label ?? confirmando.status}</strong>
              {alvoDoAviso?.autor_email
                ? <> e um e-mail vai para <strong>{alvoDoAviso.autor_nome}</strong>, com o andamento novo.</>
                : <>. Este relato não tem e-mail de quem reportou, então não há para quem avisar.</>}
            </>
          }
          perigo={false}
          rotuloOk="Enviar"
          rotuloMeio="Não enviar"
          rotuloCancelar="Cancelar"
          zIndex={10070}
          largura={460}
          onConfirmar={() => { const c = confirmando, t = comentario; limparPergunta(); void trocar(c.id, c.status, true, t); }}
          onMeio={() => { const c = confirmando, t = comentario; limparPergunta(); void trocar(c.id, c.status, false, t); }}
          onFechar={limparPergunta}
        >
          {/* O recado é opcional, e fica gravado no chamado de qualquer jeito -
              inclusive saindo por "Não enviar". Ele é o motivo da mudança, e o
              motivo continua valendo quando se decide não escrever para
              ninguém. */}
          <label className="reportes-nota-campo">
            <span>Comentário (opcional)</span>
            <textarea
              ref={campoNota}
              className="form-input"
              rows={3}
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="O que aconteceu com esse chamado"
              maxLength={2000}
            />
          </label>
        </Dialogo>
      )}

      {/* A prévia é a mesma janela de todo anexo do sistema: imagem abre dentro
          dela, e o download sai de lá. */}
      {vendo && (
        <PreviaArquivo
          arquivo={{ nome: vendo.print_nome ?? 'print.png' }}
          onCarregar={() => carregarPrint(vendo.id)}
          onBaixar={() => { void baixarPrint(vendo, carregarPrint); }}
          onFechar={() => setVendo(null)}
          // Acima da própria janela, que abre em 10040: a prévia foi aberta de
          // dentro dela, e nascer atrás seria abrir e não ver nada.
          camada={10060}
        />
      )}
    </>,
    document.body,
  );
}

/** O ponto de cor do status, na lista e no chip. */
function PontoStatus({ cor }: { cor: string }) {
  return <span className="reportes-ponto" style={{ background: cor }} />;
}

/** O status de quem não pode mudá-lo: a mesma pílula de status do resto do
 *  sistema, com o ponto na cor do andamento. */
function ChipStatus({ status }: { status: string }) {
  const st = ROTULO_STATUS[status] ?? { label: status, cor: 'var(--gray2)' };
  return (
    <span className="reportes-status" style={{ '--cor': st.cor } as React.CSSProperties}>
      <PontoStatus cor={st.cor} />
      {st.label}
    </span>
  );
}

/** Salvar o print em arquivo. Blob e não `data:`: um print de tela cheia passa
 *  do teto de endereço de dados do navegador. */
async function baixarPrint(
  r: ReporteNaLista,
  carregarPrint: (id: number) => Promise<{ nome: string; tipo: string; base64: string } | null>,
) {
  const dados = await carregarPrint(r.id);
  if (!dados?.base64) return;
  const bytes = Uint8Array.from(atob(dados.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: dados.tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = dados.nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
