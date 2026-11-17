import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth, useToast, iniciais } from './AdminApp';
import {
  IconAlert, IconBuilding, IconCheckCircle, IconClipboard, IconMoney, IconPino, IconSave,
  IconSocorro, IconSpinner, IconTelefone, IconUndo, IconUser,
} from '../components/icons';
import { SelectSistema } from '../components/SelectSistema';
import { AbasPilula } from '../components/FaixaDaPagina';
import { ESTADOS_BR, lookupCEP } from '../lib/cepApi';
import { lookupCNPJ } from '../lib/cnpjApi';
import { mascaraCep, mascaraCnpj, mascaraCpf, mascaraData, mascaraRg, mascaraTelefone } from '../lib/mascaras';
import {
  CAMPOS, ESTADOS_CIVIS, SO_DIGITOS, TIPOS_PIX, VAZIO, mascaraPix, paraTela,
  type Cadastro, type CampoCadastro,
} from '../lib/cadastro';
import { rotuloPapel } from './papeis';
import { instante as formatarData, tempoRelativo } from '../lib/datas';
import { ContaAnimada } from '../components/ContaAnimada';
import { FaixaDaPagina } from '../components/FaixaDaPagina';

// ─────────────────────────────────────────────────────────────────────────────
//  Perfil - a conta de quem está logado, os dados cadastrais dela, o histórico
//  de acesso e o retrato do que essa pessoa já fez no sistema. Cada um só vê a
//  si mesmo: o servidor lê o usuário da sessão e ignora qualquer id da tela.
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
  create_sacado: 'Criou sacado',
  update_sacado: 'Editou sacado',
  add_pendencias: 'Registrou pendências',
  toggle_pendencia: 'Marcou pendência',
  'gerar-documento': 'Gerou documento',
  'deps-consulta': 'Consultou o bureau DEPS',
  salvar_perfil_cadastro: 'Atualizou o cadastro',
};

function rotuloAcao(acao: string): string {
  if (ACAO_LABEL[acao]) return ACAO_LABEL[acao];
  // Fallback para ação nova ainda sem rótulo: "liquidez:create" -> "liquidez create"
  const cru = acao.replace(/[:_-]+/g, ' ').trim();
  return cru.charAt(0).toUpperCase() + cru.slice(1);
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="perfil-linha">
      <span className="perfil-linha-rotulo">{rotulo}</span>
      <span className="perfil-linha-valor">{valor}</span>
    </div>
  );
}

interface ConexaoMcp {
  id: number;
  cliente: string;
  criado_em: string;
  visto_em: string | null;
}

/** Tempo da saída de uma conexão da lista. Espelhado em `.mcp-conexao.saindo`. */
const SAIDA_CONEXAO_MS = 180;

/**
 * O MCP de quem o tem ligado: o endereço para colar no aplicativo de IA e os
 * aplicativos já conectados. Só é montado quando o `me` trouxe `mcp`, então
 * para quem não tem ele não existe nem como bloco vazio.
 */
function ConectarIa({ token }: { token: string }) {
  const { onSessionExpired } = useAuth();
  const { toast } = useToast();
  const [dados, setDados] = useState<{ endereco: string; conexoes: ConexaoMcp[] } | null>(null);
  const [saindo, setSaindo] = useState<Set<number>>(new Set());

  useEffect(() => {
    let vivo = true;
    fetch('/api/admin-data?action=mcp_conexoes', { headers: { 'x-admin-session': token } })
      .then(r => {
        if (r.status === 401) { onSessionExpired(); throw new Error('401'); }
        return r.ok ? r.json() : null;
      })
      .then(d => { if (vivo && d) setDados(d); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [token, onSessionExpired]);

  async function copiar(valor: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(valor);
      toast('success', `${oQue} copiado`, 'Está na área de transferência.');
    } catch {
      toast('error', 'O navegador não deixou copiar', 'Selecione o texto e copie à mão.');
    }
  }

  /** Some da lista no gesto; volta se o servidor recusar. */
  async function desconectar(c: ConexaoMcp) {
    const posicao = dados?.conexoes.findIndex(x => x.id === c.id) ?? -1;
    const soltar = () => setSaindo(s => { const n = new Set(s); n.delete(c.id); return n; });
    setSaindo(s => new Set(s).add(c.id));
    const relogio = setTimeout(() => {
      setDados(d => (d ? { ...d, conexoes: d.conexoes.filter(x => x.id !== c.id) } : d));
      soltar();
    }, SAIDA_CONEXAO_MS);
    // Volta ao lugar de onde saiu, e só se já tiver saído: o erro pode chegar
    // antes de a animação terminar.
    const desfazer = () => {
      clearTimeout(relogio);
      soltar();
      setDados(d => {
        if (!d || d.conexoes.some(x => x.id === c.id)) return d;
        const lista = [...d.conexoes];
        lista.splice(Math.max(posicao, 0), 0, c);
        return { ...d, conexoes: lista };
      });
    };
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'mcp_desconectar', id: c.id }),
      });
      if (r.status === 401) { onSessionExpired(); return; }
      if (!r.ok) throw new Error(String(r.status));
      toast('success', 'Desconectado', `${c.cliente} não acessa mais o portal em seu nome.`);
    } catch {
      desfazer();
      toast('error', 'Não desconectou', `${c.cliente} continua conectado. Tente de novo.`);
    }
  }

  const comando = dados ? `claude mcp add --transport http portal-sheep ${dados.endereco}` : '';

  return (
    <div>
      <p className="admin-section-title">Conectar IA</p>
      {!dados ? (
        <div className="perfil-cartao"><div className="dux-spinner-row"><span className="dux-spinner sm" /></div></div>
      ) : (
        <div className="perfil-cartao troca">
          <div className="perfil-linha">
            <span className="perfil-linha-rotulo">Endereço do MCP</span>
            <span className="perfil-linha-valor mcp-valor">
              <code>{dados.endereco}</code>
              <button type="button" className="rodape-icone" aria-label="Copiar o endereço" title="Copiar"
                onClick={() => void copiar(dados.endereco, 'Endereço')}>
                <IconClipboard size={13} />
              </button>
            </span>
          </div>
          <div className="perfil-linha">
            <span className="perfil-linha-rotulo">Claude Code</span>
            <span className="perfil-linha-valor mcp-valor">
              <code>{comando}</code>
              <button type="button" className="rodape-icone" aria-label="Copiar o comando" title="Copiar"
                onClick={() => void copiar(comando, 'Comando')}>
                <IconClipboard size={13} />
              </button>
            </span>
          </div>
          <div className="perfil-linha mcp-conexoes">
            <span className="perfil-linha-rotulo">Conectados</span>
            {dados.conexoes.length === 0 ? (
              <span className="perfil-linha-valor" style={{ color: 'var(--gray2)' }}>Nenhum aplicativo ainda</span>
            ) : (
              <ul className="mcp-conexoes-lista">
                {dados.conexoes.map(c => (
                  <li key={c.id} className={`mcp-conexao${saindo.has(c.id) ? ' saindo' : ''}`}>
                    <span className="mcp-conexao-nome">
                      {c.cliente}
                      <span className="perfil-relativo">
                        {c.visto_em ? `usado ${tempoRelativo(c.visto_em)}` : `conectado ${tempoRelativo(c.criado_em)}`}
                      </span>
                    </span>
                    <button type="button" className="usuarios-btn-acesso remover"
                      disabled={saindo.has(c.id)} onClick={() => void desconectar(c)}>
                      Desconectar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="perfil-nota">
        No claude.ai, no Claude Desktop e no Cursor, adicione um conector personalizado com o mesmo
        endereço. Na primeira vez, o aplicativo abre o portal para você confirmar a conexão. O que a IA
        fizer sai assinado por você, com as suas permissões.
      </p>
    </div>
  );
}

// ─── Dados cadastrais ────────────────────────────────────────────────────────

/** O que conta para o cadastro estar completo. Complemento, e-mail pessoal,
 *  parentesco e a empresa ficam de fora: nem todo mundo tem, e faltar não é
 *  pendência. */
const ESSENCIAIS: CampoCadastro[] = [
  'nome_completo', 'data_nascimento', 'cpf', 'rg', 'nacionalidade', 'estado_civil', 'celular',
  'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf',
  'pix_tipo', 'pix_chave', 'emergencia_nome', 'emergencia_telefone',
];

const digitos = (v: string) => v.replace(/\D/g, '');

/** "15/03/1990" vira "1990-03-15", e só se a data existir e fizer sentido. */
function dataParaIso(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [, d, mes, a] = m;
  const data = new Date(Number(a), Number(mes) - 1, Number(d));
  if (data.getDate() !== Number(d) || data.getMonth() !== Number(mes) - 1) return null;
  if (Number(a) < 1900 || data > new Date()) return null;
  return `${a}-${mes}-${d}`;
}
/** O que vai para o servidor: sem máscara e sem espaço sobrando. */
function paraGravar(c: Cadastro): Cadastro {
  const g = { ...VAZIO };
  for (const k of CAMPOS) g[k] = SO_DIGITOS.includes(k) ? digitos(c[k]) : c[k].trim();
  g.data_nascimento = c.data_nascimento.trim() ? (dataParaIso(c.data_nascimento) ?? c.data_nascimento.trim()) : '';
  return g;
}

/** O CPF com os dois dígitos verificadores certos. O servidor confere de novo. */
function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(cpf[9]) && dv(10) === Number(cpf[10]);
}

/** Cada campo preenchido no formato errado, com a frase que explica o conserto. */
function errosDo(c: Cadastro): Partial<Record<CampoCadastro, string>> {
  const e: Partial<Record<CampoCadastro, string>> = {};
  const cpf = digitos(c.cpf);
  if (cpf && !cpfValido(cpf)) e.cpf = cpf.length < 11 ? 'Faltam números no CPF.' : 'Este CPF não confere. Revise os números.';
  const cnpj = digitos(c.cnpj);
  if (cnpj && cnpj.length !== 14) e.cnpj = 'O CNPJ tem 14 números.';
  const cep = digitos(c.cep);
  if (cep && cep.length !== 8) e.cep = 'O CEP tem 8 números.';
  if (c.data_nascimento.trim() && !dataParaIso(c.data_nascimento)) e.data_nascimento = 'Use dia, mês e ano, como 15/03/1990.';
  if (c.email_pessoal.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email_pessoal.trim())) {
    e.email_pessoal = 'Confira o endereço de e-mail.';
  }
  for (const k of ['celular', 'emergencia_telefone'] as const) {
    const d = digitos(c[k]);
    if (d && d.length < 10) e[k] = 'Inclua o DDD e o número.';
  }
  return e;
}

/** Um campo do formulário: rótulo em cima, o controle, e embaixo o erro ou a
 *  dica. `largura` é em colunas de uma grade de 12. */
function Campo({ rotulo, largura, erro, dica, onBlur, children }: {
  rotulo: string; largura: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  erro?: string; dica?: ReactNode; onBlur?: () => void; children: ReactNode;
}) {
  return (
    <label className={`form-group perfil-campo l${largura}`} onBlur={onBlur}>
      <span className="form-label">{rotulo}</span>
      {children}
      {erro
        ? <span className="form-error" role="alert">{erro}</span>
        : dica ? <span className="form-hint">{dica}</span> : null}
    </label>
  );
}

/** Um bloco do cadastro, com o desenho e uma linha dizendo para que serve. */
function Secao({ icone, titulo, nota, children }: {
  icone: ReactNode; titulo: string; nota: string; children: ReactNode;
}) {
  return (
    <section className="perfil-secao">
      <header className="perfil-secao-cabeca">
        <span className="perfil-secao-icone">{icone}</span>
        <div>
          <h3 className="perfil-secao-titulo">{titulo}</h3>
          <p className="perfil-secao-nota">{nota}</p>
        </div>
      </header>
      <div className="perfil-campos">{children}</div>
    </section>
  );
}

type EstadoBusca = 'ocioso' | 'buscando' | 'achou' | 'nao_achou';

export default function PerfilPage({ token }: { token: string }) {
  const { onSessionExpired, usuario: usuarioSessao } = useAuth();
  const { toast } = useToast();
  const [dados, setDados] = useState<{
    usuario: UsuarioPerfil | null; resumo?: Resumo; ultimas_acoes?: Acao[];
    cadastro?: Record<string, string>; cadastro_atualizado_em?: string | null;
  } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [semFoto, setSemFoto] = useState(false);
  const [aba, setAba] = useState<'cadastro' | 'acoes'>('cadastro');
  // O que está nos campos e o que o servidor tem. A diferença entre os dois é
  // o que acende a barra de gravar.
  const [form, setForm] = useState<Cadastro>(VAZIO);
  const [salvo, setSalvo] = useState<Cadastro>(VAZIO);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [tocados, setTocados] = useState<Set<CampoCadastro>>(new Set());
  const [tentouGravar, setTentouGravar] = useState(false);
  const [buscaCep, setBuscaCep] = useState<EstadoBusca>('ocioso');
  const [buscaCnpj, setBuscaCnpj] = useState<EstadoBusca>('ocioso');
  const [situacaoCnpj, setSituacaoCnpj] = useState<string | null>(null);
  const ultimoCep = useRef('');
  const ultimoCnpj = useRef('');
  const iniciado = useRef(false);
  const pedido = useRef(0);
  const campoNumero = useRef<HTMLInputElement>(null);
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
      .then(d => {
        if (!vivo) return;
        setDados(d);
        // O formulário nasce uma vez só: uma segunda leitura (a foto que
        // chegou depois) não pode apagar o que a pessoa já está digitando.
        if (!iniciado.current && d?.usuario) {
          iniciado.current = true;
          const inicial = paraTela(d.cadastro);
          setForm(inicial);
          setSalvo(inicial);
          setSalvoEm(d.cadastro_atualizado_em ?? null);
          ultimoCep.current = digitos(inicial.cep);
          ultimoCnpj.current = digitos(inicial.cnpj);
        }
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [token, fotoSessao, onSessionExpired]);

  const erros = useMemo(() => errosDo(form), [form]);
  const gravar_ = useMemo(() => paraGravar(form), [form]);
  const sujo = useMemo(() => {
    const g = paraGravar(salvo);
    return CAMPOS.some(k => g[k] !== gravar_[k]);
  }, [salvo, gravar_]);
  const completos = ESSENCIAIS.filter(k => gravar_[k] && !erros[k]).length;
  const percentual = Math.round((completos / ESSENCIAIS.length) * 100);

  const set = (k: CampoCadastro) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const tocar = (k: CampoCadastro) => () => setTocados(t => (t.has(k) ? t : new Set(t).add(k)));
  const erroDe = (k: CampoCadastro) => ((tocados.has(k) || tentouGravar) ? erros[k] : undefined);

  /** CEP completo e diferente do último: procura o endereço nas três bases, em
   *  cascata. O resultado só entra se o CEP ainda for o mesmo quando ele chegar. */
  async function procurarCep(cep: string) {
    ultimoCep.current = cep;
    setBuscaCep('buscando');
    const r = await lookupCEP(cep);
    if (ultimoCep.current !== cep) return;
    if (!r) { setBuscaCep('nao_achou'); return; }
    setForm(f => ({
      ...f,
      logradouro: r.logradouro || f.logradouro,
      bairro: r.bairro || f.bairro,
      cidade: r.cidade || f.cidade,
      uf: (ESTADOS_BR as readonly string[]).includes(r.estado) ? r.estado : f.uf,
    }));
    setBuscaCep('achou');
    campoNumero.current?.focus();
  }
  function mudarCep(v: string) {
    const m = mascaraCep(v);
    set('cep')(m);
    const d = digitos(m);
    if (d.length === 8 && d !== ultimoCep.current) void procurarCep(d);
    if (d.length < 8) { ultimoCep.current = ''; setBuscaCep('ocioso'); }
  }

  /** O CNPJ completo puxa a razão social do cadastro público. */
  async function procurarCnpj(cnpj: string) {
    ultimoCnpj.current = cnpj;
    setBuscaCnpj('buscando');
    const r = await lookupCNPJ(cnpj, token);
    if (ultimoCnpj.current !== cnpj) return;
    if (!r?.razao_social) { setBuscaCnpj('nao_achou'); setSituacaoCnpj(null); return; }
    setForm(f => ({ ...f, razao_social: r.razao_social }));
    setSituacaoCnpj(r.descricao_situacao_cadastral || null);
    setBuscaCnpj('achou');
  }
  function mudarCnpj(v: string) {
    const m = mascaraCnpj(v);
    set('cnpj')(m);
    const d = digitos(m);
    if (d.length === 14 && d !== ultimoCnpj.current) void procurarCnpj(d);
    if (d.length < 14) { ultimoCnpj.current = ''; setBuscaCnpj('ocioso'); setSituacaoCnpj(null); }
  }

  function desfazer() {
    setForm(salvo);
    setTocados(new Set());
    setTentouGravar(false);
    setBuscaCep('ocioso');
    setBuscaCnpj('ocioso');
    setSituacaoCnpj(null);
    ultimoCep.current = digitos(salvo.cep);
    ultimoCnpj.current = digitos(salvo.cnpj);
  }

  /** Pinta como gravado no gesto; volta ao que estava se o servidor recusar. */
  async function gravar() {
    if (!sujo) return;
    if (Object.keys(erros).length) {
      setTentouGravar(true);
      toast('error', 'Há campos para revisar', 'Os campos marcados em vermelho estão fora do formato.');
      return;
    }
    const meu = ++pedido.current;
    const anterior = salvo;
    const anteriorEm = salvoEm;
    setSalvo(form);
    setSalvoEm(new Date().toISOString());
    try {
      const r = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'salvar_perfil_cadastro', dados: gravar_ }),
      });
      if (r.status === 401) { onSessionExpired(); return; }
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? 'O servidor não respondeu. Tente de novo.');
      if (meu === pedido.current && j?.atualizado_em) setSalvoEm(j.atualizado_em);
    } catch (e) {
      // Só o último pedido desfaz: um anterior que falhe depois não pode
      // apagar uma gravação mais nova.
      if (meu !== pedido.current) return;
      setSalvo(anterior);
      setSalvoEm(anteriorEm);
      toast('error', 'O cadastro não foi gravado', e instanceof Error ? e.message : 'Tente de novo.');
    }
  }

  if (carregando && !dados) {
    return (
      <div className="admin-content-wrap">
        <div className="dux-spinner-row" style={{ padding: '40px 0' }}><span className="dux-spinner sm" /></div>
      </div>
    );
  }

  // Sessão sem dono: entrou pela senha compartilhada, então não há perfil a mostrar.
  if (!dados?.usuario) {
    return (
      <div className="admin-content-wrap pagina-cristal pagina-perfil">
        <FaixaDaPagina secao="Conta" titulo="Perfil" />
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

  /** A linha embaixo do campo de CEP: o que a busca está fazendo ou achou. */
  const dicaCep = buscaCep === 'buscando'
    ? <span className="perfil-busca"><IconSpinner size={11} /> Procurando o endereço</span>
    : buscaCep === 'achou' ? <span className="perfil-busca ok"><IconCheckCircle size={11} /> Endereço preenchido pelo CEP</span>
    : buscaCep === 'nao_achou' ? 'Não achamos este CEP. Preencha o endereço à mão.'
    : 'O endereço se completa sozinho.';
  const dicaCnpj = buscaCnpj === 'buscando'
    ? <span className="perfil-busca"><IconSpinner size={11} /> Consultando a Receita</span>
    : buscaCnpj === 'achou' ? <span className="perfil-busca ok"><IconCheckCircle size={11} /> {situacaoCnpj ? `Situação ${situacaoCnpj.toLowerCase()}` : 'Razão social preenchida'}</span>
    : buscaCnpj === 'nao_achou' ? 'Não achamos este CNPJ. Escreva a razão social à mão.'
    : 'A razão social se completa sozinha.';

  return (
    <div className="admin-content-wrap pagina-cristal pagina-perfil">
      {/* A faixa do alto, como nas outras telas: a área, o nome e os números do
          que a pessoa já fez - eram quatro cartões soltos no meio da página. */}
      <FaixaDaPagina
        secao="Conta"
        titulo="Perfil"
        itens={[
          { rotulo: 'Comentários', valor: resumo.comentarios, nota: 'escritos por você' },
          { rotulo: 'Movimentações', valor: resumo.eventos, nota: 'no histórico' },
          { rotulo: 'Oportunidades', valor: resumo.oportunidades, nota: 'criadas por você' },
          { rotulo: 'Ações', valor: resumo.acoes, nota: 'na auditoria' },
        ]}
      />

      <div className="perfil-grade">
        {/* À esquerda, quem é a pessoa e como ela entra; à direita, o cadastro
            e a trilha do que ela fez, que são as partes longas e rolam por
            dentro do painel. */}
        <div className="perfil-coluna">
          <section className="perfil-cartao perfil-identidade">
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
          </section>

          <section>
            <p className="admin-section-title">Acesso</p>
            <div className="perfil-cartao">
              <Linha rotulo="Primeiro acesso" valor={<>{formatarData(u.criado_em)} <span className="perfil-relativo">{tempoRelativo(u.criado_em)}</span></>} />
              <Linha rotulo="Último acesso" valor={<>{formatarData(u.ultimo_acesso)} <span className="perfil-relativo">{tempoRelativo(u.ultimo_acesso)}</span></>} />
              <Linha rotulo="Forma de entrada" valor="Conta Google do domínio, verificada no servidor" />
              <Linha rotulo="Duração da sessão" valor="8 horas, renovada a cada entrada" />
            </div>
          </section>

          {usuarioSessao?.mcp && <ConectarIa token={token} />}
        </div>

        <section className="painel-principal perfil-painel">
          <div className="painel-principal-cabeca">
            <AbasPilula rotulo="Parte do perfil" ativa={aba} onTrocar={setAba}
              abas={[
                { id: 'cadastro', rotulo: 'Dados cadastrais' },
                { id: 'acoes', rotulo: 'Últimas ações', conta: acoes.length },
              ]} />
            {/* Quanto do essencial já está preenchido e os botões de gravar, no
                alto: o canto de baixo é dos botões flutuantes. Na trilha, que
                não tem nada a ver com eles, apagam sem sair do lugar. */}
            <div className={`perfil-ferramentas${aba === 'cadastro' ? '' : ' oculto'}`}
              aria-hidden={aba !== 'cadastro'}>
              <div className={`perfil-completo${percentual === 100 ? ' cheio' : ''}`}
                title={`${completos} de ${ESSENCIAIS.length} dados essenciais`}>
                <span className="perfil-completo-rotulo">Cadastro</span>
                <span className="perfil-completo-barra"><span style={{ width: `${percentual}%` }} /></span>
                <span className="perfil-completo-valor"><ContaAnimada valor={`${percentual}%`} /></span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" disabled={!sujo} tabIndex={aba === 'cadastro' ? 0 : -1} onClick={desfazer}>
                <IconUndo size={13} /> Desfazer
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!sujo} tabIndex={aba === 'cadastro' ? 0 : -1} onClick={() => void gravar()}>
                <IconSave size={13} /> Gravar
              </button>
            </div>
          </div>

          {aba === 'cadastro' ? (
            <div key="cadastro" className="perfil-cadastro troca"
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void gravar(); }
              }}>
              <div className="painel-principal-corpo perfil-cadastro-corpo">
                <div className="perfil-cadastro-topo">
                  <p className="perfil-nota perfil-cadastro-aviso">
                    Só você edita estes dados. Além de você, só a administração do portal os vê, na
                    ficha cadastral. Eles servem para contrato, pagamento e para saber quem avisar
                    numa emergência.
                  </p>
                  {/* O estado da gravação troca de cara, em opacidade. */}
                  <span key={sujo ? 'sujo' : 'limpo'} className={`perfil-estado troca${sujo ? ' sujo' : ''}`}>
                    {sujo
                      ? <><span className="perfil-estado-ponto" aria-hidden="true" /> Alterações não gravadas</>
                      : <><IconCheckCircle size={13} /> {salvoEm ? `Gravado ${tempoRelativo(salvoEm)}` : 'Nada preenchido ainda'}</>}
                  </span>
                </div>

                <Secao icone={<IconUser size={15} />} titulo="Dados pessoais" nota="Como aparece nos documentos.">
                  <Campo rotulo="Nome completo" largura={8} onBlur={tocar('nome_completo')}>
                    <input className="form-input" value={form.nome_completo} maxLength={120}
                      placeholder={u.nome} autoComplete="name"
                      onChange={e => set('nome_completo')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Nascimento" largura={4} erro={erroDe('data_nascimento')} onBlur={tocar('data_nascimento')}>
                    <input className={`form-input${erroDe('data_nascimento') ? ' error' : ''}`} inputMode="numeric"
                      value={form.data_nascimento} placeholder="dd/mm/aaaa" autoComplete="bday"
                      onChange={e => set('data_nascimento')(mascaraData(e.target.value))} />
                  </Campo>
                  <Campo rotulo="CPF" largura={4} erro={erroDe('cpf')} onBlur={tocar('cpf')}>
                    <input className={`form-input${erroDe('cpf') ? ' error' : ''}`} inputMode="numeric"
                      value={form.cpf} placeholder="000.000.000-00"
                      onChange={e => set('cpf')(mascaraCpf(e.target.value))} />
                  </Campo>
                  <Campo rotulo="RG" largura={4}>
                    <input className="form-input" value={form.rg} placeholder="00.000.000-0"
                      onChange={e => set('rg')(mascaraRg(e.target.value))} />
                  </Campo>
                  <Campo rotulo="Nacionalidade" largura={4}>
                    <input className="form-input" value={form.nacionalidade} maxLength={40} placeholder="Brasileira"
                      onChange={e => set('nacionalidade')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Estado civil" largura={4}>
                    <SelectSistema valor={form.estado_civil} onChange={set('estado_civil')} placeholder="Escolha"
                      opcoes={ESTADOS_CIVIS.map(v => ({ valor: v, label: v }))} />
                  </Campo>
                </Secao>

                <Secao icone={<IconTelefone size={15} />} titulo="Contato" nota="Fora do e-mail da empresa.">
                  <Campo rotulo="Celular / WhatsApp" largura={5} erro={erroDe('celular')} onBlur={tocar('celular')}>
                    <input className={`form-input${erroDe('celular') ? ' error' : ''}`} inputMode="tel" autoComplete="tel"
                      value={form.celular} placeholder="(31) 90000-0000"
                      onChange={e => set('celular')(mascaraTelefone(e.target.value))} />
                  </Campo>
                  <Campo rotulo="E-mail pessoal" largura={7} erro={erroDe('email_pessoal')} onBlur={tocar('email_pessoal')}>
                    <input className={`form-input${erroDe('email_pessoal') ? ' error' : ''}`} type="email" inputMode="email"
                      value={form.email_pessoal} maxLength={120} placeholder="voce@email.com" autoComplete="email"
                      onChange={e => set('email_pessoal')(e.target.value)} />
                  </Campo>
                </Secao>

                <Secao icone={<IconPino size={15} />} titulo="Endereço" nota="Digite o CEP e o resto vem sozinho.">
                  <Campo rotulo="CEP" largura={4} erro={erroDe('cep')} dica={dicaCep} onBlur={tocar('cep')}>
                    <span className="perfil-campo-com-giro">
                      <input className={`form-input${erroDe('cep') ? ' error' : ''}`} inputMode="numeric"
                        value={form.cep} placeholder="00.000-000" autoComplete="postal-code"
                        onChange={e => mudarCep(e.target.value)} />
                      {buscaCep === 'buscando' && <span className="perfil-giro surge" aria-hidden="true"><IconSpinner size={14} /></span>}
                    </span>
                  </Campo>
                  <Campo rotulo="Logradouro" largura={8}>
                    <input className="form-input" value={form.logradouro} maxLength={120} placeholder="Rua, avenida"
                      autoComplete="address-line1" onChange={e => set('logradouro')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Número" largura={3}>
                    <input ref={campoNumero} className="form-input" value={form.numero} maxLength={20} placeholder="123"
                      onChange={e => set('numero')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Complemento" largura={4}>
                    <input className="form-input" value={form.complemento} maxLength={60} placeholder="Apto, bloco"
                      autoComplete="address-line2" onChange={e => set('complemento')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Bairro" largura={5}>
                    <input className="form-input" value={form.bairro} maxLength={80}
                      onChange={e => set('bairro')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Cidade" largura={8}>
                    <input className="form-input" value={form.cidade} maxLength={80} autoComplete="address-level2"
                      onChange={e => set('cidade')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Estado" largura={4}>
                    <SelectSistema valor={form.uf} onChange={set('uf')} placeholder="UF"
                      opcoes={ESTADOS_BR.map(v => ({ valor: v, label: v }))} />
                  </Campo>
                </Secao>

                <Secao icone={<IconBuilding size={15} />} titulo="Empresa" nota="Só para quem emite nota como PJ.">
                  <Campo rotulo="CNPJ" largura={5} erro={erroDe('cnpj')} dica={dicaCnpj} onBlur={tocar('cnpj')}>
                    <span className="perfil-campo-com-giro">
                      <input className={`form-input${erroDe('cnpj') ? ' error' : ''}`} inputMode="numeric"
                        value={form.cnpj} placeholder="00.000.000/0000-00"
                        onChange={e => mudarCnpj(e.target.value)} />
                      {buscaCnpj === 'buscando' && <span className="perfil-giro surge" aria-hidden="true"><IconSpinner size={14} /></span>}
                    </span>
                  </Campo>
                  <Campo rotulo="Razão social" largura={7}>
                    <input className="form-input" value={form.razao_social} maxLength={150}
                      onChange={e => set('razao_social')(e.target.value)} />
                  </Campo>
                </Secao>

                <Secao icone={<IconMoney size={15} />} titulo="Recebimento" nota="A chave PIX para pagamentos e reembolsos.">
                  <Campo rotulo="Tipo de chave" largura={4}>
                    <SelectSistema valor={form.pix_tipo} placeholder="Escolha" opcoes={TIPOS_PIX}
                      onChange={v => setForm(f => ({ ...f, pix_tipo: v, pix_chave: mascaraPix(v, f.pix_chave) }))} />
                  </Campo>
                  <Campo rotulo="Chave PIX" largura={8}>
                    <input className="form-input" value={form.pix_chave} maxLength={140}
                      placeholder={form.pix_tipo === 'email' ? 'voce@email.com' : form.pix_tipo === 'celular' ? '(31) 90000-0000' : ''}
                      onChange={e => set('pix_chave')(mascaraPix(form.pix_tipo, e.target.value))} />
                  </Campo>
                </Secao>

                <Secao icone={<IconSocorro size={15} />} titulo="Contato de emergência" nota="Quem a equipe avisa se algo acontecer.">
                  <Campo rotulo="Nome" largura={5}>
                    <input className="form-input" value={form.emergencia_nome} maxLength={120}
                      onChange={e => set('emergencia_nome')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Parentesco" largura={3}>
                    <input className="form-input" value={form.emergencia_parentesco} maxLength={40} placeholder="Mãe, cônjuge"
                      onChange={e => set('emergencia_parentesco')(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Telefone" largura={4} erro={erroDe('emergencia_telefone')} onBlur={tocar('emergencia_telefone')}>
                    <input className={`form-input${erroDe('emergencia_telefone') ? ' error' : ''}`} inputMode="tel"
                      value={form.emergencia_telefone} placeholder="(31) 90000-0000"
                      onChange={e => set('emergencia_telefone')(mascaraTelefone(e.target.value))} />
                  </Campo>
                </Secao>
              </div>
            </div>
          ) : (
            <div key="acoes" className="painel-principal-corpo perfil-trilha-corpo troca">
              {acoes.length === 0 ? (
                <p className="perfil-trilha-vazia">
                  Nada registrado ainda. Toda alteração que você fizer no painel aparece aqui.
                </p>
              ) : (
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
              )}
              <p className="perfil-nota">
                A auditoria registra o que é <strong>escrito</strong> no sistema. Consultar, abrir um card ou
                baixar um anexo não deixa rastro - por isso o número de ações é menor do que o seu uso real.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
