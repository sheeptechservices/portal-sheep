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
//  Duas regras para o que se escrever aqui dentro:
//
//  1. Segredo decifrado nasce escondido e vive o menos possível. Ele é pedido um
//     a um, fica no estado de um card só e some quando o card fecha ou o cofre
//     tranca. Nada de guardar a lista aberta em memória.
//  2. Quem diz se pode ver é o servidor, sempre. Esconder botão é cortesia; o
//     porteiro está do outro lado, e é ele quem recusa.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconCheck, IconClipboard, IconEye, IconEyeOff, IconPlus, IconSpinner, IconTrash,
} from '../components/icons';
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
  const [editando, setEditando] = useState<{ id: string | null } | null>(null);

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q) return segredos;
    return segredos.filter(s =>
      s.titulo.toLocaleLowerCase('pt-BR').includes(q)
      || (s.categoria ?? '').toLocaleLowerCase('pt-BR').includes(q));
  }, [segredos, busca]);

  if (carregando) {
    return (
      <div className="admin-content-wrap">
        <Cabecalho />
        <div className="dux-spinner-row" style={{ padding: '40px 0' }}>
          <span className="dux-spinner sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content-wrap">
      <style>{ESTILO}</style>
      <Cabecalho aberto={aberto} ate={abertoAte} onTrancar={() => setAbertoAte(null)} />

      <div className="cofre-barra">
        <input className="form-input cofre-busca" value={busca} placeholder="Buscar por título ou categoria"
          onChange={e => setBusca(e.target.value)} />
        {!aberto && (
          <button type="button" className="btn btn-primary" onClick={() => setPedindoCodigo(true)}>
            Ver as senhas
          </button>
        )}
        {podeEditar && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditando({ id: null })}>
            <IconPlus size={14} /> Novo segredo
          </button>
        )}
      </div>

      {!aberto && (
        <p className="cofre-dica cofre-trancado">
          O cofre está trancado. Cadastrar é livre; para ver uma senha, o portal manda um código
          para {usuario?.email ?? 'o e-mail da sua sessão'}.
        </p>
      )}

      {filtrados.length === 0 ? (
        <p className="cofre-vazio">
          {segredos.length === 0
            ? 'O cofre está vazio. O primeiro segredo entra pelo botão acima.'
            : 'Nada com esse texto no título nem na categoria.'}
        </p>
      ) : (
        <div className="cofre-lista lista-anima" key={filtrados.map(s => s.id).join('|')}>
          {filtrados.map(s => (
            <CardDoSegredo key={s.id} token={token} s={s} aberto={aberto}
              podeEditar={podeEditar} podeExcluir={podeExcluir}
              onTrancou={() => setAbertoAte(null)}
              onPedirCodigo={() => setPedindoCodigo(true)}
              onEditar={() => setEditando({ id: s.id })}
              onExcluido={() => setSegredos(l => l.filter(x => x.id !== s.id))} />
          ))}
        </div>
      )}

      {pedindoCodigo && (
        <PopupDoCodigo
          token={token}
          email={usuario?.email ?? ''}
          onFechar={() => setPedindoCodigo(false)}
          onAberto={ate => { setAbertoAte(ate); setPedindoCodigo(false); }} />
      )}

      {editando && (
        <EditorDeSegredo
          token={token}
          segredo={editando.id ? segredos.find(s => s.id === editando.id) ?? null : null}
          cofreAberto={aberto}
          onTrancou={() => setAbertoAte(null)}
          onFechar={() => setEditando(null)}
          onGravado={s => {
            setSegredos(l => (l.some(x => x.id === s.id)
              ? l.map(x => (x.id === s.id ? s : x))
              : [...l, s].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))));
            setEditando(null);
          }} />
      )}
    </div>
  );
}

function Cabecalho({ aberto, ate, onTrancar }: {
  aberto?: boolean;
  ate?: string | null;
  onTrancar?: () => void;
}) {
  return (
    <div className="admin-page-header">
      <div>
        <h1 className="admin-page-title">Cofre de Senhas</h1>
        <p className="admin-page-desc">
          Cadastrar é livre. Para ver uma senha, o portal manda um código ao seu e-mail.
        </p>
      </div>
      {aberto && (
        <span className="cofre-aberto-ate">
          <span className="cofre-ponto" />
          Aberto até {hora(ate)}
          <button type="button" className="cofre-acao" onClick={onTrancar}>Trancar agora</button>
        </span>
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

  return (
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <div className="admin-modal cofre-popup" role="dialog" aria-modal="true"
        aria-label="Código para abrir o cofre">
        <p className="cofre-porta-titulo">Abrir o cofre</p>

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

            <label className="cofre-campo" style={{ marginTop: 12 }}>
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
              <button type="button" className="cofre-acao" onClick={fechar}>Cancelar</button>
              <button type="button" className="cofre-acao" onClick={() => void pedir()}>
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
    </div>
  );
}

// ── Um segredo ──────────────────────────────────────────────────────────────

function CardDoSegredo({ token, s, aberto, podeEditar, podeExcluir, onTrancou, onPedirCodigo, onEditar, onExcluido }: {
  token: string;
  s: Segredo;
  aberto: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
  onTrancou: () => void;
  onPedirCodigo: () => void;
  onEditar: () => void;
  onExcluido: () => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const [conteudo, setConteudo] = useState<Conteudo | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [mostrandoSenha, setMostrandoSenha] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // Trancou: o que estava aberto na tela fecha junto. Deixar o texto ali depois
  // de o cofre trancar seria trancar a porta com a janela aberta.
  useEffect(() => {
    if (!aberto) { setConteudo(null); setMostrandoSenha(false); }
  }, [aberto]);

  async function abrir() {
    if (conteudo) { setConteudo(null); setMostrandoSenha(false); return; }
    if (!aberto) { onPedirCodigo(); return; }
    setBuscando(true);
    const r = await api('', 'POST', { action: 'cofre_revelar', id: s.id });
    setBuscando(false);
    if (r?.error) {
      if (r.trancado) { onTrancou(); onPedirCodigo(); return; }
      toast('error', 'Não foi possível ler este segredo', r.error);
      return;
    }
    setConteudo(r.conteudo);
  }

  async function copiar(valor: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(valor);
      toast('success', `${oQue} copiado`, 'Está na área de transferência.');
    } catch {
      toast('error', 'O navegador não deixou copiar', 'Selecione o texto e copie à mão.');
    }
  }

  async function excluir() {
    setConfirmando(false);
    const r = await api('', 'POST', { action: 'excluir_segredo', id: s.id });
    if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
    onExcluido();
    toast('success', 'Segredo excluído');
  }

  return (
    <div className="cofre-card">
      <div className="cofre-card-topo">
        <div className="cofre-card-nome">
          <p className="cofre-card-titulo">{s.titulo}</p>
          {s.categoria && <span className="cofre-etiqueta">{s.categoria}</span>}
        </div>
        <button type="button" className="cofre-acao" onClick={() => void abrir()} disabled={buscando}
          title={conteudo ? 'Esconder' : aberto ? 'Mostrar' : 'Pedir o código para ver'}
          aria-label={conteudo ? `Esconder ${s.titulo}` : `Mostrar ${s.titulo}`}>
          {buscando
            ? <IconSpinner size={14} />
            : conteudo ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
        {podeEditar && (
          <button type="button" className="cofre-acao" onClick={onEditar} title="Editar">Editar</button>
        )}
        {podeExcluir && (
          <button type="button" className="cofre-acao perigo" onClick={() => setConfirmando(true)}
            title="Excluir" aria-label={`Excluir ${s.titulo}`}>
            <IconTrash size={13} />
          </button>
        )}
      </div>

      {conteudo && (
        <div className="cofre-corpo surge">
          <Linha rotulo="Usuário" valor={conteudo.usuario} onCopiar={() => void copiar(conteudo.usuario, 'Usuário')} />
          <div className="cofre-linha">
            <span className="cofre-rotulo">Senha</span>
            <span className="cofre-valor mono">
              {mostrandoSenha ? conteudo.senha : '•'.repeat(Math.min(conteudo.senha.length, 24))}
            </span>
            <button type="button" className="cofre-acao" onClick={() => setMostrandoSenha(v => !v)}
              aria-label={mostrandoSenha ? 'Esconder a senha' : 'Ver a senha'}>
              {mostrandoSenha ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </button>
            <button type="button" className="cofre-acao" onClick={() => void copiar(conteudo.senha, 'Senha')}
              aria-label="Copiar a senha">
              <IconClipboard size={14} />
            </button>
          </div>
          {conteudo.url && <Linha rotulo="Endereço" valor={conteudo.url} onCopiar={() => void copiar(conteudo.url, 'Endereço')} />}
          {conteudo.notas && (
            <div className="cofre-linha">
              <span className="cofre-rotulo">Notas</span>
              <span className="cofre-valor cofre-notas">{conteudo.notas}</span>
            </div>
          )}
        </div>
      )}

      <p className="cofre-rodape">
        {s.atualizado_em
          ? `Atualizado por ${s.atualizado_por_nome ?? 'alguém'} em ${dia(s.atualizado_em)}`
          : `Criado por ${s.criado_por_nome ?? 'alguém'} em ${dia(s.criado_em)}`}
      </p>

      {confirmando && (
        <div className="cofre-confirma surge">
          <span>Excluir <b>{s.titulo}</b>? Não há como recuperar.</span>
          <button type="button" className="cofre-acao" onClick={() => setConfirmando(false)}>Cancelar</button>
          <button type="button" className="cofre-acao perigo" onClick={() => void excluir()}>Excluir</button>
        </div>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, onCopiar }: { rotulo: string; valor: string; onCopiar: () => void }) {
  if (!valor) return null;
  return (
    <div className="cofre-linha">
      <span className="cofre-rotulo">{rotulo}</span>
      <span className="cofre-valor">{valor}</span>
      <button type="button" className="cofre-acao" onClick={onCopiar} aria-label={`Copiar ${rotulo}`}>
        <IconClipboard size={14} />
      </button>
    </div>
  );
}

// ── Editor ──────────────────────────────────────────────────────────────────

/**
 * Cadastrar é livre; editar um segredo que já existe pede o cofre aberto, e o
 * motivo é o mesmo de sempre: para editar é preciso ver o que está lá.
 */
function EditorDeSegredo({ token, segredo, cofreAberto, onTrancou, onFechar, onGravado }: {
  token: string;
  segredo: Segredo | null;
  cofreAberto: boolean;
  onTrancou: () => void;
  onFechar: () => void;
  onGravado: (s: Segredo) => void;
}) {
  const { toast } = useToast();
  const api = useApi(token);
  const [titulo, setTitulo] = useState(segredo?.titulo ?? '');
  const [categoria, setCategoria] = useState(segredo?.categoria ?? '');
  const [c, setC] = useState<Conteudo>(CONTEUDO_VAZIO);
  const [pronto, setPronto] = useState(!segredo);
  const [salvando, setSalvando] = useState(false);
  const [mostrando, setMostrando] = useState(false);
  const carregou = useRef(false);

  useEffect(() => {
    if (!segredo || carregou.current) return;
    carregou.current = true;
    if (!cofreAberto) {
      toast('error', 'O cofre está trancado', 'Peça o código para editar um segredo que já existe.');
      onFechar();
      return;
    }
    void (async () => {
      const r = await api('', 'POST', { action: 'cofre_revelar', id: segredo.id });
      if (r?.error) {
        if (r.trancado) onTrancou();
        toast('error', 'Não foi possível abrir este segredo', r.error);
        onFechar();
        return;
      }
      setC(r.conteudo);
      setPronto(true);
    })();
  }, [segredo, cofreAberto, api, toast, onFechar, onTrancou]);

  async function salvar() {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    const r = await api('', 'POST', {
      action: 'salvar_segredo',
      id: segredo?.id, titulo: titulo.trim(), categoria: categoria.trim() || null, conteudo: c,
    });
    if (r?.error) { toast('error', 'Não foi possível gravar', r.error); setSalvando(false); return; }
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
  }

  return (
    <div className="cofre-editor surge">
      <p className="cofre-porta-titulo">{segredo ? 'Editar segredo' : 'Novo segredo'}</p>
      {!pronto ? (
        <div className="dux-spinner-row" style={{ padding: '24px 0' }}>
          <span className="dux-spinner sm" />
        </div>
      ) : (
        <>
          <div className="cofre-grade">
            <label className="cofre-campo">
              <span className="form-label">Título</span>
              <input className="form-input" value={titulo} onChange={e => setTitulo(e.target.value)}
                placeholder="GitHub da conta assinaturas" />
              <span className="cofre-dica">
                Fica legível na lista, junto com a categoria, mesmo com o cofre trancado. É o que a
                busca alcança, então não escreva a senha aqui.
              </span>
            </label>
            <label className="cofre-campo">
              <span className="form-label">Categoria</span>
              <input className="form-input" value={categoria} list="cofre-categorias"
                onChange={e => setCategoria(e.target.value)} placeholder="Ferramenta" />
              <datalist id="cofre-categorias">
                {CATEGORIAS.map(x => <option key={x} value={x} />)}
              </datalist>
            </label>
            <label className="cofre-campo">
              <span className="form-label">Usuário</span>
              <input className="form-input" value={c.usuario} autoComplete="off"
                onChange={e => setC({ ...c, usuario: e.target.value })} />
            </label>
            <label className="cofre-campo">
              <span className="form-label">Endereço</span>
              <input className="form-input" value={c.url} autoComplete="off"
                onChange={e => setC({ ...c, url: e.target.value })} placeholder="https://" />
            </label>
          </div>

          <label className="cofre-campo">
            <span className="form-label">Senha</span>
            <span className="cofre-senha-linha">
              <input className="form-input mono" type={mostrando ? 'text' : 'password'} value={c.senha}
                autoComplete="new-password" onChange={e => setC({ ...c, senha: e.target.value })} />
              <button type="button" className="cofre-acao" onClick={() => setMostrando(v => !v)}
                aria-label={mostrando ? 'Esconder a senha' : 'Ver a senha'}>
                {mostrando ? <IconEyeOff size={14} /> : <IconEye size={14} />}
              </button>
              <button type="button" className="cofre-acao"
                onClick={() => { setC({ ...c, senha: sortearSenha() }); setMostrando(true); }}>
                Sortear
              </button>
            </span>
          </label>

          <label className="cofre-campo">
            <span className="form-label">Notas</span>
            <textarea className="form-input" rows={3} value={c.notas} style={{ resize: 'vertical' }}
              onChange={e => setC({ ...c, notas: e.target.value })}
              placeholder="Onde essa conta é usada, quem mais a usa, o que quebra se ela mudar." />
          </label>

          <div className="cofre-editor-pe">
            <button type="button" className="cofre-acao" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={!titulo.trim() || salvando}
              onClick={() => void salvar()}>
              {salvando ? <><IconSpinner size={13} /> Gravando</> : <><IconCheck size={14} /> Guardar</>}
            </button>
          </div>
        </>
      )}
    </div>
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
  .cofre-vazio { font-size: 13px; color: var(--gray2); margin-top: 18px; }
  .cofre-trancado { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .cofre-aberto-ate {
    display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0;
    font-size: 11.5px; font-weight: 700; color: var(--gray);
  }
  .cofre-ponto { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .cofre-porta-titulo {
    font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
    color: var(--gray2); margin: 0 0 12px;
  }
  .cofre-campo { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .cofre-dica { font-size: 11px; color: var(--gray2); line-height: 1.45; }
  .cofre-dica.erro { color: var(--red); }

  .cofre-popup { max-width: 420px; padding: 22px; }
  .cofre-codigo {
    font-size: 22px; font-weight: 700; letter-spacing: 8px; text-align: center;
    font-variant-numeric: tabular-nums;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .cofre-popup-pe {
    display: flex; align-items: center; gap: 10px; justify-content: flex-end; margin-top: 18px;
  }
  .cofre-popup-pe .btn { display: inline-flex; align-items: center; gap: 7px; }

  .cofre-barra {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 18px;
  }
  .cofre-busca { flex: 1 1 260px; max-width: 420px; }
  .cofre-barra .btn { display: inline-flex; align-items: center; gap: 7px; }

  .cofre-lista {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px; margin-top: 14px;
  }
  .cofre-card {
    background: var(--white); border: 1px solid var(--gray3);
    border-radius: var(--radius-lg); padding: 14px 16px; box-shadow: var(--shadow-card);
    transition: box-shadow var(--transition-spring), border-color var(--transition);
  }
  .cofre-card:hover { box-shadow: var(--shadow-card-hover); }
  .cofre-card-topo { display: flex; align-items: center; gap: 8px; }
  .cofre-card-nome { flex: 1; min-width: 0; }
  .cofre-card-titulo {
    margin: 0; font-size: 13px; font-weight: 700; color: var(--black);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cofre-etiqueta {
    display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700;
    color: var(--gray2); background: var(--gray4);
    padding: 2px 8px; border-radius: var(--radius-pill);
  }
  .cofre-acao {
    display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
    background: none; border: none; padding: 4px 7px; cursor: pointer; font-family: inherit;
    font-size: 11.5px; font-weight: 700; color: var(--gray2); border-radius: var(--radius-sm);
    transition: color var(--transition), background var(--transition);
  }
  .cofre-acao:hover { color: var(--black); background: var(--gray4); }
  .cofre-acao:disabled { cursor: default; color: var(--gray3); background: none; }
  .cofre-acao.perigo:hover { color: var(--red); }

  .cofre-corpo {
    margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--gray3);
    display: flex; flex-direction: column; gap: 8px;
  }
  .cofre-linha { display: flex; align-items: center; gap: 8px; }
  .cofre-rotulo {
    flex-shrink: 0; width: 62px; font-size: 10.5px; font-weight: 700;
    letter-spacing: .04em; text-transform: uppercase; color: var(--gray2);
  }
  .cofre-valor {
    flex: 1; min-width: 0; font-size: 12.5px; color: var(--black);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cofre-valor.cofre-notas { white-space: pre-wrap; overflow: visible; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .cofre-rodape { margin: 10px 0 0; font-size: 10.5px; color: var(--gray2); }
  .cofre-confirma {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 10px; padding: 8px 10px;
    border: 1px solid var(--red); border-radius: var(--radius-md);
    font-size: 11.5px; color: var(--gray);
  }

  .cofre-editor {
    margin-top: 14px; padding: 20px;
    background: var(--white); border: 1px solid var(--gray3);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-card);
    display: flex; flex-direction: column; gap: 12px;
  }
  .cofre-grade {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;
  }
  .cofre-senha-linha { display: flex; align-items: center; gap: 6px; }
  .cofre-senha-linha .form-input { flex: 1; min-width: 0; }
  .cofre-editor-pe {
    display: flex; align-items: center; gap: 10px; justify-content: flex-end;
    padding-top: 12px; border-top: 1px solid var(--gray3);
  }
  .cofre-editor-pe .btn { display: inline-flex; align-items: center; gap: 7px; }
`;
