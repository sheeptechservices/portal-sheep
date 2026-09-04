import { useEffect, useState } from 'react';
import { useAuth, iniciais } from './AdminApp';
import { IconAlert } from '../components/icons';
import { rotuloPapel } from './papeis';
import { instante as formatarData, tempoRelativo } from '../lib/datas';

// ─────────────────────────────────────────────────────────────────────────────
//  Perfil - a conta de quem está logado, o histórico de acesso e o retrato do
//  que essa pessoa já fez no sistema. Cada um só vê a si mesmo: o servidor lê o
//  usuário da sessão e ignora qualquer id que viesse da tela.
// ─────────────────────────────────────────────────────────────────────────────

interface UsuarioPerfil {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  papel: string;
  criado_em: string;
  ultimo_acesso: string | null;
}

interface Resumo {
  comentarios: number;
  eventos: number;
  oportunidades: number;
  cedentes: number;
  pendencias: number;
  acoes: number;
}

interface Acao {
  acao: string;
  alvo: string | null;
  criado_em: string;
}

/** Rótulo legível para o código gravado na auditoria. */
const ACAO_LABEL: Record<string, string> = {
  'login-google': 'Entrou com a conta Google',
  comment: 'Comentou',
  delete_comment: 'Excluiu um comentário',
  move: 'Moveu de etapa',
  upload_file: 'Anexou arquivo',
  delete_file: 'Excluiu arquivo',
  create_submission: 'Criou oportunidade',
  update_submission: 'Editou oportunidade',
  delete_submission: 'Excluiu oportunidade',
  patch_submission: 'Ajustou campo da oportunidade',
  create_cedente: 'Criou cedente',
  update_cedente: 'Editou cedente',
  delete_cedente: 'Desativou cedente',
  import_cedentes: 'Importou cedentes',
  create_sacado: 'Criou sacado',
  update_sacado: 'Editou sacado',
  add_pendencias: 'Registrou pendências',
  toggle_pendencia: 'Marcou pendência',
  'gerar-documento': 'Gerou documento',
  'deps-consulta': 'Consultou o bureau DEPS',
};

function rotuloAcao(acao: string): string {
  if (ACAO_LABEL[acao]) return ACAO_LABEL[acao];
  // Fallback para ação nova ainda sem rótulo: "liquidez:create" -> "liquidez create"
  const cru = acao.replace(/[:_-]+/g, ' ').trim();
  return cru.charAt(0).toUpperCase() + cru.slice(1);
}

/** "há 3 dias" - contexto rápido ao lado da data cheia. */
function Estatistica({ label, valor, desc }: { label: string; valor: number; desc: string }) {
  return (
    <div className="admin-stat-card">
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: 'var(--black)', lineHeight: 1.2, marginTop: 4 }}>{valor}</p>
      <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 2 }}>{desc}</p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="perfil-linha">
      <span className="perfil-linha-rotulo">{rotulo}</span>
      <span className="perfil-linha-valor">{valor}</span>
    </div>
  );
}

export default function PerfilPage({ token }: { token: string }) {
  const { onSessionExpired, usuario: usuarioSessao } = useAuth();
  const [dados, setDados] = useState<{ usuario: UsuarioPerfil | null; resumo?: Resumo; ultimas_acoes?: Acao[] } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semFoto, setSemFoto] = useState(false);
  // A foto da sessão tem precedência: é a que a última entrada gravou.
  const fotoSessao = usuarioSessao?.foto_url ?? null;

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch('/api/admin-data?action=perfil', { headers: { 'x-admin-session': token } })
      .then(r => {
        if (r.status === 401) { onSessionExpired(); throw new Error('401'); }
        return r.json();
      })
      .then(d => { if (vivo) setDados(d); })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [token, fotoSessao, onSessionExpired]);

  if (carregando) {
    return (
      <div className="admin-content-wrap">
        <div className="dux-spinner-row" style={{ padding: '40px 0' }}><span className="dux-spinner sm" /></div>
      </div>
    );
  }

  // Sessão sem dono: entrou pela senha compartilhada, então não há perfil a mostrar.
  if (!dados?.usuario) {
    return (
      <div className="admin-content-wrap">
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Perfil</h1>
            <p className="admin-page-desc">Sua conta e o que você já fez no sistema</p>
          </div>
        </div>
        <div className="perfil-cartao perfil-vazio">
          <IconAlert size={18} />
          <div>
            <p className="perfil-vazio-titulo">Esta sessão não tem dono</p>
            <p className="perfil-vazio-texto">
              Você entrou pela senha de acesso compartilhada, que não identifica ninguém - o que for
              feito por ela fica registrado como "Acesso compartilhado". Saia e entre com a sua conta
              Google para ter perfil próprio e ver suas ações aqui.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const u = dados.usuario;
  const resumo = dados.resumo!;
  const acoes = dados.ultimas_acoes ?? [];
  const foto = fotoSessao ?? u.foto_url;

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Perfil</h1>
          <p className="admin-page-desc">Sua conta, seus acessos e o que você já fez no sistema</p>
        </div>
      </div>

      {/* Identidade */}
      <div className="perfil-cartao perfil-identidade">
        <div className="perfil-avatar">
          {foto && !semFoto
            ? <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setSemFoto(true)} />
            : <span>{iniciais(u.nome)}</span>}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="perfil-nome">{u.nome}</h2>
          <p className="perfil-email">{u.email}</p>
          <div className="perfil-chips">
            <span className="perfil-chip">{rotuloPapel(u.papel)}</span>
            <span className="perfil-chip">Conta Google</span>
          </div>
        </div>
      </div>

      {/* O que essa pessoa já fez */}
      <div>
        <p className="admin-section-title">Sua atividade</p>
        <div className="admin-stats">
          <Estatistica label="Comentários" valor={resumo.comentarios} desc="escritos por você" />
          <Estatistica label="Movimentações" valor={resumo.eventos} desc="eventos no histórico" />
          <Estatistica label="Oportunidades" valor={resumo.oportunidades} desc="criadas por você" />
          <Estatistica label="Cedentes" valor={resumo.cedentes} desc="cadastrados por você" />
          <Estatistica label="Ações" valor={resumo.acoes} desc="registradas na auditoria" />
        </div>
      </div>

      {/* Acesso */}
      <div>
        <p className="admin-section-title">Acesso</p>
        <div className="perfil-cartao">
          <Linha rotulo="Primeiro acesso" valor={<>{formatarData(u.criado_em)} <span className="perfil-relativo">{tempoRelativo(u.criado_em)}</span></>} />
          <Linha rotulo="Último acesso" valor={<>{formatarData(u.ultimo_acesso)} <span className="perfil-relativo">{tempoRelativo(u.ultimo_acesso)}</span></>} />
          <Linha rotulo="Forma de entrada" valor="Conta Google do domínio, verificada no servidor" />
          <Linha rotulo="Duração da sessão" valor="8 horas, renovada a cada entrada" />
        </div>
      </div>

      {/* Trilha */}
      <div>
        <p className="admin-section-title">Últimas ações {acoes.length > 0 && <span style={{ fontWeight: 500, color: 'var(--gray2)' }}>· {acoes.length}</span>}</p>
        {acoes.length === 0 ? (
          <div className="perfil-cartao">
            <p style={{ fontSize: 13, color: 'var(--gray2)' }}>
              Nada registrado ainda. Toda alteração que você fizer no painel aparece aqui.
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Alvo</th>
                  <th style={{ whiteSpace: 'nowrap' }}>Quando</th>
                </tr>
              </thead>
              <tbody>
                {acoes.map((a, i) => (
                  <tr key={`${a.criado_em}-${i}`}>
                    <td style={{ fontWeight: 600 }}>{rotuloAcao(a.acao)}</td>
                    <td style={{ color: 'var(--gray2)', fontSize: 12 }}>{a.alvo ?? '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatarData(a.criado_em)} <span className="perfil-relativo">{tempoRelativo(a.criado_em)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="perfil-nota">
          A auditoria registra o que é <strong>escrito</strong> no sistema. Consultar, abrir um card ou
          baixar um anexo não deixa rastro - por isso o número de ações é menor do que o seu uso real.
        </p>
      </div>
    </div>
  );
}
