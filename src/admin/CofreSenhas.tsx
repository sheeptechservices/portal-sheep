// ─────────────────────────────────────────────────────────────────────────────
//  Cofre de Senhas.
//
//  Guardar é livre: quem tem a permissão de gravar cadastra uma senha e pronto.
//  Ver é que custa, e custa de propósito - aqui dentro moram senha de servidor e
//  de GitHub, e uma sessão esquecida aberta numa máquina não pode ser a única
//  coisa entre quem senta ali e as senhas todas.
//
//  Para ver, a pessoa pede um código. Ele vai para o e-mail da própria sessão,
//  vale três minutos e serve uma vez. Conferido, o cofre fica aberto por dez
//  minutos e depois tranca sozinho. É uma segunda prova de identidade no canal
//  que a casa já controla: quem tomou a sessão do navegador não tem a caixa de
//  entrada.
//
//  A tela é a da casa: busca e "novo" no canto do cabeçalho, filtros abaixo,
//  tabela embaixo, e a gaveta lateral para cadastrar e para abrir um segredo.
//
//  Duas regras para o que se escrever aqui dentro:
//
//  1. Segredo decifrado nasce escondido e vive o menos possível. Ele é pedido um
//     a um, vive dentro da gaveta que o abriu e some quando ela fecha ou quando
//     o cofre tranca. Nada de guardar a lista aberta em memória.
//  2. Quem diz se pode ver é o servidor, sempre. Esconder botão é cortesia; o
//     porteiro está do outro lado, e é ele quem recusa.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconCheck, IconClipboard, IconEye, IconEyeOff, IconSearch, IconSpinner, IconTrash, IconX,
} from '../components/icons';
import FilterDropdown from '../components/FilterDropdown';
import { useAuth, useToast } from './AdminApp';
import { useApi } from './OportunidadesPage';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

/** O que a prateleira mostra. O conteúdo não vem junto: é pedido por segredo, e
 *  só com o cofre aberto. */
interface Segredo {
  id: string;
  titulo: string;
  categoria: string | null;
  criado_em: string;
  criado_por_nome: string | null;
  atualizado_em: string | null;
  atualizado_por_nome: string | null;
}

interface Conteudo {
  usuario: string;
  senha: string;
  url: string;
  notas: string;
}

const CONTEUDO_VAZIO: Conteudo = { usuario: '', senha: '', url: '', notas: '' };

/** O título de partida do segredo novo, o mesmo da tarefa e do projeto: a gaveta
 *  nasce com ele marcado, e a primeira tecla substitui em vez de escrever
 *  depois. Campo em branco pede que se descubra o que fazer; campo marcado já
 *  diz que é ali que se escreve. */
const TITULO_PADRAO = 'Sem título';

/** Categorias sugeridas. Lista aberta: quem tiver um caso novo escreve. */
const CATEGORIAS = ['Ferramenta', 'GitHub', 'Servidor', 'Banco de dados', 'E-mail', 'Financeiro', 'Outro'];

/** Uma senha forte, para quem não quer inventar. Alfabeto sem os pares que se
 *  leem errado quando alguém dita por telefone: 0/O, 1/l/I. */
const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?-_=+';

function sortearSenha(tamanho = 24): string {
  const n = new Uint32Array(tamanho);
  crypto.getRandomValues(n);
  return Array.from(n, x => ALFABETO[x % ALFABETO.length]).join('');
}

export default function CofreSenhas({ token }: { token: string }) {
  const { toast } = useToast();
  const { pode, usuario } = useAuth();
  const api = useApi(token);

  const [carregando, setCarregando] = useState(true);
  const [segredos, setSegredos] = useState<Segredo[]>([]);
  /** Até quando o cofre está aberto. Vem do servidor, e é ele quem manda. */
  const [abertoAte, setAbertoAte] = useState<string | null>(null);
  const [pedindoCodigo, setPedindoCodigo] = useState(false);
  const [busca, setBusca] = useState('');
  const [fCategoria, setFCategoria] = useState<string[]>([]);
  /** `null` na gaveta quer dizer segredo novo. */
  const [gaveta, setGaveta] = useState<{ segredo: Segredo | null } | null>(null);

  const podeEditar = pode('cofre:editar');
  const podeExcluir = pode('cofre:excluir');
  const aberto = !!abertoAte && Date.parse(abertoAte) > Date.now();

  const carregar = useCallback(async () => {
    const r = await api('?action=cofre');
    if (r?.error) { toast('error', 'Não foi possível abrir o cofre', r.error); setCarregando(false); return; }
    setSegredos(r?.segredos ?? []);
    setAbertoAte(r?.liberado_ate ?? null);
    setCarregando(false);
  }, [api, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  // O cofre tranca sozinho na hora marcada pelo servidor. O relógio daqui só
  // acompanha: quem decide é o `liberado_ate`, conferido a cada leitura.
  useEffect(() => {
    if (!abertoAte) return;
    const falta = Date.parse(abertoAte) - Date.now();
    if (falta <= 0) { setAbertoAte(null); return; }
    const t = setTimeout(() => {
      setAbertoAte(null);
      toast('info', 'O cofre trancou', 'Peça um código novo para ver as senhas de novo.');
    }, falta);
    return () => clearTimeout(t);
  }, [abertoAte, toast]);

  const categorias = useMemo(
    () => [...new Set(segredos.map(s => s.categoria).filter((c): c is string => !!c))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(c => ({ value: c, label: c })),
    [segredos],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    return segredos.filter(s =>
      (fCategoria.length === 0 || fCategoria.includes(s.categoria ?? ''))
      && (!q || s.titulo.toLocaleLowerCase('pt-BR').includes(q)
        || (s.categoria ?? '').toLocaleLowerCase('pt-BR').includes(q)));
  }, [segredos, busca, fCategoria]);

  /** Copia a senha sem pintá-la na tela. O conteúdo vem, vai para a área de
   *  transferência e não fica em estado nenhum. */
  async function copiarSenha(s: Segredo) {
    if (!aberto) { setPedindoCodigo(true); return; }
    const r = await api('', 'POST', { action: 'cofre_revelar', id: s.id });
    if (r?.error) {
      if (r.trancado) { setAbertoAte(null); setPedindoCodigo(true); return; }
      toast('error', 'Não foi possível ler este segredo', r.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(String(r.conteudo?.senha ?? ''));
      toast('success', 'Senha copiada', `De "${s.titulo}". Está na área de transferência.`);
    } catch {
      toast('error', 'O navegador não deixou copiar', 'Abra o segredo e copie à mão.');
    }
  }

  return (
    <div className="admin-content-wrap">
      <style>{ESTILO}</style>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Cofre de Senhas</h1>
          <p className="admin-page-desc">
            Cadastrar é livre. Para ver uma senha, o portal manda um código ao seu e-mail.
          </p>
        </div>
        <div className="admin-page-acoes">
          <span className="secao-busca-campo cofre-busca">
            <IconSearch size={13} />
            <input value={busca} aria-label="Buscar segredo"
              placeholder="Buscar por título ou categoria"
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setBusca(''); }} />
            {busca && (
              <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
                <IconX size={12} />
              </button>
            )}
          </span>
          {podeEditar && (
            <button type="button" className="btn btn-primary"
              style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
              onClick={() => setGaveta({ segredo: null })}>
              + Novo segredo
            </button>
          )}
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filtrar</span>
        <FilterDropdown label="Categoria" values={fCategoria} options={categorias}
          onChange={setFCategoria} />
        {fCategoria.length > 0 && (
          <button type="button" className="cofre-limpar" onClick={() => setFCategoria([])}>Limpar</button>
        )}
        <div className="admin-toolbar-spacer" />
        {aberto ? (
          <span className="cofre-aberto-ate">
            <span className="cofre-ponto" />
            Aberto até {hora(abertoAte)}
            <button type="button" className="cofre-limpar" onClick={() => setAbertoAte(null)}>
              Trancar agora
            </button>
          </span>
        ) : (
          <button type="button" className="btn btn-secondary cofre-abrir"
            onClick={() => setPedindoCodigo(true)}>
            <IconEye size={13} /> Ver as senhas
          </button>
        )}
      </div>

      {carregando ? (
        <div className="dux-spinner-row" style={{ padding: '40px 0' }}>
          <span className="dux-spinner sm" />
        </div>
      ) : lista.length === 0 ? (
        <p className="cofre-vazio">
          {segredos.length === 0
            ? 'O cofre está vazio. O primeiro segredo entra pelo botão acima.'
            : 'Nada com esse texto no título nem na categoria.'}
        </p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Título</th>
                <th>Categoria</th>
                <th style={{ whiteSpace: 'nowrap' }}>Última mudança</th>
                <th style={{ width: 90 }}>Senha</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(s => (
                <tr key={s.id} className="cofre-linha" onClick={() => setGaveta({ segredo: s })}
                  title={`Abrir ${s.titulo}`}>
                  <td style={{ fontWeight: 600, color: 'var(--black)' }}>{s.titulo}</td>
                  <td>{s.categoria
                    ? <span className="cofre-etiqueta">{s.categoria}</span>
                    : <span style={{ color: 'var(--gray2)' }}>-</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray2)', whiteSpace: 'nowrap' }}>
                    {s.atualizado_em
                      ? `${dia(s.atualizado_em)} · ${s.atualizado_por_nome ?? 'alguém'}`
                      : `${dia(s.criado_em)} · ${s.criado_por_nome ?? 'alguém'}`}
                  </td>
                  <td>
                    {/* Copiar sem mostrar: o valor vai para a area de
                        transferência e não passa pela tela. */}
                    <button type="button" className="admin-toolbar-btn"
                      title={aberto ? 'Copiar a senha' : 'Pedir o código para copiar'}
                      aria-label={`Copiar a senha de ${s.titulo}`}
                      onClick={e => { e.stopPropagation(); void copiarSenha(s); }}>
                      <IconClipboard size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pedindoCodigo && (
        <PopupDoCodigo
          token={token}
          email={usuario?.email ?? ''}
          onFechar={() => setPedindoCodigo(false)}
          onAberto={ate => { setAbertoAte(ate); setPedindoCodigo(false); }} />
      )}

      {gaveta && (
        <GavetaDoSegredo
          token={token}
          segredo={gaveta.segredo}
          cofreAberto={aberto}
          podeEditar={podeEditar}
          podeExcluir={podeExcluir}
          onTrancou={() => setAbertoAte(null)}
          onPedirCodigo={() => setPedindoCodigo(true)}
          onFechar={() => setGaveta(null)}
          onExcluido={id => {
            setSegredos(l => l.filter(x => x.id !== id));
            setGaveta(null);
          }}
          onGravado={s => {
            setSegredos(l => (l.some(x => x.id === s.id)
              ? l.map(x => (x.id === s.id ? s : x))
              : [...l, s].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))));
            setGaveta(null);
          }} />
      )}
    </div>
  );
}

// ── O código que chega por e-mail ───────────────────────────────────────────

/**
 * O popup que pede o código.
 *
 * Ele mesmo dispara o envio ao abrir: quem clicou em "Ver as senhas" já pediu, e
 * exigir um segundo clique para o e-mail sair acrescentaria uma etapa sem
 * acrescentar decisão.
 *
 * O relógio na tela é cortesia. Quem recusa um código vencido é o servidor, que
 * compara com o próprio relógio - o do navegador pode estar errado, e um cofre
 * que confia no relógio do cliente não é um cofre.
 */
function PopupDoCodigo({ token, email, onFechar, onAberto }: {
  token: string;
  email: string;
  onFechar: () => void;
  onAberto: (ate: string) => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  const [enviando, setEnviando] = useState(true);
  const [expiraEm, setExpiraEm] = useState<string | null>(null);
  const [falta, setFalta] = useState(0);
  const [codigo, setCodigo] = useState('');
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vencido, setVencido] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const jaPediu = useRef(false);

  const pedir = useCallback(async () => {
    setEnviando(true);
    setErro(null);
    setVencido(false);
    setCodigo('');
    const r = await api('', 'POST', { action: 'cofre_enviar_token' });
    setEnviando(false);
    if (r?.error) { setErro(r.error); return; }
    setExpiraEm(r.expira_em ?? null);
    campo.current?.focus();
  }, [api]);

  useEffect(() => {
    if (jaPediu.current) return;
    jaPediu.current = true;
    void pedir();
  }, [pedir]);

  // A contagem regressiva. Chegando a zero o campo continua ali: quem digitar
  // recebe do servidor a recusa que vale, e o botão de pedir outro fica à mão.
  useEffect(() => {
    if (!expiraEm) return;
    const tique = () => {
      const s = Math.max(0, Math.round((Date.parse(expiraEm) - Date.now()) / 1000));
      setFalta(s);
      if (s === 0) setVencido(true);
    };
    tique();
    const t = setInterval(tique, 1000);
    return () => clearInterval(t);
  }, [expiraEm]);

  async function conferir() {
    if (codigo.length < 6 || conferindo) return;
    setConferindo(true);
    setErro(null);
    const r = await api('', 'POST', { action: 'cofre_abrir', codigo });
    setConferindo(false);
    if (r?.error) {
      setErro(r.error);
      if (r.vencido) setVencido(true);
      setCodigo('');
      campo.current?.focus();
      return;
    }
    toast('success', 'Cofre aberto', 'As senhas ficam à mão pelos próximos minutos.');
    onAberto(r.liberado_ate);
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10060, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="cofre-popup" role="dialog" aria-modal="true"
        aria-label="Código para abrir o cofre" onClick={e => e.stopPropagation()}>
        <p className="cofre-secao">Abrir o cofre</p>

        {enviando ? (
          <div className="dux-spinner-row" style={{ padding: '24px 0' }}>
            <span className="dux-spinner sm" />
          </div>
        ) : (
          <>
            <p className="cofre-dica">
              Mandamos um código de seis dígitos para <b>{email}</b>. Ele vale três minutos e serve
              uma vez.
            </p>

            <label className="cofre-campo" style={{ marginTop: 14 }}>
              <span className="form-label">Código</span>
              <input ref={campo} className="form-input cofre-codigo" value={codigo}
                inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6}
                placeholder="000000"
                onChange={e => { setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6)); setErro(null); }}
                onKeyDown={e => { if (e.key === 'Enter') void conferir(); }} />
              {erro
                ? <span className="cofre-dica erro">{erro}</span>
                : vencido
                  ? <span className="cofre-dica erro">O código venceu. Peça outro.</span>
                  : <span className="cofre-dica">Vence em {mmss(falta)}.</span>}
            </label>

            <div className="cofre-popup-pe">
              <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
              <button type="button" className="modal-acao" onClick={() => void pedir()}>
                Reenviar código
              </button>
              <button type="button" className="btn btn-primary"
                disabled={codigo.length < 6 || conferindo} onClick={() => void conferir()}>
                {conferindo ? <><IconSpinner size={13} /> Conferindo</> : 'Abrir o cofre'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── A gaveta ────────────────────────────────────────────────────────────────

/**
 * A gaveta serve os dois momentos: cadastrar um segredo novo e abrir um que já
 * existe. É a mesma peça porque é a mesma ficha - o que muda é se ela chega
 * vazia ou preenchida.
 *
 * Cadastrar é livre. Abrir um que já existe pede o cofre destrancado, e o
 * motivo é o mesmo de sempre: para editar é preciso ver o que está lá.
 */
function GavetaDoSegredo({
  token, segredo, cofreAberto, podeEditar, podeExcluir,
  onTrancou, onPedirCodigo, onFechar, onExcluido, onGravado,
}: {
  token: string;
  segredo: Segredo | null;
  cofreAberto: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  onTrancou: () => void;
  onPedirCodigo: () => void;
  onFechar: () => void;
  onExcluido: (id: string) => void;
  onGravado: (s: Segredo) => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  const [titulo, setTitulo] = useState(segredo?.titulo ?? TITULO_PADRAO);
  const [categoria, setCategoria] = useState(segredo?.categoria ?? '');
  const [c, setC] = useState<Conteudo>(CONTEUDO_VAZIO);
  const [aberto, setAberto] = useState(!segredo);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrando, setMostrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const jaPediu = useRef(false);

  const revelar = useCallback(async () => {
    if (!segredo || buscando) return;
    if (!cofreAberto) { onPedirCodigo(); return; }
    setBuscando(true);
    const r = await api('', 'POST', { action: 'cofre_revelar', id: segredo.id });
    setBuscando(false);
    if (r?.error) {
      if (r.trancado) { onTrancou(); onPedirCodigo(); return; }
      toast('error', 'Não foi possível abrir este segredo', r.error);
      return;
    }
    setC(r.conteudo);
    setAberto(true);
  }, [segredo, cofreAberto, buscando, api, toast, onPedirCodigo, onTrancou]);

  // Com o cofre já destrancado, a gaveta abre o segredo sozinha: quem clicou na
  // linha quer ver o que tem dentro, e um segundo clique seria pedágio.
  useEffect(() => {
    if (!segredo || jaPediu.current || !cofreAberto) return;
    jaPediu.current = true;
    void revelar();
  }, [segredo, cofreAberto, revelar]);

  // Trancou com a gaveta aberta: o que estava na tela sai junto.
  useEffect(() => {
    if (segredo && !cofreAberto) { setAberto(false); setC(CONTEUDO_VAZIO); setMostrando(false); }
  }, [segredo, cofreAberto]);

  async function copiar(valor: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(valor);
      toast('success', `${oQue} copiado`, 'Está na área de transferência.');
    } catch {
      toast('error', 'O navegador não deixou copiar', 'Selecione o texto e copie à mão.');
    }
  }

  async function salvar() {
    if (!titulo.trim() || titulo === TITULO_PADRAO || salvando) return;
    setSalvando(true);
    // O `finally` não é zelo: sem ele, um pedido que estoura - rede caída,
    // resposta que não é JSON - deixa o botão desabilitado para sempre, e a
    // gaveta vira uma tela onde não dá para fazer nada nem entender por quê.
    try {
      const r = await api('', 'POST', {
        action: 'salvar_segredo',
        id: segredo?.id, titulo: titulo.trim(), categoria: categoria.trim() || null, conteudo: c,
      });
      // Sem `id` de volta não houve gravação, mesmo sem mensagem de erro: é o
      // que acontece quando a sessão caiu no meio do caminho.
      if (r?.error || !r?.id) {
        toast('error', 'Não foi possível gravar',
          r?.error ?? 'O servidor não confirmou a gravação. Tente de novo.');
        return;
      }
      onGravado({
        id: r.id,
        titulo: titulo.trim(),
        categoria: categoria.trim() || null,
        criado_em: segredo?.criado_em ?? r.criado_em,
        criado_por_nome: segredo?.criado_por_nome ?? r.criado_por_nome ?? null,
        atualizado_em: segredo ? r.atualizado_em : null,
        atualizado_por_nome: segredo ? r.atualizado_por_nome ?? null : null,
      });
      toast('success', segredo ? 'Segredo atualizado' : 'Segredo guardado');
    } catch {
      toast('error', 'Não foi possível gravar', 'O pedido não chegou ao servidor.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!segredo) return;
    setConfirmando(false);
    const r = await api('', 'POST', { action: 'excluir_segredo', id: segredo.id });
    if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
    onExcluido(segredo.id);
    toast('success', 'Segredo excluído');
  }

  const somenteLeitura = !podeEditar;

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10040 }} {...fundo}>
      <div className="admin-modal painel-tarefa" style={{ width: 'min(460px, 96vw)' }}
        onClick={e => e.stopPropagation()}>

        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">
              {segredo ? 'Segredo' : 'Novo segredo'}
            </p>
            <input className="painel-titulo painel-titulo-campo" value={titulo} disabled={somenteLeitura}
              autoFocus={titulo === TITULO_PADRAO}
              onFocus={e => { if (e.target.value === TITULO_PADRAO) e.target.select(); }}
              placeholder="GitHub da conta assinaturas"
              aria-label="Título do segredo"
              title={titulo}
              onChange={e => setTitulo(e.target.value)} />
          </div>
          <button type="button" className="rodape-icone" onClick={fechar}
            title="Fechar" aria-label="Fechar">
            <IconX size={14} />
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <input className="form-input" value={categoria} list="cofre-categorias"
              disabled={somenteLeitura} placeholder="Ferramenta"
              onChange={e => setCategoria(e.target.value)} />
            <datalist id="cofre-categorias">
              {CATEGORIAS.map(x => <option key={x} value={x} />)}
            </datalist>
            <p className="cofre-dica" style={{ marginTop: 4 }}>
              Título e categoria ficam legíveis na lista mesmo com o cofre trancado. É o que a
              busca alcança, então não escreva a senha aí.
            </p>
          </div>

          {/* Segredo que já existe e cofre trancado: a ficha fica fechada, e a
              porta de saída é pedir o código. */}
          {segredo && !aberto ? (
            <div className="cofre-trancado">
              {buscando ? (
                <div className="dux-spinner-row" style={{ padding: '20px 0' }}>
                  <span className="dux-spinner sm" />
                </div>
              ) : (
                <>
                  <p className="cofre-dica" style={{ marginBottom: 10 }}>
                    O conteúdo deste segredo está guardado. Para vê-lo, o portal manda um código
                    ao seu e-mail.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => void revelar()}>
                    <IconEye size={14} /> Ver o conteúdo
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Usuário</label>
                <span className="cofre-linha-campo">
                  <input className="form-input" value={c.usuario} autoComplete="off"
                    disabled={somenteLeitura}
                    onChange={e => setC({ ...c, usuario: e.target.value })} />
                  {c.usuario && (
                    <button type="button" className="rodape-icone" aria-label="Copiar o usuário"
                      title="Copiar" onClick={() => void copiar(c.usuario, 'Usuário')}>
                      <IconClipboard size={13} />
                    </button>
                  )}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Senha</label>
                <span className="cofre-linha-campo">
                  <input className="form-input cofre-mono" value={c.senha}
                    type={mostrando ? 'text' : 'password'} autoComplete="new-password"
                    disabled={somenteLeitura}
                    onChange={e => setC({ ...c, senha: e.target.value })} />
                  <button type="button" className="rodape-icone"
                    aria-label={mostrando ? 'Esconder a senha' : 'Ver a senha'}
                    title={mostrando ? 'Esconder' : 'Ver'}
                    onClick={() => setMostrando(v => !v)}>
                    {mostrando ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                  </button>
                  {c.senha && (
                    <button type="button" className="rodape-icone" aria-label="Copiar a senha"
                      title="Copiar" onClick={() => void copiar(c.senha, 'Senha')}>
                      <IconClipboard size={13} />
                    </button>
                  )}
                </span>
                {!somenteLeitura && (
                  <button type="button" className="entrega-anexar" style={{ marginTop: 6 }}
                    onClick={() => { setC({ ...c, senha: sortearSenha() }); setMostrando(true); }}>
                    Sortear uma senha forte
                  </button>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Endereço</label>
                <span className="cofre-linha-campo">
                  <input className="form-input" value={c.url} autoComplete="off"
                    disabled={somenteLeitura} placeholder="https://"
                    onChange={e => setC({ ...c, url: e.target.value })} />
                  {c.url && (
                    <button type="button" className="rodape-icone" aria-label="Copiar o endereço"
                      title="Copiar" onClick={() => void copiar(c.url, 'Endereço')}>
                      <IconClipboard size={13} />
                    </button>
                  )}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3} value={c.notas} disabled={somenteLeitura}
                  style={{ resize: 'vertical' }}
                  onChange={e => setC({ ...c, notas: e.target.value })}
                  placeholder="Onde essa conta é usada, quem mais a usa, o que quebra se ela mudar." />
              </div>
            </>
          )}

          {segredo && (
            <p className="cofre-rodape-info">
              {segredo.atualizado_em
                ? `Atualizado por ${segredo.atualizado_por_nome ?? 'alguém'} em ${dia(segredo.atualizado_em)}`
                : `Criado por ${segredo.criado_por_nome ?? 'alguém'} em ${dia(segredo.criado_em)}`}
            </p>
          )}
        </div>

        <div className="painel-rodape">
          {segredo && podeExcluir && (
            <div className="painel-rodape-lado">
              <button type="button" className="rodape-icone perigo" onClick={() => setConfirmando(true)}
                title="Excluir segredo" aria-label={`Excluir ${segredo.titulo}`}>
                <IconTrash size={14} />
              </button>
            </div>
          )}
          <button type="button" className="modal-acao" onClick={fechar}>Fechar</button>
          {!somenteLeitura && (!segredo || aberto) && (
            <button type="button" className="btn btn-primary"
              disabled={!titulo.trim() || titulo === TITULO_PADRAO || salvando}
              title={titulo === TITULO_PADRAO ? 'Dê um nome ao segredo antes de guardar' : undefined}
              onClick={() => void salvar()}>
              {salvando ? <><IconSpinner size={13} /> Gravando</> : <><IconCheck size={14} /> Guardar</>}
            </button>
          )}
        </div>

        {confirmando && segredo && (
          <div className="cofre-confirma surge">
            <span>Excluir <b>{segredo.titulo}</b>? Não há como recuperar.</span>
            <button type="button" className="modal-acao" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button type="button" className="modal-acao-primaria cofre-excluir"
              onClick={() => void excluir()}>
              Excluir
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function dia(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('pt-BR');
}

function hora(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const ESTILO = `
  .cofre-busca { width: 260px; max-width: 40vw; }
  .cofre-vazio { font-size: 13px; color: var(--gray2); margin-top: 18px; }
  .cofre-dica { font-size: 11px; color: var(--gray2); line-height: 1.45; margin: 0; }
  .cofre-dica.erro { color: var(--red); }
  .cofre-campo { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .cofre-secao {
    font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
    color: var(--gray2); margin: 0 0 12px;
  }
  .cofre-limpar {
    background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
    font-size: 11px; font-weight: 600; color: var(--gray2);
    transition: color var(--transition);
  }
  .cofre-limpar:hover { color: var(--black); }

  .cofre-aberto-ate {
    display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;
    font-size: 11.5px; font-weight: 700; color: var(--gray);
  }
  .cofre-ponto { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }

  /* Botão de texto, e não o .admin-toolbar-btn: aquele é um quadrado de 34px
     feito para ícone sozinho, e o rótulo vazava para fora dele. Aqui fica na
     altura do filtro ao lado, que é o que alinha a linha inteira. */
  .cofre-abrir {
    height: 32px; padding: 0 14px; font-size: 12px;
    display: inline-flex; align-items: center; gap: 6px;
    white-space: nowrap; flex-shrink: 0;
  }
  .cofre-linha { cursor: pointer; }
  .cofre-etiqueta {
    display: inline-block; font-size: 10px; font-weight: 700;
    color: var(--gray2); background: var(--gray4);
    padding: 2px 8px; border-radius: var(--radius-pill);
  }

  /* O popup do código é o único diálogo centrado da tela: ele interrompe, e
     gaveta que desliza da borda leria como "mais uma ficha". */
  .cofre-popup {
    background: var(--white); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card-hover); padding: 22px; width: min(420px, 92vw);
  }
  .cofre-codigo {
    font-size: 22px; font-weight: 700; letter-spacing: 8px; text-align: center;
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .cofre-popup-pe {
    display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-top: 18px;
  }
  .cofre-popup-pe .btn { display: inline-flex; align-items: center; gap: 7px; }

  .cofre-linha-campo { display: flex; align-items: center; gap: 6px; }
  .cofre-linha-campo .form-input { flex: 1; min-width: 0; }
  .cofre-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .cofre-trancado {
    padding: 16px; border: 1px dashed var(--gray3); border-radius: var(--radius-md);
    background: var(--bg); text-align: center;
  }
  .cofre-trancado .btn { display: inline-flex; align-items: center; gap: 7px; }
  .cofre-rodape-info { margin: 4px 0 0; font-size: 10.5px; color: var(--gray2); }
  /* O unico botao vermelho da tela, e so no momento de confirmar. */
  .cofre-excluir { background: var(--red); border-color: var(--red); }
  .cofre-confirma {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin: 0 24px 16px; padding: 10px 12px;
    border: 1px solid var(--red); border-radius: var(--radius-md);
    font-size: 11.5px; color: var(--gray); background: var(--white);
  }
`;
