// ─────────────────────────────────────────────────────────────────────────────
//  O cadastro de candidato, com leitura do currículo.
//
//  Quem cadastra solta o PDF do currículo e a IA preenche a ficha com o que
//  está escrito ali. O que volta é rascunho: os campos ficam abertos para
//  conferir e corrigir, e nada vai para o banco antes do "Cadastrar".
//
//  O que a pessoa já digitou é dela: uma leitura que chega depois não passa por
//  cima. Cada campo mexido à mão fica marcado, e a leitura - inclusive a de um
//  segundo currículo, quando o primeiro era o errado - só escreve nos outros.
//
//  Sexo e o nível de cada habilidade não vêm da IA. Sexo deduzido do nome erra,
//  e erro ali é ofensa; o nível, na ficha, é a nota que a própria pessoa se deu.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CampoTexto } from '../components/CampoTexto';
import { SelectSistema } from '../components/SelectSistema';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import {
  IconAlert, IconCheck, IconDoc, IconImage, IconPlus, IconSparkles, IconSpinner, IconTrash,
  IconUpload, IconX,
} from '../components/icons';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useLarguraPainel } from '../lib/painelLateral';
import { useRevelar } from '../lib/useRevelar';
import { useSaidaSuave } from '../lib/useSaidaSuave';

const TITULO_DE_PARTIDA = 'Sem título';
const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** O mesmo teto do servidor: o corpo de uma função para em 4,5 MB. */
const LIMITE = 3 * 1024 * 1024;

/** As respostas fechadas, com a grafia que o banco já usa. */
const SENIORIDADES = ['Júnior', 'Pleno', 'Sênior'];
const EXPERIENCIAS = ['0 a 1 ano', '1 a 3 anos', '3 a 5 anos', 'Mais de 5 anos'];
const NIVEIS_DE_INGLES = ['Básico', 'Intermediário', 'Avançado', 'Fluente'];
const MODELOS = ['Remoto', 'Híbrido', 'Presencial'];
const CONTRATACOES = ['PJ', 'CLT'];
const REGIMES = ['MEI', 'ME', 'Simples Nacional', 'Lucro Presumido'];
const SEXOS = ['Feminino', 'Masculino'];
const ORIGENS = ['Currículo recebido', 'Indicação', 'LinkedIn', 'Outro'];

const ESTADOS: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/** Os campos de texto da ficha. `possui_cnpj` mora aqui como 'sim', 'nao' ou
 *  vazio, que é o que o seletor sabe mostrar. */
type Campo =
  | 'email' | 'telefone' | 'interesse' | 'senioridade' | 'tempo_experiencia' | 'nivel_ingles'
  | 'outro_idioma' | 'nascimento' | 'sexo' | 'cidade' | 'uf' | 'linkedin' | 'github'
  | 'modelo_trabalho' | 'contratacao' | 'possui_cnpj' | 'regime_fiscal' | 'resumo'
  | 'case_sucesso' | 'origem' | 'indicado_por' | 'observacoes';

const VAZIO: Record<Campo, string> = {
  email: '', telefone: '', interesse: '', senioridade: '', tempo_experiencia: '', nivel_ingles: '',
  outro_idioma: '', nascimento: '', sexo: '', cidade: '', uf: '', linkedin: '', github: '',
  modelo_trabalho: '', contratacao: '', possui_cnpj: '', regime_fiscal: '', resumo: '',
  case_sucesso: '', origem: 'Currículo recebido', indicado_por: '', observacoes: '',
};

export interface HabilidadeLida { nome: string; tempo: string }

/** O que a tela de talentos recebe para pintar a linha na hora. */
export interface CandidatoNovo {
  nome: string;
  campos: Record<Campo, string>;
  habilidades: HabilidadeLida[];
}

interface Arquivo { nome: string; tipo: string; tamanho: number; base64: string }

function lerDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    fr.readAsDataURL(f);
  });
}

const peso = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** A data guardada (AAAA-MM-DD) do jeito que se lê, e o caminho de volta. */
const isoParaBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '');
function brParaIso(br: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!m) return '';
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[1]) ? '' : iso;
}
/** Digitar só os números já põe as barras. */
function mascaraData(v: string) {
  const n = v.replace(/\D/g, '').slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join('/');
}

/** Um seletor da casa com a opção de deixar sem resposta. */
function Escolha({ valor, opcoes, onChange, rotulo }: {
  valor: string; opcoes: string[]; onChange: (v: string) => void; rotulo: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{rotulo}</label>
      <SelectSistema<string> valor={valor} onChange={onChange} placeholder="Não informado"
        opcoes={[{ valor: '', label: 'Não informado' }, ...opcoes.map(o => ({ valor: o, label: o }))]} />
    </div>
  );
}

export function CadastroCandidato({ gravar, onFechar, onCadastrar }: {
  gravar: (corpo: Record<string, unknown>) => Promise<any>;
  onFechar: () => void;
  onCadastrar: (novo: CandidatoNovo) => void;
}) {
  const painel = useLarguraPainel('candidato-novo');
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const seletor = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(TITULO_DE_PARTIDA);
  const [campos, setCampos] = useState<Record<Campo, string>>(VAZIO);
  const [nascimentoBr, setNascimentoBr] = useState('');
  const [habilidades, setHabilidades] = useState<HabilidadeLida[]>([]);
  const [novaHabilidade, setNovaHabilidade] = useState('');
  /** O que a pessoa mexeu à mão. A leitura do currículo não escreve ali. */
  const tocados = useRef(new Set<string>());
  /** As habilidades tiradas à mão, em minúsculas. */
  const removidas = useRef(new Set<string>());

  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [preenchidos, setPreenchidos] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /** O pedido em voo. Fechar a gaveta ou trocar de arquivo no meio faz a
   *  resposta velha chegar num lugar que já não a espera. */
  const leitura = useRef(0);

  const regime = useRevelar(campos.possui_cnpj === 'sim');
  const indicacao = useRevelar(campos.origem === 'Indicação');

  const mudar = (c: Campo, v: string) => {
    tocados.current.add(c);
    setCampos(a => ({ ...a, [c]: v }));
  };

  /** Escreve o que o currículo trouxe, campo a campo, sem tocar no que a pessoa
   *  já mexeu. Devolve quantos campos ganharam valor. */
  function aplicar(lido: { campos: Record<string, string>; habilidades: HabilidadeLida[] }) {
    // Pela função, e não pelo `campos` de quando a leitura saiu: o que a
    // pessoa digitou enquanto a IA lia está no estado novo, não no antigo.
    const livres = Object.entries(lido.campos)
      .filter(([c]) => c !== 'nome' && c in VAZIO && !tocados.current.has(c)) as [Campo, string][];
    let quantos = livres.filter(([, v]) => v).length;
    setCampos(a => ({ ...a, ...Object.fromEntries(livres) }));
    if (!tocados.current.has('nascimento')) setNascimentoBr(isoParaBr(lido.campos.nascimento ?? ''));
    const nomeLido = lido.campos.nome?.trim();
    if (nomeLido && !tocados.current.has('nome')) { setNome(nomeLido); quantos++; }
    if (lido.habilidades.length) {
      if (tocados.current.has('habilidades')) {
        // Mexidas à mão: as do currículo entram no fim, sem repetir, e a que a
        // pessoa tirou não volta.
        setHabilidades(a => [...a, ...lido.habilidades.filter(h =>
          !removidas.current.has(h.nome.toLowerCase())
          && !a.some(x => x.nome.toLowerCase() === h.nome.toLowerCase()))]);
      } else {
        setHabilidades(lido.habilidades);
      }
      quantos++;
    }
    return quantos;
  }

  async function receber(lista: FileList | File[] | null | undefined) {
    const f = [...(lista ?? [])][0];
    if (!f) return;
    setAviso(null);
    if (!TIPOS_ACEITOS.includes(f.type)) {
      setAviso(`"${f.name}" não é PDF nem imagem. Salve o currículo em PDF e solte de novo.`);
      return;
    }
    if (f.size > LIMITE) { setAviso(`"${f.name}" passa de 3 MB.`); return; }
    let base64: string;
    try { base64 = await lerDataUrl(f); } catch { setAviso(`Não foi possível abrir "${f.name}".`); return; }
    const este: Arquivo = { nome: f.name || 'currículo', tipo: f.type, tamanho: f.size, base64 };
    setArquivo(este);
    setPreenchidos(null);
    setLendo(true);
    const minha = ++leitura.current;
    const r = await gravar({ action: 'ler_curriculo', anexo: { nome: este.nome, tipo: este.tipo, base64 } })
      .catch(() => null);
    if (minha !== leitura.current) return;
    setLendo(false);
    if (!r?.ok) {
      setAviso(r?.error ?? 'A conexão caiu no meio da leitura. Solte o arquivo de novo.');
      return;
    }
    setPreenchidos(aplicar({ campos: r.campos ?? {}, habilidades: r.habilidades ?? [] }));
  }

  function tirarArquivo() {
    // O que já foi preenchido fica: tirar o arquivo é desistir da leitura, e
    // não do que ela escreveu.
    leitura.current++;
    setArquivo(null);
    setLendo(false);
    setPreenchidos(null);
    setAviso(null);
  }

  function adicionarHabilidade() {
    const n = novaHabilidade.trim();
    if (!n) return;
    tocados.current.add('habilidades');
    removidas.current.delete(n.toLowerCase());
    setHabilidades(a => (a.some(h => h.nome.toLowerCase() === n.toLowerCase()) ? a : [...a, { nome: n, tempo: '' }]));
    setNovaHabilidade('');
  }

  const nomeFinal = nome.trim();
  const podeGravar = !!nomeFinal && !lendo;

  /** Grava no gesto: a gaveta fecha e a linha entra na lista agora. Quem pinta
   *  e desfaz no erro é a página. */
  function cadastrar() {
    if (!podeGravar) return;
    leitura.current++;
    onCadastrar({ nome: nomeFinal, campos, habilidades });
    fechar();
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel largura={painel.largura} arrastando={painel.arrastando}
        setArrastando={painel.setArrastando} porTecla={painel.porTecla} />
      <div className="admin-modal painel-gaveta" style={{ width: `min(${painel.largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">NOVO CANDIDATO</p>
            <input className="painel-titulo painel-titulo-campo" value={nome} autoFocus
              aria-label="Nome do candidato"
              onFocus={e => e.currentTarget.select()}
              onChange={e => { tocados.current.add('nome'); setNome(e.target.value); }} />
          </div>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>

        <div className="admin-modal-body candidato-corpo">
          <input ref={seletor} type="file" accept="application/pdf,image/*" style={{ display: 'none' }}
            onChange={e => { void receber(e.target.files); e.target.value = ''; }} />

          {/* A mesma área é o convite a soltar o arquivo e, depois, o arquivo
              solto: troca de cara sem mudar de lugar. */}
          {arquivo ? (
            <div className="analise-anexo candidato-arquivo troca" key="arquivo">
              <span className="analise-anexo-icone">
                {arquivo.tipo === 'application/pdf' ? <IconDoc size={14} /> : <IconImage size={14} />}
              </span>
              <span className="analise-anexo-nome" title={arquivo.nome}>{arquivo.nome}</span>
              <span className="analise-anexo-peso">{peso(arquivo.tamanho)}</span>
              <span className="candidato-arquivo-estado">
                {lendo
                  ? <><IconSpinner size={12} /> Lendo o currículo</>
                  : preenchidos != null ? <><IconCheck size={12} /> Lido</> : null}
              </span>
              <button type="button" className="analise-anexo-tirar" aria-label={`Tirar ${arquivo.nome}`}
                onClick={tirarArquivo}>
                <IconTrash size={12} />
              </button>
            </div>
          ) : (
            <button type="button" key="solta"
              className={`analise-solta troca${arrastando ? ' sobre' : ''}`}
              onClick={() => seletor.current?.click()}
              onDragOver={e => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={e => { e.preventDefault(); setArrastando(false); void receber(e.dataTransfer.files); }}>
              <IconSparkles size={14} />
              <span>
                <b>Solte o currículo e a IA preenche a ficha</b>
                <small>PDF ou imagem, até 3 MB. Você confere tudo antes de cadastrar.</small>
              </span>
              <IconUpload size={13} />
            </button>
          )}

          {aviso && <p className="analise-erro surge"><IconAlert size={11} /> {aviso}</p>}
          {preenchidos != null && !lendo && (
            <p className="candidato-lido surge">
              {preenchidos > 0
                ? `${preenchidos} ${preenchidos === 1 ? 'campo preenchido' : 'campos preenchidos'} pelo currículo. Confira antes de cadastrar: o que você já tinha escrito ficou como estava.`
                : 'O currículo não trouxe nada que a ficha ainda não tivesse.'}
            </p>
          )}

          <p className="admin-section-title">Contato</p>
          <div className="candidato-grade">
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" value={campos.email} onChange={e => mudar('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input className="form-input" value={campos.telefone} placeholder="(31) 99999-9999"
                onChange={e => mudar('telefone', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">LinkedIn</label>
              <input className="form-input" value={campos.linkedin} placeholder="https://linkedin.com/in/..."
                onChange={e => mudar('linkedin', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">GitHub</label>
              <input className="form-input" value={campos.github} placeholder="https://github.com/..."
                onChange={e => mudar('github', e.target.value)} />
            </div>
          </div>

          <p className="admin-section-title">Perfil</p>
          <div className="form-group">
            <label className="form-label">Interesse</label>
            <input className="form-input" value={campos.interesse} placeholder="Desenvolvedor Backend, Analista de Dados..."
              onChange={e => mudar('interesse', e.target.value)} />
          </div>
          <div className="candidato-grade">
            <Escolha rotulo="Senioridade" valor={campos.senioridade} opcoes={SENIORIDADES}
              onChange={v => mudar('senioridade', v)} />
            <Escolha rotulo="Experiência" valor={campos.tempo_experiencia} opcoes={EXPERIENCIAS}
              onChange={v => mudar('tempo_experiencia', v)} />
            <Escolha rotulo="Inglês" valor={campos.nivel_ingles} opcoes={NIVEIS_DE_INGLES}
              onChange={v => mudar('nivel_ingles', v)} />
            <div className="form-group">
              <label className="form-label">Outro idioma</label>
              <input className="form-input" value={campos.outro_idioma} placeholder="Espanhol intermediário"
                onChange={e => mudar('outro_idioma', e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Habilidades</label>
            {habilidades.length > 0 && (
              <ul className="candidato-habs lista-anima" key={habilidades.map(h => h.nome).join('|')}>
                {habilidades.map(h => (
                  <li key={h.nome} className="candidato-hab">
                    <span>{h.nome}</span>
                    {h.tempo && <small>{h.tempo}</small>}
                    <button type="button" aria-label={`Tirar ${h.nome}`}
                      onClick={() => {
                        tocados.current.add('habilidades');
                        removidas.current.add(h.nome.toLowerCase());
                        setHabilidades(a => a.filter(x => x.nome !== h.nome));
                      }}>
                      <IconX size={10} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="candidato-hab-nova">
              <input className="form-input" value={novaHabilidade} placeholder="Acrescentar habilidade"
                onChange={e => setNovaHabilidade(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarHabilidade(); } }} />
              <button type="button" className="modal-acao" disabled={!novaHabilidade.trim()}
                onClick={adicionarHabilidade}>
                <IconPlus size={12} /> Acrescentar
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Resumo profissional</label>
            <CampoTexto valor={campos.resumo} onMudar={v => mudar('resumo', v)} linhas={3} alturaMaxima={240}
              placeholder="O que a pessoa faz, em que tipo de projeto e com que tecnologias" />
          </div>
          <div className="form-group">
            <label className="form-label">Case de sucesso</label>
            <CampoTexto valor={campos.case_sucesso} onMudar={v => mudar('case_sucesso', v)} linhas={2} alturaMaxima={200}
              placeholder="Uma entrega concreta, com o resultado" />
          </div>

          <p className="admin-section-title">Onde e como</p>
          <div className="candidato-grade">
            <div className="form-group">
              <label className="form-label">Cidade</label>
              <input className="form-input" value={campos.cidade} onChange={e => mudar('cidade', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">UF</label>
              <input className="form-input" value={campos.uf} maxLength={2} placeholder="MG"
                onChange={e => mudar('uf', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            </div>
            <div className="form-group">
              <label className="form-label">Nascimento</label>
              <input className="form-input" value={nascimentoBr} placeholder="dd/mm/aaaa" inputMode="numeric"
                onChange={e => {
                  const v = mascaraData(e.target.value);
                  setNascimentoBr(v);
                  mudar('nascimento', brParaIso(v));
                }} />
            </div>
            <Escolha rotulo="Sexo" valor={campos.sexo} opcoes={SEXOS} onChange={v => mudar('sexo', v)} />
            <Escolha rotulo="Modelo de trabalho" valor={campos.modelo_trabalho} opcoes={MODELOS}
              onChange={v => mudar('modelo_trabalho', v)} />
            <Escolha rotulo="Contratação" valor={campos.contratacao} opcoes={CONTRATACOES}
              onChange={v => mudar('contratacao', v)} />
            <div className="form-group">
              <label className="form-label">Possui CNPJ</label>
              <SelectSistema<string> valor={campos.possui_cnpj} onChange={v => mudar('possui_cnpj', v)}
                placeholder="Não informado"
                opcoes={[{ valor: '', label: 'Não informado' }, { valor: 'sim', label: 'Sim' }, { valor: 'nao', label: 'Não' }]} />
            </div>
          </div>
          {regime.montado && (
            <div className={`revelar${regime.aberto ? ' aberto' : ''}`}>
              <div>
                <div className="candidato-grade">
                  <Escolha rotulo="Regime fiscal" valor={campos.regime_fiscal} opcoes={REGIMES}
                    onChange={v => mudar('regime_fiscal', v)} />
                </div>
              </div>
            </div>
          )}

          <p className="admin-section-title">De onde veio</p>
          <div className="candidato-grade">
            <div className="form-group">
              <label className="form-label">Origem</label>
              <SelectSistema<string> valor={campos.origem} onChange={v => mudar('origem', v)}
                opcoes={ORIGENS.map(o => ({ valor: o, label: o }))} />
            </div>
          </div>
          {indicacao.montado && (
            <div className={`revelar${indicacao.aberto ? ' aberto' : ''}`}>
              <div>
                <div className="form-group">
                  <label className="form-label">Indicado por</label>
                  <input className="form-input" value={campos.indicado_por}
                    onChange={e => mudar('indicado_por', e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Observações</label>
            <CampoTexto valor={campos.observacoes} onMudar={v => mudar('observacoes', v)} linhas={2} alturaMaxima={200}
              placeholder="O que não cabe nos campos acima" />
          </div>
        </div>

        <div className="painel-rodape">
          <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!podeGravar} onClick={cadastrar}>
            <IconCheck size={14} /> Cadastrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** O corpo que vai para `criar_talento_externo`, com o estado escrito por
 *  extenso e o CNPJ como o banco o guarda. */
export function corpoDoCandidato(n: CandidatoNovo) {
  const { possui_cnpj, ...resto } = n.campos;
  return {
    action: 'criar_talento_externo',
    nome: n.nome,
    ...resto,
    regime_fiscal: possui_cnpj === 'sim' ? resto.regime_fiscal : '',
    indicado_por: resto.origem === 'Indicação' ? resto.indicado_por : '',
    estado: ESTADOS[resto.uf] ?? '',
    possui_cnpj: possui_cnpj === 'sim' ? 1 : possui_cnpj === 'nao' ? 0 : null,
    habilidades: n.habilidades,
  };
}
