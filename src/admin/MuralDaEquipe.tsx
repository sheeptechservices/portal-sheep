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
import { DicaTopo, useDicaRica } from '../components/DicaRica';
import {
  IconCheckCircle, IconChevronRight, IconEdit, IconEstrela, IconEye, IconHelp, IconJoinha, IconMural, IconPlus,
  IconTrash, IconX,
} from '../components/icons';

/** Alguém marcado no recado, com o que a tela precisa para desenhá-lo. */
interface Marcado { id: string; nome: string; foto: string | null }

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
  marcados: Marcado[];
  /** Quem dos marcados viu, e quando viu pela última vez. */
  vistos: { usuario_id: string; em: string }[];
  reacoes: { usuario_id: string; tipo: string; nome: string }[];
}

/** As reações do mural: ícones da casa, cada um com a palavra que ele quer
 *  dizer - é ela que aparece na dica, para ninguém adivinhar o desenho. */
const REACOES = [
  { tipo: 'concordo', rotulo: 'Concordo', Icone: IconJoinha },
  { tipo: 'feito', rotulo: 'Feito', Icone: IconCheckCircle },
  { tipo: 'duvida', rotulo: 'Tenho dúvida', Icone: IconHelp },
  { tipo: 'otimo', rotulo: 'Ótimo', Icone: IconEstrela },
] as const;

/** A última mão no recado: a edição, quando houve, ou a criação. */
const ultimaMao = (n: Nota) => n.editado_em ?? n.criado_em;

/** Quem o texto marca, no formato gravado `@[Nome](id)`: é o que o recado
 *  recém-escrito mostra antes de o servidor devolver a lista. */
function marcadosDoTexto(texto: string, pessoas: Pessoa[]): Marcado[] {
  const vistos = new Map<string, Marcado>();
  for (const m of texto.matchAll(/@\[([^\]]+)\]\(([^)]+)\)/g)) {
    if (!vistos.has(m[2])) {
      vistos.set(m[2], { id: m[2], nome: m[1], foto: pessoas.find(p => p.id === m[2])?.foto_url ?? null });
    }
  }
  return [...vistos.values()];
}

/** Como está a leitura de uma pessoa marcada: viu a versão que está lá, viu
 *  uma anterior à última edição, ou ainda não viu. */
function leitura(n: Nota, id: string): { estado: 'viu' | 'anterior' | 'nao'; em?: string } {
  const v = n.vistos.find(x => x.usuario_id === id);
  if (!v) return { estado: 'nao' };
  return { estado: v.em >= ultimaMao(n) ? 'viu' : 'anterior', em: v.em };
}

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
  /** Os recados que ainda não tinham sido vistos quando o cartão abriu: levam
   *  o selo de novo até ele fechar, mesmo depois de contados como vistos. */
  const [novosAoAbrir, setNovosAoAbrir] = useState<Set<number>>(new Set());
  /** A reação sendo escolhida, e de quais recados a lista de quem viu está
   *  aberta. */
  const [reagindo, setReagindo] = useState<number | null>(null);
  const [quemViuAberto, setQuemViuAberto] = useState<Set<number>>(new Set());
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

  /** O recado de outra pessoa que marca quem está olhando e que ela ainda não
   *  viu na versão atual. É o número do botão. */
  const naoVisto = useCallback((n: Nota) => !!eu && n.id > 0 && n.autor_id !== eu
    && n.mencoes.includes(eu) && leitura(n, eu).estado !== 'viu', [eu]);
  const naoVistas = useMemo(() => (notas ?? []).filter(naoVisto).length, [notas, naoVisto]);
  /** Todos os recados do seu mural: os que marcam você e os que você escreveu. */
  const total = useMemo(() => (notas ?? []).filter(n => n.id > 0).length, [notas]);

  // O selo de novo é o retrato da abertura: o que não tinha sido visto quando
  // o cartão abriu, e não o que continua sem ver.
  useEffect(() => {
    if (aberto) setNovosAoAbrir(new Set((notas ?? []).filter(naoVisto).map(n => n.id)));
    else { setReagindo(null); }
  }, [aberto]);

  // Visto é o recado que apareceu na tela de quem foi marcado, com o mural
  // aberto - metade dele à vista, ou um bom pedaço do que é longo. Os vistos
  // de uma rolagem vão juntos numa gravação só.
  const filaDeVistos = useRef(new Set<number>());
  const relogioDeVistos = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!aberto || !notas || !eu) return;
    const raiz = cartao.current?.querySelector('.mural-corpo') ?? null;
    const enviar = () => {
      const ids = [...filaDeVistos.current];
      filaDeVistos.current.clear();
      if (!ids.length) return;
      const agora = new Date().toISOString();
      setNotas(l => (l ?? []).map(n => (ids.includes(n.id)
        ? { ...n, vistos: [...n.vistos.filter(v => v.usuario_id !== eu), { usuario_id: eu, em: agora }] } : n)));
      void api('', { action: 'ver_mural_notas', ids }).catch(() => null);
    };
    const observador = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting || (e.intersectionRatio < 0.5 && e.intersectionRect.height < 140)) continue;
        const id = Number((e.target as HTMLElement).dataset.nota);
        const n = notas.find(x => x.id === id);
        if (n && naoVisto(n)) filaDeVistos.current.add(id);
      }
      if (filaDeVistos.current.size) {
        window.clearTimeout(relogioDeVistos.current);
        relogioDeVistos.current = window.setTimeout(enviar, 700);
      }
    }, { root: raiz, threshold: [0, 0.5, 1] });
    cartao.current?.querySelectorAll('.mural-nota[data-nota]').forEach(el => observador.observe(el));
    return () => observador.disconnect();
  }, [aberto, notas, eu, naoVisto, api]);

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

  const nomeDe = (id: string | null) => pessoas.find(p => p.id === id);

  // ── Gravar ────────────────────────────────────────────────────────────────

  /** Recado novo: aparece no alto na hora e vai ao servidor por baixo. Se
   *  ele recusar, ela sai da lista e o texto volta para a caixa. */
  async function criar(texto: string): Promise<string | null> {
    const provisoria: Nota = {
      id: -Date.now(), texto, autor_id: eu, autor_nome: usuario?.nome ?? 'Você',
      criado_em: new Date().toISOString(), editado_em: null, editado_por_nome: null,
      mencoes: idsMarcados(texto), marcados: marcadosDoTexto(texto, pessoas), vistos: [], reacoes: [],
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
      ...n, texto, mencoes: idsMarcados(texto), marcados: marcadosDoTexto(texto, pessoas),
      editado_em: agora, editado_por_nome: usuario?.nome ?? null,
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

  /** Dar ou tirar uma reação: pinta na hora, desfaz se o servidor recusar. */
  function reagir(alvo: Nota, tipo: string) {
    if (!eu) return;
    setReagindo(null);
    const ativa = alvo.reacoes.some(r => r.usuario_id === eu && r.tipo === tipo);
    const trocar = (ligar: boolean) => setNotas(l => (l ?? []).map(n => (n.id !== alvo.id ? n : {
      ...n,
      reacoes: ligar
        ? [...n.reacoes, { usuario_id: eu, tipo, nome: usuario?.nome ?? 'Você' }]
        : n.reacoes.filter(r => !(r.usuario_id === eu && r.tipo === tipo)),
    })));
    trocar(!ativa);
    void api('', { action: 'reagir_mural_nota', id: alvo.id, tipo })
      .catch(() => null)
      .then(r => {
        if (r && !r.error) return;
        trocar(ativa);
        toast('error', 'A reação não foi gravada', r?.error ?? 'O servidor não respondeu. Tente de novo.');
      });
  }

  const alternarQuemViu = (id: number) => setQuemViuAberto(a => {
    const novo = new Set(a);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });

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
        title={aberto ? undefined : total === 0 ? 'Mural da equipe: nenhum recado'
          : `Mural da equipe: ${total} ${total === 1 ? 'recado' : 'recados'}${naoVistas ? `, ${naoVistas} sem ver` : ''}`}
        onClick={() => setAberto(a => !a)}>
        <span className="diario-fab-giro" key={aberto ? 'x' : 'mural'}>
          {aberto ? <IconX size={18} /> : <IconMural size={19} />}
        </span>
        {/* Quantos recados há no seu mural, sempre à vista, como as tarefas do
            diário: é o lembrete de que tem recado lá dentro. Vermelho quando
            algum que marca você ainda não foi visto na versão que está lá. */}
        <span className={`diario-fab-selo${total > 0 && !aberto ? ' visivel' : ''}${naoVistas > 0 ? ' ruim' : ''}`}
          aria-hidden="true">
          {total > 99 ? '99+' : total}
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
                const recem = novosAoAbrir.has(n.id);
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

                    {editando?.id !== n.id && n.id > 0 && (
                      <RodapeDoRecado n={n} eu={eu} reagindo={reagindo === n.id}
                        quemViu={quemViuAberto.has(n.id)} focavel={aberto}
                        onAbrirReacoes={() => setReagindo(r => (r === n.id ? null : n.id))}
                        onReagir={tipo => reagir(n, tipo)}
                        onAlternarQuemViu={() => alternarQuemViu(n.id)} />
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

/** O pé de um recado: as reações e quem viu.
 *
 *  As reações aparecem quando alguém reagiu, cada uma com quantos e quem; o
 *  botão do lado abre as quatro para escolher. Quem viu é a conta dos marcados
 *  que leram a versão que está lá, e abre a lista de cada um com a hora - é o
 *  que tira o "não vi o recado" da conversa. */
function RodapeDoRecado({ n, eu, reagindo, quemViu, focavel, onAbrirReacoes, onReagir, onAlternarQuemViu }: {
  n: Nota;
  eu: string | null;
  reagindo: boolean;
  quemViu: boolean;
  focavel: boolean;
  onAbrirReacoes: () => void;
  onReagir: (tipo: string) => void;
  onAlternarQuemViu: () => void;
}) {
  const tab = focavel ? 0 : -1;
  const dadas = REACOES
    .map(r => ({ ...r, quem: n.reacoes.filter(x => x.tipo === r.tipo) }))
    .filter(r => r.quem.length > 0);
  const viram = n.marcados.filter(m => leitura(n, m.id).estado === 'viu');

  return (
    <>
      <div className="mural-rodape">
        <div className="mural-reacoes">
          {dadas.map(r => (
            <ChipDaReacao key={r.tipo} reacao={r} quem={r.quem} eu={eu} tab={tab}
              fotoDe={id => n.marcados.find(m => m.id === id)?.foto ?? null}
              onReagir={() => onReagir(r.tipo)} />
          ))}
          {/* As quatro, para escolher: nascem no lugar do botão, como peça
              que aparece por uma escolha. */}
          {reagindo ? (
            <span className="mural-reagir-opcoes surge" role="group" aria-label="Reagir">
              {REACOES.map(r => {
                const minha = !!eu && n.reacoes.some(x => x.usuario_id === eu && x.tipo === r.tipo);
                return (
                  <button key={r.tipo} type="button" tabIndex={tab}
                    className={`mural-reagir-opcao${minha ? ' minha' : ''}`}
                    title={r.rotulo} aria-label={r.rotulo} aria-pressed={minha}
                    onClick={() => onReagir(r.tipo)}>
                    <r.Icone size={14} />
                  </button>
                );
              })}
              <button type="button" className="mural-reagir-opcao" tabIndex={tab}
                title="Fechar" aria-label="Fechar as reações" onClick={onAbrirReacoes}>
                <IconX size={12} />
              </button>
            </span>
          ) : (
            <button type="button" className="mural-reagir" tabIndex={tab}
              title="Reagir" aria-label="Reagir ao recado" onClick={onAbrirReacoes}>
              <IconJoinha size={13} /><IconPlus size={10} />
            </button>
          )}
        </div>

        {n.marcados.length > 0 ? (
          <button type="button" className={`mural-vistos${quemViu ? ' aberto' : ''}`} tabIndex={tab}
            aria-expanded={quemViu} onClick={onAlternarQuemViu}
            title={viram.length ? `Viram: ${viram.map(m => m.nome).join(', ')}` : 'Ninguém viu ainda'}>
            <IconEye size={13} />
            <span>
              {viram.length === n.marcados.length
                ? (n.marcados.length === 1 ? 'Visto' : 'Todos viram')
                : `Visto por ${viram.length} de ${n.marcados.length}`}
            </span>
            <span className={`entrega-seta${quemViu ? ' aberta' : ''}`}><IconChevronRight size={11} /></span>
          </button>
        ) : (
          <span className="mural-so-voce" title="Ninguém foi marcado: o recado fica só no seu mural">Só você vê</span>
        )}
      </div>

      {/* Quem foi marcado, um por linha, com o que leu e quando. */}
      {n.marcados.length > 0 && (
        <div className={`revelar${quemViu ? ' aberto' : ''}`}>
          <div>
            <ul className="mural-quem-viu">
              {n.marcados.map(m => {
                const l = leitura(n, m.id);
                return (
                  <li key={m.id} className={l.estado}>
                    <Avatar nome={m.nome} foto={m.foto} size={18} />
                    <span className="mural-quem-viu-nome">{m.id === eu ? 'Você' : m.nome}</span>
                    {/* O que cada um reagiu, colado no nome. */}
                    {n.reacoes.some(x => x.usuario_id === m.id) && (
                      <span className="mural-quem-viu-reacoes">
                        {REACOES.filter(r => n.reacoes.some(x => x.usuario_id === m.id && x.tipo === r.tipo)).map(r => (
                          <span key={r.tipo} title={r.rotulo} aria-label={r.rotulo}><r.Icone size={12} /></span>
                        ))}
                      </span>
                    )}
                    <span className="mural-quem-viu-estado" title={l.em ? instante(l.em) : undefined}>
                      {l.estado === 'viu' ? `viu ${tempoRelativo(l.em!)}`
                        : l.estado === 'anterior' ? 'viu antes da edição' : 'ainda não viu'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

/** Uma reação dada, com quantos. Passar o ponteiro (ou o foco) abre a dica da
 *  casa com o nome de cada um que reagiu - a do navegador demora, some no
 *  celular e corta lista comprida. */
function ChipDaReacao({ reacao, quem, eu, tab, fotoDe, onReagir }: {
  reacao: (typeof REACOES)[number];
  quem: { usuario_id: string; nome: string }[];
  eu: string | null;
  tab: number;
  fotoDe: (id: string) => string | null;
  onReagir: () => void;
}) {
  const minha = !!eu && quem.some(x => x.usuario_id === eu);
  const { gatilho, dica } = useDicaRica<HTMLButtonElement>(() => (
    <>
      <DicaTopo rotulo={reacao.rotulo} valor={`${quem.length} ${quem.length === 1 ? 'pessoa' : 'pessoas'}`} />
      <ul className="dica-lista mural-dica-quem">
        {quem.map((x, i) => (
          <li key={x.usuario_id} style={{ animationDelay: `${60 + i * 35}ms` }}>
            <Avatar nome={x.nome} foto={fotoDe(x.usuario_id)} size={18} />
            <span className="dica-lista-nome">{x.usuario_id === eu ? 'Você' : x.nome}</span>
          </li>
        ))}
      </ul>
    </>
  ), { largura: 220 });
  const Icone = reacao.Icone;
  return (
    <button type="button" tabIndex={tab} className={`mural-reacao${minha ? ' minha' : ''}`}
      aria-pressed={minha}
      aria-label={`${reacao.rotulo}: ${quem.map(x => (x.usuario_id === eu ? 'você' : x.nome)).join(', ')}`}
      onClick={onReagir} {...gatilho}>
      {dica}
      <Icone size={13} />
      <span>{quem.length}</span>
    </button>
  );
}
