import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import { IconAlert, IconCheck, IconChevronDown, IconSpinner } from '../components/icons';
import { CampoSenha } from '../components/CampoSenha';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import {
  PAPEIS_ATRIBUIVEIS, PAPEL_DESCRICAO, PAPEL_LABEL,
  podeGerenciarUsuarios, rotuloPapel, type Papel,
} from './papeis';
import MatrizPermissoes from './MatrizPermissoes';

// ─────────────────────────────────────────────────────────────────────────────
//  Usuários. Duas coisas, na ordem em que se usam:
//
//   1. Quem tem acesso ao painel, com que papel e quando entrou por último.
//   2. A matriz de permissões do papel Membro: por página e por ação, marcando
//      e desmarcando o que ele pode acessar e fazer em cada lugar.
//
//  Página do administrador do sistema, e só dele: o servidor confere o e-mail da
//  sessão em toda leitura e toda escrita (ver `api/_papeis.ts`), então o que
//  esconde a página é conveniência, não a trava.
//
//  O papel `admin` não aparece no seletor de propósito: ele vem de um e-mail
//  fixado no servidor, não de um UPDATE. A linha do próprio administrador fica
//  travada aqui - rebaixar ou desligar a si mesmo deixaria o sistema sem ninguém
//  capaz de devolver acesso a alguém.
//
//  Os checkboxes são desenhados a partir do catálogo que o servidor manda, e não
//  de uma cópia local: assim não existe checkbox sem permissão real por trás.
// ─────────────────────────────────────────────────────────────────────────────

interface UsuarioLinha {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  papel: Papel;
  ativo: boolean;
  /** Entrou por convite, e não pelo domínio da casa. */
  convidado: boolean;
  /** Tem senha definida: entra também pela porta de e-mail e senha. */
  tem_senha: boolean;
  criado_em: string;
  ultimo_acesso: string | null;
  sessoes_abertas: number;
}

interface Resposta {
  usuarios?: UsuarioLinha[];
  usuario?: UsuarioLinha;
  admin_email?: string;
  error?: string;
}

function formatarData(iso: string | null): string {
  if (!iso) return 'Nunca entrou';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "há 3 dias" - o contexto rápido ao lado da data cheia. */
function tempoRelativo(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  const meses = Math.floor(dias / 30);
  return `há ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
}

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const [quebrou, setQuebrou] = useState(false);
  return (
    <span className="usuarios-avatar">
      {foto && !quebrou
        ? <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setQuebrou(true)} />
        : <span>{iniciais(nome)}</span>}
    </span>
  );
}

/**
 * Papel de uma pessoa. É o dropdown da casa, e não um `<select>` nativo: a
 * lista aberta do nativo quem desenha é o sistema operacional - realce azul,
 * fonte do sistema, cantos vivos -, e ela é a única superfície da tela que não
 * obedece ao tema nem à tipografia. O gatilho continua com a cara de campo que
 * a coluna sempre teve; o que muda é a lista.
 */
function SelectPapel({ valor, travado, rotulo, onEscolher }: {
  valor: Papel;
  travado: boolean;
  rotulo: string;
  onEscolher: (p: Papel) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, largura: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  // O dropdown vai para um portal com position: fixed, então a posição sai do
  // retângulo do gatilho na viewport - e o hook fecha tudo se a página rolar.
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  function abrir() {
    const r = gatilho.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left, largura: r.width });
    setAberto(a => !a);
  }

  /** Fecha e devolve o foco ao gatilho, senão ele se perde no fim da página. */
  function fechar() {
    setAberto(false);
    gatilho.current?.focus();
  }

  function escolher(p: Papel) {
    fechar();
    if (p !== valor) onEscolher(p);
  }

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className={`usuarios-select${aberto ? ' aberto' : ''}`}
        disabled={travado}
        aria-label={rotulo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={e => { if (e.key === 'Escape' && aberto) fechar(); }}
      >
        <span>{PAPEL_LABEL[valor]}</span>
        <IconChevronDown size={12} />
      </button>
      {aberto && createPortal(
        <div
          ref={lista}
          className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.largura }}
          role="listbox"
          aria-label={rotulo}
        >
          {PAPEIS_ATRIBUIVEIS.map(p => (
            <div
              key={p}
              role="option"
              aria-selected={p === valor}
              // Opção é div, então o teclado precisa ser devolvido na mão: o
              // <select> nativo que saiu daqui já vinha com isso de fábrica.
              tabIndex={0}
              className={`status-select-option${p === valor ? ' active' : ''}`}
              onClick={() => escolher(p)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(p); }
                if (e.key === 'Escape') fechar();
              }}
            >
              <span>{PAPEL_LABEL[p]}</span>
              {p === valor && <span className="usuarios-select-marca"><IconCheck size={13} /></span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function Estatistica({ label, valor, desc }: { label: string; valor: number; desc: string }) {
  return (
    <div className="admin-stat-card">
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--black)', lineHeight: 1.2, marginTop: 4 }}>{valor}</p>
      <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 2 }}>{desc}</p>
    </div>
  );
}

/** Confirmação de tirar o acesso de alguém. Reativar não pergunta: é reversível
 *  e não interrompe ninguém no meio do trabalho. */
function ConfirmarDesativar({ nome, onCancelar, onConfirmar }: {
  nome: string; onCancelar: () => void; onConfirmar: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancelar(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancelar]);

  return createPortal(
    <div className="usuarios-modal-fundo" onClick={onCancelar}>
      <div className="usuarios-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <p className="usuarios-modal-titulo">Tirar o acesso de {nome}?</p>
        <p className="usuarios-modal-texto">
          A pessoa sai do painel na hora - as sessões abertas dela são encerradas e a entrada com o
          Google passa a ser recusada. O histórico do que ela já fez continua registrado, e você pode
          devolver o acesso quando quiser.
        </p>
        <div className="usuarios-modal-acoes">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn btn-sm usuarios-btn-perigo" onClick={onConfirmar}>
            Tirar o acesso
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Convidar alguém de fora da casa.
 *
 *  Quem tem e-mail da Sheep entra sozinho, pelo Workspace. Para o resto - um
 *  cliente, um parceiro, alguém com conta pessoal - a entrada só existe depois
 *  de cadastrada aqui: o login com o Google confere este cadastro antes de
 *  deixar passar. */
/** O mesmo mínimo que o servidor exige. Escrito aqui de novo porque o front
 *  não importa de `api/` - o servidor continua sendo quem decide, e a tela só
 *  evita a ida ao servidor para ouvir o óbvio. */
const SENHA_MINIMA = 8;

/** A confirmação de mandar o convite de criar a senha.
 *
 *  Não há campo: nem quem clica nem o servidor escolhem a senha. O que vai por
 *  e-mail é um link de uso único, e quem cria a senha é a própria pessoa - só
 *  ela abre a caixa onde o link chegou. Senha escrita no corpo do e-mail ficaria
 *  na caixa de quem recebe e no painel de quem envia, e continuaria valendo
 *  depois de vazar. */
function EnviarSenhaAoConvidado({ pessoa, enviando, onEnviar, onFechar }: {
  pessoa: UsuarioLinha;
  enviando: boolean;
  onEnviar: () => void;
  onFechar: () => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 1200, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">
          {pessoa.tem_senha ? 'Mandar um convite novo?' : 'Mandar o convite de senha?'}
        </p>
        <p className="delete-confirm-desc">
          <strong>{pessoa.email}</strong> recebe um link para criar a própria senha. Ele vale
          24 horas e só pode ser usado uma vez. {pessoa.tem_senha
            ? 'A senha atual continua valendo até ela criar a nova.'
            : 'Depois disso, ela entra por e-mail e senha, além do Google.'}
        </p>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={fechar}>Cancelar</button>
          <button className="delete-confirm-ok" disabled={enviando}
            style={{ background: 'var(--yellow)', color: 'var(--on-yellow)' }}
            onClick={onEnviar}>
            {enviando ? 'Enviando…' : 'Enviar convite'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConvidarPessoa({ aberto, onConvidar, onFechar, enviando }: {
  /** O bloco fica montado o tempo todo: é o que permite abrir e fechar com
   *  animação em vez de aparecer de estalo. */
  aberto: boolean;
  onConvidar: (nome: string, email: string, papel: Papel, senha: string) => void;
  onFechar: () => void;
  enviando: boolean;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('membro');
  /** A senha é opcional: sem ela, a pessoa entra pelo Google. Com ela, ganha
   *  também a porta de e-mail e senha - a única saída para quem não tem conta
   *  Google nenhuma. */
  const [senha, setSenha] = useState('');
  const primeiro = useRef<HTMLInputElement>(null);

  // O foco vai para o primeiro campo quando o bloco abre - e não na montagem,
  // que agora acontece com a página, muito antes de alguém pedir o convite.
  useEffect(() => {
    if (aberto) primeiro.current?.focus();
  }, [aberto]);

  const senhaCurta = senha.length > 0 && senha.length < SENHA_MINIMA;

  function enviar() {
    if (!nome.trim() || !email.trim() || senhaCurta) return;
    onConvidar(nome.trim(), email.trim(), papel, senha);
    setNome(''); setEmail(''); setPapel('membro'); setSenha('');
    onFechar();
  }

  return (
    <div className="usuarios-convite">
      <div className="usuarios-convite-campos">
        <label className="form-group">
          <span className="form-label">Nome</span>
          <input className="form-input" value={nome} ref={primeiro}
            placeholder="Como a pessoa aparece no painel"
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onFechar(); }} />
        </label>
        <label className="form-group">
          <span className="form-label">E-mail</span>
          <input className="form-input" value={email} type="email"
            placeholder="a conta com que ela vai entrar"
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onFechar(); }} />
        </label>
        {/* O mesmo seletor da lista de contas, e não o `select` do sistema
            operacional: aquele abre um menu azul que não é de lugar nenhum e
            ignora o tema. Campo e dropdown do portal são sempre os da casa. */}
        <div className="form-group" style={{ flex: '0 0 170px' }}>
          <span className="form-label">Papel</span>
          <SelectPapel valor={papel} travado={enviando}
            rotulo="Papel de quem está sendo convidado"
            onEscolher={setPapel} />
        </div>
      </div>
      {/* A senha vem numa linha própria, embaixo: ela é a exceção - quem tem
          conta Google não precisa dela, e deixá-la no meio dos campos
          obrigatórios faria parecer que precisa. */}
      <div className="usuarios-convite-campos">
        <label className="form-group" style={{ flex: '1 1 240px' }}>
          <span className="form-label">Senha (opcional)</span>
          <CampoSenha
            valor={senha}
            onMudar={setSenha}
            erro={senhaCurta}
            comSorteio
            placeholder="para quem não tem conta Google"
            onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onFechar(); }}
          />
          <span className="usuarios-senha-dica">
            {senhaCurta
              ? `Ao menos ${SENHA_MINIMA} caracteres.`
              : 'Com senha, a pessoa também entra por e-mail e senha na tela de acesso.'}
          </span>
        </label>
      </div>
      <div className="usuarios-convite-acoes">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary btn-sm"
          disabled={enviando || !nome.trim() || !email.trim() || senhaCurta}
          onClick={enviar}>
          {enviando ? 'Convidando…' : 'Convidar'}
        </button>
      </div>
    </div>
  );
}

export default function UsuariosPage({ token }: { token: string }) {
  const { onSessionExpired, usuario: eu } = useAuth();
  const { toast } = useToast();
  const [usuarios, setUsuarios] = useState<UsuarioLinha[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [negado, setNegado] = useState(false);
  /** Id da linha com uma gravação em voo - trava só aquela linha. */
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aDesativar, setADesativar] = useState<UsuarioLinha | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch('/api/admin-data?action=usuarios', { headers: { 'x-admin-session': token } });
      if (r.status === 401) { onSessionExpired(); return; }
      if (r.status === 403) { setNegado(true); return; }
      const d: Resposta = await r.json();
      setUsuarios(d.usuarios ?? []);
    } catch {
      toast('error', 'Não foi possível carregar', 'A lista de usuários não veio. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [token, onSessionExpired, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const chamar = useCallback(async (corpo: Record<string, unknown>): Promise<Resposta | null> => {
    const r = await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(corpo),
    });
    if (r.status === 401) { onSessionExpired(); return null; }
    const d: Resposta = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast('error', 'Não deu', d.error ?? 'A alteração não foi gravada.');
      return null;
    }
    return d;
  }, [token, onSessionExpired, toast]);

  const [convidando, setConvidando] = useState(false);
  /** De quem é a senha que está sendo definida agora, no diálogo. */
  const [senhaDe, setSenhaDe] = useState<UsuarioLinha | null>(null);
  const [convitePronto, setConvitePronto] = useState(false);

  async function convidar(nome: string, email: string, papel: Papel, senha: string) {
    setConvidando(true);
    const r = await chamar({ action: 'convidar_usuario', nome, email, papel, senha });
    setConvidando(false);
    if (!r?.usuario) return;
    // Entra na lista na hora, com o id que o servidor acabou de dar.
    const nova = r.usuario;
    setUsuarios(lista => [nova, ...(lista ?? []).filter(x => x.id !== nova.id)]);
    setConvitePronto(false);
    toast('success', 'Convite feito', senha
      ? `${nova.nome} entra com ${nova.email}, pelo Google ou pela senha.`
      : `${nova.nome} já pode entrar com ${nova.email}.`);
  }

  /** Manda o convite de criar a senha. Nem esta tela nem o servidor escolhem a
   *  senha: quem cria é a pessoa, do outro lado do link. */
  async function enviarSenha(u: UsuarioLinha) {
    setSalvando(u.id);
    const r = await chamar({ action: 'enviar_link_senha', usuario_id: u.id });
    setSalvando(null);
    if (!r) return;
    setSenhaDe(null);
    toast('success', 'Convite enviado',
      `${u.nome} recebeu em ${u.email} o link para criar a senha. Ele vale 24 horas.`);
  }

  async function trocarPapel(u: UsuarioLinha, papel: Papel) {
    if (papel === u.papel) return;
    setSalvando(u.id);
    const ok = await chamar({ action: 'set_papel', usuario_id: u.id, papel });
    setSalvando(null);
    if (!ok) return;
    setUsuarios(lista => (lista ?? []).map(x => (x.id === u.id ? { ...x, papel } : x)));
    toast('success', 'Papel atualizado', `${u.nome} agora é ${PAPEL_LABEL[papel]}.`);
  }

  async function trocarAtivo(u: UsuarioLinha, ativo: boolean) {
    setSalvando(u.id);
    const ok = await chamar({ action: 'set_usuario_ativo', usuario_id: u.id, ativo });
    setSalvando(null);
    if (!ok) return;
    setUsuarios(lista => (lista ?? []).map(x => (
      x.id === u.id ? { ...x, ativo, sessoes_abertas: ativo ? x.sessoes_abertas : 0 } : x
    )));
    toast('success', ativo ? 'Acesso devolvido' : 'Acesso removido',
      ativo ? `${u.nome} pode entrar novamente.` : `${u.nome} saiu do painel.`);
  }

  // Menu escondido não é permissão: quem chegar por outro caminho para aqui vê a
  // mesma recusa que o servidor deu.
  if (negado || (usuarios === null && !carregando && !podeGerenciarUsuarios(eu))) {
    return (
      <div className="admin-content-wrap">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Usuários</h1>
            <p className="admin-page-desc">Quem tem acesso ao painel</p>
          </div>
        </div>
        <div className="perfil-cartao perfil-vazio">
          <IconAlert size={18} />
          <div>
            <p className="perfil-vazio-titulo">Esta tela é do administrador do sistema</p>
            <p className="perfil-vazio-texto">
              Gerenciar usuários, papéis e acessos é exclusivo da conta de administração. Se você
              precisa de acesso a alguma coisa, fale com quem administra o painel.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="admin-content-wrap">
        <div className="dux-spinner-row" style={{ padding: '40px 0' }}><span className="dux-spinner sm" /></div>
      </div>
    );
  }

  // A lista não chegou (rede, banco fora). Melhor dizer isso e oferecer o botão
  // do que desenhar uma tabela vazia, que se lê como "não há ninguém".
  if (usuarios === null) {
    return (
      <div className="admin-content-wrap">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Usuários</h1>
            <p className="admin-page-desc">Quem tem acesso ao painel, o papel de cada um e o que cada papel alcança</p>
          </div>
        </div>
        <div className="perfil-cartao perfil-vazio">
          <IconAlert size={18} />
          <div>
            <p className="perfil-vazio-titulo">A lista não carregou</p>
            <p className="perfil-vazio-texto">Nada foi alterado. Tente buscar de novo.</p>
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => void carregar()}>
              Tentar de novo
            </button>
          </div>
        </div>
      </div>
    );
  }

  const lista = usuarios;
  const ativos = lista.filter(u => u.ativo);
  const online = lista.filter(u => u.sessoes_abertas > 0).length;
  const masters = ativos.filter(u => u.papel === 'master').length;
  const membros = ativos.filter(u => u.papel === 'membro').length;

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Usuários</h1>
          <p className="admin-page-desc">Quem tem acesso ao painel, o papel de cada um e o que cada papel alcança</p>
        </div>
        {/* O botão fica: ele é o gatilho, e sumir no clique seria mais uma
            troca de estalo na mesma tela. */}
        <button type="button" className="btn btn-primary btn-sm"
          aria-expanded={convitePronto}
          onClick={() => setConvitePronto(v => !v)}>
          + Convidar alguém de fora
        </button>
      </div>

      {/* Fora do cabeçalho: o formulário ocupa a linha inteira, e espremido ao
          lado do título ele viraria três campos de dois dedos. Montado sempre,
          revelado por altura: é o que faz abrir e fechar ser um movimento, e
          não um salto do resto da página. */}
      <div className={`revelar${convitePronto ? ' aberto' : ''}`}>
        <div>
          <ConvidarPessoa
            aberto={convitePronto}
            onConvidar={(n, e, p, senha) => void convidar(n, e, p, senha)}
            onFechar={() => setConvitePronto(false)}
            enviando={convidando}
          />
        </div>
      </div>

      <div className="admin-stats">
        <Estatistica label="Com acesso" valor={ativos.length} desc={`de ${lista.length} ${lista.length === 1 ? 'conta' : 'contas'}`} />
        <Estatistica label="No painel agora" valor={online} desc="com sessão aberta" />
        <Estatistica label="Master" valor={masters} desc="veem e fazem tudo" />
        <Estatistica label="Membro" valor={membros} desc="acesso restrito" />
      </div>

      <div>
        <p className="admin-section-title">Contas</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>E-mail</th>
                <th>Papel</th>
                <th style={{ whiteSpace: 'nowrap' }}>Último acesso</th>
                <th style={{ whiteSpace: 'nowrap' }}>Primeiro acesso</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(u => {
                const souEu = u.id === eu?.id;
                const dono = u.papel === 'admin';
                const travada = dono || salvando === u.id;
                return (
                  <tr key={u.id} className={u.ativo ? undefined : 'usuarios-linha-inativa'}>
                    <td>
                      <span className="usuarios-pessoa">
                        <Avatar nome={u.nome} foto={u.foto_url} />
                        <span className="usuarios-pessoa-nome">
                          {u.nome}
                          {souEu && <span className="usuarios-tag">você</span>}
                          {u.convidado && (
                            <span className="usuarios-tag" title="Entra por convite, e não pelo domínio da casa">
                              convidado
                            </span>
                          )}
                          {u.sessoes_abertas > 0 && (
                            <span className="usuarios-tag online" title={`${u.sessoes_abertas} ${u.sessoes_abertas === 1 ? 'sessão aberta' : 'sessões abertas'}`}>
                              no painel
                            </span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="usuarios-email">{u.email}</td>
                    <td>
                      {dono ? (
                        <span className="usuarios-papel-fixo" title="O papel de administrador vem do e-mail, fixado no servidor">
                          {PAPEL_LABEL.admin}
                        </span>
                      ) : (
                        <SelectPapel
                          valor={u.papel}
                          travado={travada}
                          rotulo={`Papel de ${u.nome}`}
                          onEscolher={p => void trocarPapel(u, p)}
                        />
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatarData(u.ultimo_acesso)}{' '}
                      <span className="perfil-relativo">{tempoRelativo(u.ultimo_acesso)}</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatarData(u.criado_em)}</td>
                    <td>
                      <span className="usuarios-acesso">
                        <span className={`usuarios-situacao${u.ativo ? ' ativa' : ''}`}>
                          {u.ativo ? 'Ativo' : 'Sem acesso'}
                        </span>
                        {/* Só de convidado: quem é da casa entra pelo Workspace, e
                            uma senha ali seria uma segunda porta para uma conta
                            que já tem dono. */}
                        {u.convidado && salvando !== u.id && (
                          <button
                            type="button"
                            className={`usuarios-btn-acesso${u.tem_senha ? ' com-senha' : ''}`}
                            title={u.tem_senha
                              ? 'Já entra por e-mail e senha. Clique para mandar um convite novo.'
                              : 'Mandar por e-mail um link para esta pessoa criar a própria senha'}
                            onClick={() => setSenhaDe(u)}
                          >
                            Enviar senha
                          </button>
                        )}
                        {salvando === u.id
                          ? <span className="usuarios-salvando"><IconSpinner size={13} /></span>
                          : !dono && (
                            <button
                              type="button"
                              className={`usuarios-btn-acesso${u.ativo ? ' remover' : ''}`}
                              onClick={() => (u.ativo ? setADesativar(u) : void trocarAtivo(u, true))}
                            >
                              {u.ativo ? 'Remover' : 'Devolver'}
                            </button>
                          )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {senhaDe && (
        <EnviarSenhaAoConvidado
          pessoa={senhaDe}
          enviando={salvando === senhaDe.id}
          onEnviar={() => void enviarSenha(senhaDe)}
          onFechar={() => setSenhaDe(null)}
        />
      )}

      <div>
        <p className="admin-section-title">O que cada papel pode</p>
        <div className="perfil-cartao usuarios-papeis">
          {/* Do mais poderoso ao mais restrito: quem lê a lista está decidindo
              que papel dar a alguém, e começa pelo topo da escada. */}
          {(['admin', 'master', 'membro'] as Papel[]).map(p => (
            <div key={p} className="usuarios-papel-linha">
              <span className={`usuarios-papel-nome n-${p}`}>{PAPEL_LABEL[p]}</span>
              <span className="usuarios-papel-desc">{PAPEL_DESCRICAO[p]}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="admin-section-title">
          Acessos do papel {rotuloPapel('membro')}
        </p>
        <MatrizPermissoes token={token} />
      </div>

      {aDesativar && (
        <ConfirmarDesativar
          nome={aDesativar.nome}
          onCancelar={() => setADesativar(null)}
          onConfirmar={() => { const u = aDesativar; setADesativar(null); void trocarAtivo(u, false); }}
        />
      )}
    </div>
  );
}
