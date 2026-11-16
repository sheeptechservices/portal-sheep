// ─────────────────────────────────────────────────────────────────────────────
//  O mural da equipe: os recados da semana que não cabem em tarefa.
//
//  A reunião de quarta com o cliente e o que cada um precisa deixar pronto:
//  texto livre, com as marcas da casa e as pessoas marcadas com `@`, como num
//  comentário de tarefa. Quem é marcado recebe o aviso no inbox e vê o número
//  no botão.
//
//  Cada pessoa vê só os recados que escreveu e os que a marcam - quem não foi
//  marcado nunca os vê, e o servidor nem os manda. Todo mundo escreve, e só o
//  autor edita ou exclui o próprio recado.
//
//  Mora no canto da tela, ao lado do diário e do Reportar, e abre do mesmo
//  jeito: um botão de vidro que se desdobra num cartão. A peça é a mesma do
//  diário (`.diario-fab`, `.diario-cartao`), com o que o mural tem de próprio.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AdminApp';
import { useToast } from '../lib/toast';
import { Escrever, TextoDoComentario, idsMarcados } from '../components/Atividade';
import { Avatar, type Pessoa } from './FormularioTarefa';
import { instante, tempoRelativo } from '../lib/datas';
import { IconEdit, IconMural, IconPlus, IconTrash, IconX } from '../components/icons';

interface Nota {
  id: number;
  texto: string;
  autor_id: string | null;
  autor_nome: string;
  criado_em: string;
  editado_em: string | null;
  editado_por_nome: string | null;
  /** Os ids de quem foi marcado no texto. */
  mencoes: string[];
}

/** Quando cada pessoa abriu o mural pela última vez, no navegador dela. É o
 *  que separa a marcação nova da que ela já leu. */
const chaveDoVisto = (id: string) => `mural:visto:${id}`;
function lerVisto(id: string | undefined): string {
  if (!id) return '';
  try { return localStorage.getItem(chaveDoVisto(id)) ?? ''; } catch { return ''; }
}
function gravarVisto(id: string | undefined, quando: string) {
  if (!id) return;
  try { localStorage.setItem(chaveDoVisto(id), quando); } catch { /* sem armazenamento: o número volta */ }
}

/** A última mão no recado: a edição, quando houve, ou a criação. */
const ultimaMao = (n: Nota) => n.editado_em ?? n.criado_em;

export function MuralDaEquipe({ token, abrir, onAbriu }: {
  token: string;
  /** Pedido de fora - o aviso do inbox - para abrir o mural, com o recado a
   *  pôr em destaque. O `nonce` faz o mesmo pedido valer de novo. */
  abrir?: { nonce: number; nota?: number } | null;
  onAbriu?: () => void;
}) {
  const { onSessionExpired, usuario } = useAuth();
  const { toast } = useToast();
  const eu = usuario?.id ?? null;
  /** Todo mundo com conta escreve. A entrada pela senha do painel não tem
   *  pessoa, e recado sem autor não teria quem pudesse mexer nele depois. */
  const podeEscrever = !!eu;
  const [aberto, setAberto] = useState(false);
  const [notas, setNotas] = useState<Nota[] | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [visto, setVisto] = useState(() => lerVisto(usuario?.id));
  /** A caixa de recado novo: aberta ou não, e a chave que a remonta com o
   *  texto devolvido quando o servidor recusa. */
  const [escrevendo, setEscrevendo] = useState(false);
  const [rascunho, setRascunho] = useState<{ texto: string; erro?: string; chave: number } | null>(null);
  const [editando, setEditando] = useState<{ id: number; texto: string; erro?: string } | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);
  const [destaque, setDestaque] = useState<number | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const caixaNova = useRef<HTMLDivElement>(null);

  useEffect(() => { setVisto(lerVisto(usuario?.id)); }, [usuario?.id]);

  const api = useCallback(async (busca: string, corpo?: unknown) => {
    const r = await fetch(`/api/admin-data${busca ? `?${busca}` : ''}`, corpo
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-session': token }, body: JSON.stringify(corpo) }
      : { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  const carregar = useCallback(async () => {
    const r = await api('action=mural_notas');
    if (!r || r.error || !Array.isArray(r.notas)) return;
    // O recado que ainda vai e volta do servidor fica na tela: a leitura
    // saiu antes de ela chegar lá.
    setNotas(antes => [...(antes ?? []).filter(n => n.id < 0), ...r.notas]);
  }, [api]);

  // Lê ao montar (o número do botão precisa dele), a cada abertura e quando a
  // aba volta à vista, como o diário.
  useEffect(() => {
    void carregar();
    const aoVoltar = () => { if (document.visibilityState === 'visible') void carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);
  useEffect(() => {
    if (!aberto) return;
    void carregar();
    if (pessoas.length === 0) {
      void api('action=usuarios_notificaveis').then(u => { if (Array.isArray(u?.usuarios)) setPessoas(u.usuarios); });
    }
  }, [aberto]);

  // Abrir conta como ver: o número do botão zera, e o que chegar depois volta
  // a contar. O destaque das novas fica até o cartão fechar.
  const [vistoAoAbrir, setVistoAoAbrir] = useState('');
  useEffect(() => {
    if (!aberto) return;
    setVistoAoAbrir(visto);
    const agora = new Date().toISOString();
    gravarVisto(usuario?.id, agora);
    setVisto(agora);
  }, [aberto]);

  // O aviso do inbox abre o mural com o recado dele em destaque.
  useEffect(() => {
    if (!abrir) return;
    setAberto(true);
    setDestaque(abrir.nota ?? null);
    onAbriu?.();
  }, [abrir?.nonce]);
  useEffect(() => {
    if (!aberto || destaque == null || !notas) return;
    const el = cartao.current?.querySelector(`[data-nota="${destaque}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = window.setTimeout(() => setDestaque(null), 2400);
    return () => window.clearTimeout(t);
  }, [aberto, destaque, notas]);

  // Fecha com Esc e com clique fora, como o diário. A lista de marcação mora
  // num portal no `body`, fora do cartão: escolher alguém nela não é fora.
  useEffect(() => {
    if (!aberto) return;
    const dentro = (n: Node | null) => !!n && (cartao.current?.contains(n) || botao.current?.contains(n)
      || (n instanceof Element && !!n.closest('.ativ-mencoes')));
    const aoClicar = (e: MouseEvent) => { if (!dentro(e.target as Node)) setAberto(false); };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Com uma caixa aberta, o Esc dela vem primeiro: ele fecha a marcação.
      if (document.activeElement?.closest('.ativ-escrever')) return;
      setAberto(false);
    };
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  // O foco vai para a caixa quando ela abre, e não na montagem: ela fica
  // montada dentro do `.revelar`.
  useEffect(() => {
    if (!escrevendo) return;
    const t = window.setTimeout(() => {
      caixaNova.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
    }, 60);
    return () => window.clearTimeout(t);
  }, [escrevendo]);

  /** Marcações que a pessoa ainda não viu: recado de outra pessoa que a marca,
   *  escrito ou corrigido depois da última vez que ela abriu o mural. */
  const nova = useCallback((n: Nota, desde: string) => !!eu && n.mencoes.includes(eu)
    && ultimaMao(n) > desde && n.autor_id !== eu, [eu]);
  const naoVistas = useMemo(() => (notas ?? []).filter(n => n.id > 0 && nova(n, visto)).length, [notas, nova, visto]);

  const nomeDe = (id: string | null) => pessoas.find(p => p.id === id);

  // ── Gravar ────────────────────────────────────────────────────────────────

  /** Recado novo: aparece no alto na hora e vai ao servidor por baixo. Se
   *  ele recusar, ela sai da lista e o texto volta para a caixa. */
  async function criar(texto: string): Promise<string | null> {
    const provisoria: Nota = {
      id: -Date.now(), texto, autor_id: eu, autor_nome: usuario?.nome ?? 'Você',
      criado_em: new Date().toISOString(), editado_em: null, editado_por_nome: null,
      mencoes: idsMarcados(texto),
    };
    setNotas(l => [provisoria, ...(l ?? [])]);
    setEscrevendo(false);
    setRascunho(null);
    void api('', { action: 'salvar_mural_nota', texto, mencoes: provisoria.mencoes })
      .catch(() => null)
      .then(r => {
        if (!r || r.error || !r.id) {
          setNotas(l => (l ?? []).filter(n => n.id !== provisoria.id));
          setRascunho({ texto, erro: r?.error ?? 'O servidor não respondeu. Tente de novo.', chave: Date.now() });
          setEscrevendo(true);
          return;
        }
        setNotas(l => (l ?? []).map(n => (n.id === provisoria.id
          ? { ...n, id: Number(r.id), criado_em: String(r.quando ?? n.criado_em), mencoes: r.mencoes ?? n.mencoes } : n)));
      });
    return null;
  }

  /** Corrigir: o texto novo aparece na hora; recusado, volta o anterior e a
   *  caixa reabre com o que se escreveu. */
  async function salvarEdicao(alvo: Nota, texto: string): Promise<string | null> {
    const antes = notas;
    const agora = new Date().toISOString();
    setNotas(l => (l ?? []).map(n => (n.id === alvo.id ? {
      ...n, texto, mencoes: idsMarcados(texto), editado_em: agora, editado_por_nome: usuario?.nome ?? null,
    } : n)));
    setEditando(null);
    void api('', { action: 'salvar_mural_nota', id: alvo.id, texto, mencoes: idsMarcados(texto) })
      .catch(() => null)
      .then(r => {
        if (!r || r.error) {
          setNotas(antes);
          setEditando({ id: alvo.id, texto, erro: r?.error ?? 'O servidor não respondeu. Tente de novo.' });
          return;
        }
        setNotas(l => (l ?? []).map(n => (n.id === alvo.id ? { ...n, editado_em: String(r.quando ?? agora) } : n)));
      });
    return null;
  }

  function excluir(alvo: Nota) {
    const antes = notas;
    setApagando(null);
    setNotas(l => (l ?? []).filter(n => n.id !== alvo.id));
    void api('', { action: 'excluir_mural_nota', id: alvo.id })
      .catch(() => null)
      .then(r => {
        if (r && !r.error) return;
        setNotas(antes);
        toast('error', 'O recado não foi excluído', r?.error ?? 'O servidor não respondeu. Tente de novo.');
      });
  }

  const lista = notas ?? [];
  // A assinatura do que está na lista: recado que entra ou sai remonta e
  // toca a entrada; editar um não mexe nos outros. Com uma caixa aberta, a
  // chave fica parada - remontar apagaria o que se está escrevendo.
  const assinatura = useRef('');
  if (!editando) assinatura.current = lista.map(n => n.id).join('.');

  return (
    <>
      <button type="button" ref={botao} className={`diario-fab mural-fab${aberto ? ' aberto' : ''}`}
        aria-expanded={aberto} aria-label={aberto ? 'Fechar o mural' : 'Abrir o mural da equipe'}
        title={aberto ? undefined : 'Mural da equipe: os recados para você'}
        onClick={() => setAberto(a => !a)}>
        <span className="diario-fab-giro" key={aberto ? 'x' : 'mural'}>
          {aberto ? <IconX size={18} /> : <IconMural size={19} />}
        </span>
        {/* Quantos recados marcaram você desde a última vez que abriu. */}
        <span className={`diario-fab-selo${naoVistas > 0 && !aberto ? ' visivel' : ''}`} aria-hidden="true">
          {naoVistas > 99 ? '99+' : naoVistas}
        </span>
      </button>

      <div ref={cartao} className={`diario-cartao mural-cartao${aberto ? ' aberto' : ''}`} aria-hidden={!aberto}
        role="dialog" aria-label="Mural da equipe">
        <div className="diario-cabeca">
          <div className="diario-cabeca-textos">
            <span className="diario-rotulo">Mural da equipe</span>
            <span className="diario-data">
              {lista.length === 0 ? 'Nenhum recado' : `${lista.length} ${lista.length === 1 ? 'recado' : 'recados'}`}
            </span>
          </div>
          {podeEscrever && (
            <button type="button" className={`mural-nova${escrevendo ? ' aberta' : ''}`} tabIndex={aberto ? 0 : -1}
              aria-expanded={escrevendo} onClick={() => setEscrevendo(e => !e)}>
              <IconPlus size={13} /> Novo recado
            </button>
          )}
        </div>

        {/* A caixa nova fica montada e só se revela: o rascunho sobrevive a
            fechar e abrir o cartão. */}
        {podeEscrever && (
          <div className={`revelar${escrevendo ? ' aberto' : ''}`}>
            <div>
              <div className="mural-escrever" ref={caixaNova}>
                <Escrever key={rascunho?.chave ?? 0}
                  pessoas={pessoas} enterQuebraLinha linhas={4}
                  inicial={rascunho?.texto} erroInicial={rascunho?.erro}
                  rotulo="Novo recado" rotuloEnvio="Publicar"
                  placeholder="O recado. Marque com @ quem precisa ver - só quem for marcado vê."
                  onEnviar={texto => criar(texto)}
                  onCancelar={() => setEscrevendo(false)} />
              </div>
            </div>
          </div>
        )}

        <div className="diario-corpo mural-corpo">
          {notas === null ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : lista.length === 0 ? (
            <div className="diario-vazio">
              <span className="diario-vazio-ico mural-vazio-ico"><IconMural size={22} /></span>
              <p>Nenhum recado para você.</p>
              <p className="mural-vazio-dica">Aqui aparecem os recados que você escreve e os que marcam você.</p>
            </div>
          ) : (
            <ul className="mural-lista lista-anima" key={assinatura.current}>
              {lista.map(n => {
                const minha = !!eu && n.mencoes.includes(eu);
                const recem = nova(n, vistoAoAbrir) && !!vistoAoAbrir;
                const autor = nomeDe(n.autor_id);
                return (
                  <li key={n.id} data-nota={n.id}
                    className={`mural-nota${minha ? ' minha' : ''}${destaque === n.id ? ' destaque' : ''}${n.id < 0 ? ' gravando' : ''}`}>
                    <div className="mural-nota-topo">
                      <Avatar nome={n.autor_nome || 'Alguém'} foto={autor?.foto_url} size={22} />
                      <span className="mural-nota-quem">
                        <strong>{n.autor_nome || 'Alguém'}</strong>
                        <span title={instante(n.criado_em)}>{tempoRelativo(n.criado_em)}</span>
                        {n.editado_em && (
                          <span className="mural-nota-editada"
                            title={`Editada${n.editado_por_nome ? ` por ${n.editado_por_nome}` : ''} em ${instante(n.editado_em)}`}>
                            | editada
                          </span>
                        )}
                        {recem && <span className="mural-nota-nova">nova</span>}
                      </span>
                      {/* Só no que é seu: o recado de outra pessoa se lê,
                          mas não se mexe. */}
                      {n.autor_id === eu && n.id > 0 && editando?.id !== n.id && (
                        <span className="mural-nota-acoes">
                          <button type="button" className="mural-nota-acao" title="Editar o recado"
                            aria-label="Editar o recado" tabIndex={aberto ? 0 : -1}
                            onClick={() => { setApagando(null); setEditando({ id: n.id, texto: n.texto }); }}>
                            <IconEdit size={13} />
                          </button>
                          <button type="button" className="mural-nota-acao perigo" title="Excluir o recado"
                            aria-label="Excluir o recado" tabIndex={aberto ? 0 : -1}
                            onClick={() => setApagando(a => (a === n.id ? null : n.id))}>
                            <IconTrash size={13} />
                          </button>
                        </span>
                      )}
                    </div>

                    {/* Ler e editar são a mesma área trocando de cara. */}
                    {editando?.id === n.id ? (
                      <div className="mural-nota-edicao troca">
                        <Escrever pessoas={pessoas} enterQuebraLinha linhas={3} autoFoco
                          inicial={editando.texto} erroInicial={editando.erro}
                          rotulo="Editar o recado" rotuloEnvio="Salvar"
                          placeholder="O recado. Marque com @ quem precisa ver."
                          onEnviar={texto => salvarEdicao(n, texto)}
                          onCancelar={() => setEditando(null)} />
                      </div>
                    ) : (
                      <div className="mural-nota-texto troca">
                        <TextoDoComentario texto={n.texto} eu={eu} />
                      </div>
                    )}

                    {/* Excluir pede confirmação ali mesmo, sem diálogo por cima
                        do cartão: a pergunta nasce embaixo do recado. */}
                    {apagando === n.id && (
                      <div className="mural-confirma surge">
                        <span>Excluir este recado? Não dá para desfazer.</span>
                        <button type="button" className="ativ-botao-fraco" onClick={() => setApagando(null)}>Cancelar</button>
                        <button type="button" className="mural-confirma-sim" onClick={() => excluir(n)}>Excluir</button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
