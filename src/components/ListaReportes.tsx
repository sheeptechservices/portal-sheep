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
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconAlert, IconImage, IconX } from './icons';
import { PreviaArquivo } from './PreviaArquivo';
import { SelectSistema } from './SelectSistema';
import { Avatar } from '../admin/FormularioTarefa';
import { ICONE_PRIORIDADE } from '../lib/prioridades';
import { instante, tempoRelativo } from '../lib/datas';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

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
}

export function ListaReportes({ carregar, carregarPrint, mudarStatus, podeMudarStatus, onFechar }: {
  carregar: () => Promise<{ reportes?: ReporteNaLista[]; error?: string }>;
  /** O conteúdo do print vem um por vez: na lista ele não viaja. */
  carregarPrint: (id: number) => Promise<{ nome: string; tipo: string; base64: string } | null>;
  mudarStatus?: (id: number, status: string) => Promise<{ error?: string } | null>;
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
  // prévia aberta ele é dela, senão as duas fecham no mesmo toque.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape' && !vendo) fechar(); };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [fechar, vendo]);

  /** Pinta primeiro e desfaz no erro: ninguém espera a ida e a volta para ver o
   *  próprio gesto. */
  async function trocar(id: number, status: string) {
    if (!mudarStatus) return;
    const antes = lista;
    setErroStatus('');
    setLista(l => l?.map(x => (x.id === id ? { ...x, status } : x)) ?? l);
    const r = await mudarStatus(id, status);
    if (r?.error) {
      setLista(antes);
      setErroStatus(r.error);
    }
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
                    return (
                      <tr key={r.id}>
                        <td className="reportes-urgencia">
                          {Icone && <Icone size={13} />} {r.urgencia}
                        </td>
                        <td>
                          {/* Uma linha por relato, cortada com reticências. O
                              texto inteiro e a tela de onde veio ficam no
                              `title`: numa fila, o que se lê de relance é a
                              primeira frase, e um relato de dez linhas empurrava
                              todos os outros para fora da tela. */}
                          <p className="reportes-texto"
                            title={r.pagina ? `${r.texto}

Em: ${r.pagina}` : r.texto}>
                            {r.texto}
                          </p>
                        </td>
                        <td>
                          {r.tem_print ? (
                            <button type="button" className="reportes-print" onClick={() => setVendo(r)}
                              title={r.print_nome ?? 'Ver o print'}>
                              <IconImage size={13} /> Ver
                            </button>
                          ) : (
                            <span className="reportes-sem">-</span>
                          )}
                        </td>
                        <td>
                          {podeMudarStatus && mudarStatus ? (
                            <div style={{ width: 138 }}>
                              <SelectSistema
                                valor={r.status}
                                onChange={v => { void trocar(r.id, v); }}
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
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

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
