import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import { IconAlert, IconCheck, IconChevronDown, IconSpinner } from '../components/icons';
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
function ConvidarPessoa({ onConvidar, onFechar, enviando }: {
  onConvidar: (nome: string, email: string, papel: Papel) => void;
  onFechar: () => void;
  enviando: boolean;
}) {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('membro');

  function enviar() {
    if (!nome.trim() || !email.trim()) return;
    onConvidar(nome.trim(), email.trim(), papel);
    setNome(''); setEmail(''); setPapel('membro');
    onFechar();
  }

  return (
    <div className="usuarios-convite surge">
      <div className="usuarios-convite-campos">
        <label className="form-group">
          <span className="form-label">Nome</span>
          <input className="form-input" value={nome} autoFocus
            placeholder="Como a pessoa aparece no painel"
            onChange={e => setNome(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onFechar(); }} />
        </label>
        <label className="form-group">
          <span className="form-label">E-mail do Google</span>
          <input className="form-input" value={email} type="email"
            placeholder="a conta com que ela vai entrar"
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onFechar(); }} />
        </label>
        <label className="form-group" style={{ maxWidth: 160 }}>
          <span className="form-label">Papel</span>
          <select className="form-select" value={papel}
            onChange={e => setPapel(e.target.value as Papel)}>
            {PAPEIS_ATRIBUIVEIS.map(p => (
              <option key={p} value={p}>{PAPEL_LABEL[p]}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="usuarios-convite-nota">
        Tem de ser o mesmo endereço da conta Google que a pessoa usa para entrar. Enquanto o acesso
        estiver ativo aqui, ela passa; tirando o acesso, a entrada seguinte é recusada.
      </p>
      <div className="usuarios-convite-acoes">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onFechar}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={enviando || !nome.trim() || !email.trim()}
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
  const [convitePronto, setConvitePronto] = useState(false);

  async function convidar(nome: string, email: string, papel: Papel) {
    setConvidando(true);
    const r = await chamar({ action: 'convidar_usuario', nome, email, papel });
    setConvidando(false);
    if (!r?.usuario) return;
    // Entra na lista na hora, com o id que o servidor acabou de dar.
    const nova = r.usuario;
    setUsuarios(lista => [nova, ...(lista ?? []).filter(x => x.id !== nova.id)]);
    setConvitePronto(false);
    toast('success', 'Convite feito',
      `${nova.nome} já pode entrar com ${nova.email}.`);
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
        {!convitePronto && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConvitePronto(true)}>
            + Convidar alguém de fora
          </button>
        )}
      </div>

      {/* Fora do cabeçalho: o formulário ocupa a linha inteira, e espremido ao
          lado do título ele viraria três campos de dois dedos. */}
      {convitePronto && (
        <ConvidarPessoa
          onConvidar={(n, e, p) => void convidar(n, e, p)}
          onFechar={() => setConvitePronto(false)}
          enviando={convidando}
        />
      )}

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
