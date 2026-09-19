// ─────────────────────────────────────────────────────────────────────────────
//  Os objetivos da semana de quem está logado.
//
//  São duas formas da mesma lista:
//
//  1. O balão: o alvo ao lado do inbox abre a mesma gaveta dele, com o mesmo
//     desenho, e ela fecha com clique fora, como todo dropdown da casa.
//  2. A coluna: fixado pelo alfinete, o quadro vira uma coluna à direita da
//     tela, o espelho do menu de navegação preso à esquerda. Ela ocupa lugar
//     no layout - o conteúdo encolhe para caber ao lado dela, em vez de ficar
//     por baixo -, acompanha a troca de tela e volta aberta ao recarregar.
//
//  Os objetivos são os da Planning desta semana em que a pessoa é responsável,
//  de todos os projetos, agrupados por projeto. O recorte é do servidor: cada
//  um vê só os seus. O balão do alvo conta os que ainda estão em aberto, e não
//  é vermelho como o do inbox - objetivo é o combinado da semana, e não um
//  aviso que pede resposta agora.
//
//  Na própria lista, o objetivo se marca como feito, e aí pede a prova - um
//  arquivo, arrastado, escolhido ou colado com Ctrl+V -, e se edita: o texto
//  e a data de entrega. Tudo pinta na hora e volta atrás se o servidor
//  recusar. Clicar no texto leva à Planning, na folha do projeto e na semana.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconAlfinete, IconCheck, IconClip, IconEdit, IconRamificar, IconTarget, IconUpload,
  IconX,
} from './icons';
import { DatePicker } from './DatePicker';
import { SeletorPessoas } from './SeletorPessoas';
import type { Pessoa } from '../admin/FormularioTarefa';
import { LogoDoCliente } from './LogoDoCliente';
import { AlternarDesejavel, ChipDesejavel } from './ChipDesejavel';
import { AcaoDoObjetivo, ICONE_DA_ACAO } from './AcaoDoObjetivo';
import { MarcoDeStatus } from './MarcoDeStatus';
import { diaEMes, segundaDaData, sextaDaSemana } from '../lib/semanaDoObjetivo';
import {
  COR_OBJETIVO, ICONE_OBJETIVO, OPCOES_DO_OBJETIVO, marcasDoStatus, statusDoObjetivo,
  type StatusDoObjetivo,
} from '../lib/statusDoObjetivo';
import { Dialogo } from './Dialogo';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorarCaixa } from '../lib/ancorar';
import { arquivosColados } from '../lib/colarArquivos';
import { useToast } from '../lib/toast';

export interface MeuObjetivo {
  projeto_id: string;
  projeto_nome: string;
  /** Se o projeto tem divisória própria na Planning (em andamento). */
  na_divisoria: boolean;
  cliente: string | null;
  id: string;
  texto: string;
  feito: boolean;
  /** Em curso: o meio entre fazer e feito. Ver `statusDoObjetivo`. */
  fazendo?: boolean;
  prazo: string | null;
  provas: number;
  /** O objetivo de que este nasceu (a validação que pediu os ajustes). */
  pai?: string | null;
  /** A frase da mãe: quem não responde por ela vê o filho sozinho, e a frase
   *  diz de onde ele veio. */
  pai_texto?: string | null;
  /** Quem responde pelo objetivo (ids de usuário). */
  responsaveis?: string[];
  /** Não obrigatório, mas de grande valor se sair. */
  desejavel?: boolean;
}

const LARGURA = 380;
const ALTURA = 460;
/** A largura da coluna fixada. Mais estreita que o balão: ela divide a tela
 *  com a página inteira, e não aparece por cima dela. */
export const LARGURA_DA_COLUNA = 320;
/** A lista muda devagar - quem mexe nela está na Planning, que avisa quando
 *  grava. A releitura de fundo só mantém o balão honesto numa aba esquecida
 *  aberta o dia todo. */
const RELEITURA_MS = 5 * 60_000;

/** A segunda-feira desta semana, no fuso de quem lê, como a Planning grava. */
export function segundaDestaSemana(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Fixado ou não ───────────────────────────────────────────────────────────

/** Onde a escolha de fixar fica guardada, neste navegador. É preferência de
 *  quem usa, e não dado da casa. */
const CHAVE_FIXADO = 'objetivos:fixado';

export function lerFixado(): boolean {
  try { return localStorage.getItem(CHAVE_FIXADO) === '1'; } catch { return false; }
}

export function gravarFixado(v: boolean) {
  try {
    if (v) localStorage.setItem(CHAVE_FIXADO, '1');
    else localStorage.removeItem(CHAVE_FIXADO);
  } catch { /* sem armazenamento: vale só até recarregar */ }
}

// ── Os dados ────────────────────────────────────────────────────────────────

/** O que muda num objetivo. `provas` vai junto de `feito: true`: é o arquivo
 *  que sustenta o feito. */
export interface MudancaDeObjetivo {
  texto?: string;
  prazo?: string | null;
  responsaveis?: string[];
  desejavel?: boolean;
  feito?: boolean;
  fazendo?: boolean;
  provas?: File[];
}

/** O teto de uma prova: o mesmo do anexo de comentário, e o do servidor. */
const LIMITE_DE_PROVA = 8 * 1024 * 1024;

export interface ObjetivosCarregados {
  objetivos: MeuObjetivo[] | null;
  erro: string;
  semana: string;
  recarregar: () => void;
  /** Muda a lista na tela, antes (e sem) o servidor responder: é como o gesto
   *  pinta na hora, e como ele volta atrás quando é recusado. */
  alterarLocal: (projetoId: string, id: string, mudanca: Partial<MeuObjetivo>) => void;
  /** A lista inteira, para o que não é mudar um objetivo: um que nasce, um
   *  provisório que sai. */
  mudarLista: (f: (lista: MeuObjetivo[]) => MeuObjetivo[]) => void;
}

/**
 * A lista, lida e relida. Um gancho só para o balão e a coluna: as duas formas
 * mostram a mesma coisa, e duas leituras paralelas poderiam discordar por um
 * instante na troca de uma para a outra.
 */
export function useMeusObjetivos(
  listar: (semana: string) => Promise<{ objetivos?: MeuObjetivo[]; error?: string }>,
): ObjetivosCarregados {
  const [objetivos, setObjetivos] = useState<MeuObjetivo[] | null>(null);
  const [erro, setErro] = useState('');
  const [semana, setSemana] = useState(segundaDestaSemana);

  const recarregar = useCallback(async () => {
    // A semana é recalculada a cada leitura: a aba aberta desde sexta mostra
    // a semana nova na segunda, em vez da que já acabou.
    const agora = segundaDestaSemana();
    setSemana(agora);
    try {
      const r = await listar(agora);
      if (r?.error) { setErro(r.error); return; }
      setErro('');
      setObjetivos(r?.objetivos ?? []);
    } catch {
      setErro('Não foi possível carregar os objetivos.');
    }
  }, [listar]);

  // A primeira leitura vem com a casca: é ela que acende o balão.
  useEffect(() => { void recarregar(); }, [recarregar]);
  useEffect(() => {
    const talvez = () => { if (document.visibilityState === 'visible') void recarregar(); };
    const intervalo = window.setInterval(talvez, RELEITURA_MS);
    document.addEventListener('visibilitychange', talvez);
    // A Planning avisa quando grava: marcar um objetivo como feito lá reflete
    // aqui na hora. O nome do evento é o de `ProjetosPage`
    // (`EVENTO_PLANNING_GRAVADA`), escrito à mão para o cabeçalho não carregar
    // a página inteira de Projetos só para lê-lo.
    const gravou = () => { void recarregar(); };
    window.addEventListener('planning:gravada', gravou);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', talvez);
      window.removeEventListener('planning:gravada', gravou);
    };
  }, [recarregar]);

  const alterarLocal = useCallback((projetoId: string, id: string, mudanca: Partial<MeuObjetivo>) => {
    setObjetivos(lista => lista && lista.map(o => (o.projeto_id === projetoId && o.id === id ? { ...o, ...mudanca } : o)));
  }, []);

  const mudarLista = useCallback((f: (lista: MeuObjetivo[]) => MeuObjetivo[]) => {
    setObjetivos(lista => (lista ? f(lista) : lista));
  }, []);

  return { objetivos, erro, semana, recarregar: () => { void recarregar(); }, alterarLocal, mudarLista };
}

// ── Peças comuns ────────────────────────────────────────────────────────────

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "15 a 19 de set", ou "29 de set a 3 de out" quando a semana vira o mês. */
function faixaDaSemana(segunda: string): string {
  const [a, m, d] = segunda.split('-').map(Number);
  const ini = new Date(a, m - 1, d);
  const fim = new Date(a, m - 1, d + 4);
  return ini.getMonth() === fim.getMonth()
    ? `${ini.getDate()} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`
    : `${ini.getDate()} de ${MESES[ini.getMonth()]} a ${fim.getDate()} de ${MESES[fim.getMonth()]}`;
}

/** O prazo como a linha mostra, e se ele já passou. */
function lerPrazo(prazo: string | null, feito: boolean): { texto: string; vencido: boolean } | null {
  if (!prazo) return null;
  const [a, m, d] = prazo.split('-').map(Number);
  const dia = new Date(a, m - 1, d);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const rotulo = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
  const vencido = !feito && dia < hoje;
  return { texto: vencido ? `venceu ${rotulo}` : `até ${rotulo}`, vencido };
}

function contagem(objetivos: MeuObjetivo[] | null) {
  const total = objetivos?.length ?? 0;
  const feitos = (objetivos ?? []).filter(o => o.feito).length;
  // O balão do alvo conta o que ainda cobra alguém: o desejável em aberto não
  // é obrigatório, e por isso fica de fora dele (continua no "x de y feitos").
  const abertos = (objetivos ?? []).filter(o => !o.feito && !o.desejavel).length;
  return { total, feitos, abertos };
}

/** O topo das duas formas: título, semana, quantos feitos e o alfinete. */
function Topo({ dados, fixado, onAlfinete }: {
  dados: ObjetivosCarregados;
  fixado: boolean;
  /** Ausente, o alfinete não aparece. */
  onAlfinete?: () => void;
}) {
  const { total, feitos } = contagem(dados.objetivos);
  return (
    <div className="inbox-topo">
      <div style={{ minWidth: 0 }}>
        <p className="inbox-titulo">Seus objetivos da semana</p>
        <p className="objetivos-sub">{faixaDaSemana(dados.semana)}</p>
      </div>
      <span className="objetivos-topo-direita">
        {total > 0 && (
          <span className="objetivos-contagem troca" key={`${feitos}/${total}`}>
            {feitos} de {total} feito{total === 1 ? '' : 's'}
          </span>
        )}
        {onAlfinete && <button type="button" className={`objetivos-fixar${fixado ? ' ligado' : ''}`}
          onClick={onAlfinete} aria-pressed={fixado}
          aria-label={fixado ? 'Desafixar o quadro' : 'Fixar o quadro'}
          title={fixado
            ? 'Desafixar: o quadro volta a ser um balão que fecha ao clicar fora'
            : 'Fixar: o quadro vira uma coluna à direita da tela'}>
          <IconAlfinete size={14} />
        </button>}
      </span>
    </div>
  );
}

/** O tamanho de um arquivo, para quem lê. */
function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * A caixa que marca como feito. A prova é opcional: quem tem o print anexa
 * ali mesmo, e quem não tem marca do mesmo jeito. Um print entra arrastado,
 * escolhido ou colado com Ctrl+V - a colagem é ouvida na janela inteira,
 * porque o foco raramente está onde se imagina.
 */
function CaixaDaProva({ objetivo, onFechar, onConfirmar }: {
  objetivo: MeuObjetivo;
  onFechar: () => void;
  onConfirmar: (arquivos: File[]) => void;
}) {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  // O `Dialogo` confirma depois da animação de saída; o que foi escolhido vai
  // por aqui, e não pelo estado de quando o clique aconteceu.
  const escolhidos = useRef<File[]>([]);
  escolhidos.current = arquivos;

  const somar = useCallback((lista: File[]) => {
    const grandes = lista.filter(f => f.size > LIMITE_DE_PROVA);
    const cabem = lista.filter(f => f.size <= LIMITE_DE_PROVA);
    setErro(grandes.length
      ? `"${grandes[0].name}" passa de 8 MB. Mande um recorte ou um arquivo menor.`
      : '');
    if (cabem.length) setArquivos(a => [...a, ...cabem].slice(0, 5));
  }, []);

  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const colados = arquivosColados(e.clipboardData);
      if (!colados.length) return;
      e.preventDefault();
      somar(colados);
    };
    window.addEventListener('paste', colar);
    return () => window.removeEventListener('paste', colar);
  }, [somar]);

  return (
    <Dialogo
      titulo="Marcar como feito"
      descricao={<>Se tiver, anexe a evidência de que <strong>{objetivo.texto}</strong> foi cumprido.</>}
      rotuloOk="Marcar como feito"
      perigo={false}
      zIndex={10060}
      largura={440}
      onFechar={onFechar}
      onConfirmar={() => onConfirmar(escolhidos.current)}
    >
      <div className="objetivos-prova">
      <div
        className={`objetivos-prova-area${arrastando ? ' arrastando' : ''}`}
        role="button" tabIndex={0}
        onClick={() => entrada.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault();
          setArrastando(false);
          somar([...(e.dataTransfer?.files ?? [])]);
        }}>
        <IconUpload size={18} />
        <b>Anexe a evidência <span className="objetivos-prova-opcional">(opcional)</span></b>
        <span>Arraste, cole um print com Ctrl+V ou clique para escolher</span>
      </div>
      <input ref={entrada} type="file" multiple hidden
        onChange={e => { somar([...(e.target.files ?? [])]); e.target.value = ''; }} />
      {arquivos.length > 0 && (
        <ul className="objetivos-prova-arquivos lista-anima" key={arquivos.map(f => f.name).join('|')}>
          {arquivos.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <IconClip size={12} />
              <span className="objetivos-prova-nome" title={f.name}>{f.name}</span>
              <span className="objetivos-prova-tamanho">{tamanhoLegivel(f.size)}</span>
              <button type="button" className="objetivos-prova-tirar" aria-label={`Tirar ${f.name}`}
                onClick={() => setArquivos(a => a.filter((_, k) => k !== i))}>
                <IconX size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="objetivos-prova-erro surge">{erro}</p>}
      </div>
    </Dialogo>
  );
}

/**
 * O texto, a data e os responsáveis de um objetivo, editados no lugar dele. A
 * mesma área troca de cara - leitura vira campo -, e por isso entra em
 * `.troca`. Enter grava, Escape desiste.
 *
 * É aqui também que um objetivo ganha desdobramentos: criar ramo é gesto de
 * quem está mexendo no objetivo, e não um botão a mais na linha de leitura.
 * O campo do desdobramento fica aberto depois de criar, para listar vários
 * ajustes seguidos.
 */
function EdicaoDoObjetivo({ objetivo, pessoas, onGravar, onDesistir, onDesdobrar }: {
  objetivo: MeuObjetivo;
  /** Quem pode responder pelo objetivo: as pessoas do portal, como na Planning. */
  pessoas: Pessoa[];
  onGravar: (texto: string, prazo: string | null, responsaveis: string[], desejavel: boolean) => void;
  onDesistir: () => void;
  onDesdobrar: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(objetivo.texto);
  const [desejavel, setDesejavel] = useState(!!objetivo.desejavel);
  const [prazo, setPrazo] = useState(objetivo.prazo ?? '');
  const [responsaveis, setResponsaveis] = useState<string[]>(objetivo.responsaveis ?? []);
  const [ramoAberto, setRamoAberto] = useState(false);
  const [ramo, setRamo] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  const campoDoRamo = useRef<HTMLInputElement>(null);
  // O foco vai por efeito, e não por `autoFocus`: a troca é animada, e o foco
  // na montagem rolaria a lista antes de o campo estar no lugar.
  useEffect(() => { campo.current?.focus(); campo.current?.select(); }, []);
  useEffect(() => { if (ramoAberto) campoDoRamo.current?.focus(); }, [ramoAberto]);
  const gravar = () => { if (texto.trim()) onGravar(texto.trim(), prazo || null, responsaveis, desejavel); };
  const criarRamo = () => {
    if (!ramo.trim()) return;
    onDesdobrar(ramo.trim());
    setRamo('');
    campoDoRamo.current?.focus();
  };

  return (
    <div className="objetivos-edicao troca">
      <input ref={campo} className="form-input" value={texto} aria-label="Texto do objetivo"
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); gravar(); }
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDesistir(); }
        }} />
      <div className="objetivos-edicao-linha">
        {/* A data e as pessoas, nos mesmos chips da linha da Planning: o X do
            chip de data é o que a tira, e as fotos abrem a lista de quem
            responde. */}
        <DatePicker value={prazo} onChange={setPrazo} chip allowPast required
          titulo="Data de entrega. Uma data de outra semana leva o objetivo para ela." />
        <SeletorPessoas compacto pessoas={pessoas} valor={responsaveis} onChange={setResponsaveis}
          vazio="Quem responde por este objetivo" />
        <AlternarDesejavel ligado={desejavel} onChange={setDesejavel} />
        <span className="objetivos-edicao-acoes">
          <button type="button" className="objetivos-edicao-desistir" onClick={onDesistir}>Cancelar</button>
          <button type="button" className="objetivos-edicao-gravar" disabled={!texto.trim()} onClick={gravar}>
            <IconCheck size={12} /> Salvar
          </button>
        </span>
      </div>

      {/* O desdobramento: um convite discreto, que vira campo quando chamado.
          A mesma área troca de cara, e por isso `.troca`. */}
      {ramoAberto ? (
        <div className="objetivos-edicao-ramo troca" key="campo">
          <span className="objetivos-edicao-ramo-icone" aria-hidden="true"><IconRamificar size={13} /></span>
          <input ref={campoDoRamo} className="form-input" value={ramo}
            placeholder="O que ficou para fazer"
            aria-label={`Desdobramento de "${objetivo.texto}"`}
            onChange={e => setRamo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); criarRamo(); }
              // Escape aqui fecha só o campo do ramo, e não a edição inteira.
              if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setRamo(''); setRamoAberto(false); }
            }} />
          <button type="button" className="objetivos-edicao-gravar" disabled={!ramo.trim()} onClick={criarRamo}>
            Criar
          </button>
        </div>
      ) : (
        <button type="button" className="objetivos-edicao-convite troca" key="convite"
          onClick={() => setRamoAberto(true)}>
          <IconRamificar size={12} /> Adicionar desdobramento
        </button>
      )}
    </div>
  );
}

/** Os objetivos de um projeto em famílias: cada objetivo solto e os que
 *  nasceram dele. O filho cuja mãe não está na lista (ela é de outra pessoa)
 *  sobe solto, e a linha dele diz de onde veio. Os abertos primeiro. */
function familiasDoProjeto(lista: MeuObjetivo[]): { mae: MeuObjetivo; filhos: MeuObjetivo[] }[] {
  const ids = new Set(lista.map(o => o.id));
  const abertosPrimeiro = (a: MeuObjetivo, b: MeuObjetivo) => Number(a.feito) - Number(b.feito);
  const familias: { mae: MeuObjetivo; filhos: MeuObjetivo[] }[] = lista
    .filter(o => !o.pai)
    .map(mae => ({ mae, filhos: lista.filter(f => f.pai === mae.id).sort(abertosPrimeiro) }));
  // Os desdobramentos cuja mãe é de outra pessoa andam juntos: o primeiro,
  // na ordem da Planning, puxa a fila, e os irmãos abrem pelo ramo dele. A
  // ordem da Planning, e não a de feitos, para a cabeça não trocar quando um
  // irmão é marcado - a família aberta fecharia sozinha.
  const soltos = new Map<string, MeuObjetivo[]>();
  for (const o of lista) {
    if (o.pai && !ids.has(o.pai)) soltos.set(o.pai, [...(soltos.get(o.pai) ?? []), o]);
  }
  for (const [, [cabeca, ...irmaos]] of soltos) familias.push({ mae: cabeca, filhos: irmaos.sort(abertosPrimeiro) });
  return familias.sort((a, b) => abertosPrimeiro(a.mae, b.mae));
}

/** A lista, agrupada por projeto. A mesma nas duas formas. */
function ListaDeObjetivos({ dados, pessoas, onIr, onAtualizar, onDesdobrar, onPrender }: {
  dados: ObjetivosCarregados;
  pessoas: Pessoa[];
  onIr: (o: MeuObjetivo) => void;
  onAtualizar: (o: MeuObjetivo, mudanca: MudancaDeObjetivo) => Promise<{ error?: string } | null>;
  /** Cria o objetivo que nasce de `mae`. Devolve o que o servidor gravou. */
  onDesdobrar: (mae: MeuObjetivo, texto: string) => Promise<{ error?: string; objetivo?: { id: string; responsaveis?: string[] } }>;
  /** Uma edição ou a caixa da prova estão abertas: o balão não pode fechar
   *  com o clique no calendário ou na caixa, que moram fora dele. */
  onPrender?: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { objetivos, erro } = dados;
  const [editando, setEditando] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState<MeuObjetivo | null>(null);
  /** As famílias abertas, pela chave da mãe. Os desdobramentos nascem
   *  recolhidos: a lista da semana mostra primeiro o que foi combinado. */
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());
  /** As que já abriram uma vez. O conteúdo delas fica montado depois de
   *  recolher, que é o que deixa a animação de fechar acontecer. */
  const jaAbertas = useRef(new Set<string>());
  const chaveDe = (o: MeuObjetivo) => `${o.projeto_id}:${o.id}`;

  useEffect(() => { onPrender?.(!!editando || !!concluindo); }, [editando, concluindo]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternarFamilia = (chave: string) => setAbertas(atual => {
    const nova = new Set(atual);
    if (nova.has(chave)) nova.delete(chave); else nova.add(chave);
    return nova;
  });

  /** O desdobramento entra na hora, com um id provisório, e troca para o de
   *  verdade quando o servidor responde. Recusado, ele sai. A família dele
   *  abre, para quem acabou de criar ver o que criou. */
  async function desdobrar(origem: MeuObjetivo, texto: string) {
    const lista = dados.objetivos ?? [];
    // A família que recebe o novo: a da mãe, ou, se ela é de outra pessoa, a
    // dos irmãos soltos, que abre pelo primeiro deles.
    const cabeca = familiasDoProjeto(lista.filter(x => x.projeto_id === origem.projeto_id))
      .find(f => f.mae.id === origem.id || f.filhos.some(x => x.id === origem.id))?.mae;
    if (cabeca) setAbertas(atual => new Set(atual).add(chaveDe(cabeca)));
    const provisorio = `novo-${Date.now()}`;
    const novo: MeuObjetivo = {
      projeto_id: origem.projeto_id, projeto_nome: origem.projeto_nome, na_divisoria: origem.na_divisoria,
      cliente: origem.cliente, id: provisorio, texto, feito: false, prazo: sextaDaSemana(dados.semana), provas: 0,
      responsaveis: origem.responsaveis,
      pai: origem.pai ?? origem.id, pai_texto: origem.pai ? origem.pai_texto ?? null : origem.texto,
    };
    dados.mudarLista(l => [...l, novo]);
    const r = await onDesdobrar(origem, texto).catch(() => ({ error: 'A conexão caiu. Tente de novo.' } as { error?: string; objetivo?: { id: string } }));
    if (r.error || !r.objetivo?.id) {
      dados.mudarLista(l => l.filter(x => !(x.projeto_id === novo.projeto_id && x.id === provisorio)));
      toast('error', 'Não foi possível desdobrar o objetivo', r.error ?? 'O servidor não confirmou.');
      return;
    }
    const real = r.objetivo.id;
    dados.mudarLista(l => l.map(x => (x.projeto_id === novo.projeto_id && x.id === provisorio ? { ...x, id: real } : x)));
  }

  /** Pinta na hora, manda, e volta ao que era se o servidor recusar. */
  async function aplicar(o: MeuObjetivo, mudanca: MudancaDeObjetivo, pintura: Partial<MeuObjetivo>, erroTitulo: string) {
    const antes: Partial<MeuObjetivo> = {};
    for (const k of Object.keys(pintura) as (keyof MeuObjetivo)[]) (antes as any)[k] = o[k];
    dados.alterarLocal(o.projeto_id, o.id, pintura);
    const r = await onAtualizar(o, mudanca).catch(() => ({ error: 'A conexão caiu. Tente de novo.' }));
    if (r?.error) {
      dados.alterarLocal(o.projeto_id, o.id, antes);
      toast('error', erroTitulo, r.error);
      return false;
    }
    return true;
  }

  // Por projeto, na ordem em que os projetos aparecem pela primeira vez.
  const grupos = useMemo(() => {
    const mapa = new Map<string, MeuObjetivo[]>();
    for (const o of objetivos ?? []) {
      mapa.set(o.projeto_id, [...(mapa.get(o.projeto_id) ?? []), o]);
    }
    return [...mapa.values()];
  }, [objetivos]);

  // A assinatura da lista remonta os itens e faz a entrada tocar. Com uma
  // edição aberta ela congela: a remontagem apagaria o que está sendo digitado.
  const assinatura = (objetivos ?? []).map(o => `${chaveDe(o)}:${o.feito}`).join('|');
  const chaveCongelada = useRef(assinatura);
  if (!editando) chaveCongelada.current = assinatura;

  /** Uma linha de objetivo: a mãe ou um filho, com as mesmas ações. */
  function linha(o: MeuObjetivo, filha: boolean, filhos: MeuObjetivo[] = []) {
    const prazo = lerPrazo(o.prazo, o.feito);
    const emEdicao = editando === chaveDe(o);
    const soltoDeOutraMae = !filha && !!o.pai;
    const chaveDaFamilia = chaveDe(o);
    const familiaAberta = abertas.has(chaveDaFamilia);
    /** O ramo só existe onde há o que abrir: o objetivo com desdobramentos, ou
     *  o desdobramento solto (a mãe é de outra pessoa) com irmãos, os outros
     *  que nasceram da mesma mãe. Sem nenhum, a linha não tem ramo - nem no
     *  hover -, e o desdobramento se cria pelo lápis. */
    const temRamos = !filha && filhos.length > 0;
    return (
      <li key={chaveDe(o)} className={`objetivos-linha${o.feito ? ' feito' : ''}${filha ? ' filha' : ''}`}>
        {/* O status no marco das entregas. Feito passa pela caixa, que aceita
            uma prova; fazer e fazendo mudam direto. Voltar de feito também é
            direto: a prova anexada continua lá. */}
        <span className="objetivos-marca">
          <MarcoDeStatus status={statusDoObjetivo(o)} opcoes={OPCOES_DO_OBJETIVO}
            cores={COR_OBJETIVO} icones={ICONE_OBJETIVO} nome={`Status de "${o.texto}"`}
            onEscolher={v => {
              const s = v as StatusDoObjetivo;
              if (s === statusDoObjetivo(o)) return;
              if (s === 'Feito') {
                setEditando(null);
                setConcluindo(o);
                return;
              }
              const marcas = marcasDoStatus(s);
              void aplicar(o, marcas, marcas, 'Não foi possível mudar o status');
            }} />
        </span>
        {emEdicao ? (
          <EdicaoDoObjetivo objetivo={o} pessoas={pessoas}
            onDesistir={() => setEditando(null)}
            onDesdobrar={texto => { void desdobrar(o, texto); }}
            onGravar={(texto, novoPrazo, novosDonos, novoDesejavel) => {
              setEditando(null);
              const antes = [...(o.responsaveis ?? [])].sort().join('|');
              const trocouDonos = [...novosDonos].sort().join('|') !== antes;
              const trocouDesejavel = novoDesejavel !== !!o.desejavel;
              // A data não se apaga: vazia, fica a que estava.
              const trocouPrazo = !!novoPrazo && novoPrazo !== o.prazo;
              if (texto === o.texto && !trocouPrazo && !trocouDonos && !trocouDesejavel) return;
              const mudanca: MudancaDeObjetivo = {
                texto,
                ...(trocouPrazo ? { prazo: novoPrazo } : {}),
                ...(trocouDonos ? { responsaveis: novosDonos } : {}),
                ...(trocouDesejavel ? { desejavel: novoDesejavel } : {}),
              };
              // Data de outra semana leva o objetivo para ela: ele sai desta
              // lista na hora, e volta se o servidor recusar.
              if (trocouPrazo && novoPrazo && segundaDaData(novoPrazo) !== dados.semana) {
                const chave = chaveDe(o);
                dados.mudarLista(l => l.filter(x => chaveDe(x) !== chave));
                void onAtualizar(o, mudanca)
                  .catch(() => ({ error: 'A conexão caiu. Tente de novo.' }))
                  .then(r => {
                    if (r?.error) {
                      dados.recarregar();
                      toast('error', 'Não foi possível mudar a semana', r.error);
                      return;
                    }
                    toast('success', 'Objetivo levado de semana',
                      `"${texto}" foi para a semana de ${diaEMes(segundaDaData(novoPrazo))}.`);
                  });
                return;
              }
              void aplicar(o, mudanca, {
                texto, prazo: trocouPrazo ? novoPrazo : o.prazo, responsaveis: novosDonos, desejavel: novoDesejavel,
              }, 'Não foi possível salvar o objetivo').then(ok => {
                // Quem trocou os donos pode ter saído deles: a lista relê, e o
                // objetivo que deixou de ser seu sai dela.
                if (ok && trocouDonos) dados.recarregar();
              });
            }} />
        ) : (
          <>
            <button type="button" className="objetivos-item troca" title="Abrir na Planning"
              onClick={() => onIr(o)}>
              <span className="objetivos-texto">
                <span className="objetivos-frase">{o.texto}</span>
                {o.desejavel && <span className="objetivos-desejavel"><ChipDesejavel /></span>}
                {soltoDeOutraMae && o.pai_texto && (
                  <span className="objetivos-origem" title={`Desdobramento de "${o.pai_texto}"`}>
                    <IconRamificar size={11} /> de: {o.pai_texto}
                  </span>
                )}
                {(prazo || o.provas > 0) && (
                  <span className="objetivos-rodape">
                    {prazo && (
                      <span className={prazo.vencido ? 'objetivos-vencido' : undefined}>{prazo.texto}</span>
                    )}
                    {o.provas > 0 && (
                      <span className="objetivos-provas">
                        <IconClip size={11} /> {o.provas === 1 ? '1 prova' : `${o.provas} provas`}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="sr-only">{o.feito ? '(feito)' : '(em aberto)'}</span>
            </button>
            {/* O ramo abre o objetivo e mostra os desdobramentos. Fica à
                vista, com a contagem: esconder que eles existem seria pedir que
                alguém passasse o mouse em cada linha para descobrir. */}
            {temRamos && (
              <AcaoDoObjetivo
                className={`objetivos-ramos-botao${familiaAberta ? ' aberto' : ''}`}
                aria-expanded={familiaAberta}
                rotulo={`${familiaAberta ? 'Recolher' : 'Mostrar'} ${soltoDeOutraMae ? 'os outros desdobramentos' : 'os desdobramentos'} de "${soltoDeOutraMae ? o.pai_texto ?? o.texto : o.texto}"`}
                title={`${familiaAberta ? 'Recolher' : 'Mostrar'} ${soltoDeOutraMae ? 'os outros desdobramentos' : 'os desdobramentos'}`}
                onClick={() => alternarFamilia(chaveDaFamilia)}>
                <IconRamificar size={ICONE_DA_ACAO} />
                <span>{filhos.filter(f => f.feito).length}/{filhos.length}</span>
              </AcaoDoObjetivo>
            )}
            <button type="button" className="objetivos-editar"
              aria-label={`Editar "${o.texto}"`} title="Editar o objetivo e adicionar desdobramentos"
              onClick={() => setEditando(chaveDe(o))}>
              <IconEdit size={13} />
            </button>
          </>
        )}
      </li>
    );
  }

  if (objetivos == null && !erro) {
    return <div className="dux-spinner-row" style={{ padding: '28px 0' }}><span className="dux-spinner sm" /></div>;
  }
  if (erro && objetivos == null) return <p className="inbox-vazio">{erro}</p>;
  if (!objetivos?.length) {
    return (
      <div className="objetivos-vazio surge">
        <IconTarget size={26} />
        <p>Nenhum objetivo seu nesta semana.</p>
        <span>Os objetivos em que você é responsável na Planning aparecem aqui.</span>
      </div>
    );
  }
  return (
    <>
      <div className="lista-anima" key={chaveCongelada.current}>
        {grupos.map(lista => (
          <section key={lista[0].projeto_id} className="objetivos-grupo">
            {/* A logo do cliente abre o grupo: numa lista de projetos de
                vários clientes, é pela marca que o olho acha o seu. O nome do
                cliente fica só no balão do mouse - a logo já diz quem é, e o
                nome repetido cortava o do projeto. */}
            <p className="objetivos-projeto"
              title={lista[0].cliente ? `${lista[0].projeto_nome} · ${lista[0].cliente}` : lista[0].projeto_nome}>
              {lista[0].cliente && <LogoDoCliente cliente={lista[0].cliente} altura={16} larguraMaxima={56} />}
              <span className="objetivos-projeto-texto">{lista[0].projeto_nome}</span>
            </p>
            <ul className="inbox-itens">
              {familiasDoProjeto(lista).map(({ mae, filhos }) => {
                const chave = chaveDe(mae);
                const aberta = abertas.has(chave);
                if (aberta) jaAbertas.current.add(chave);
                const montada = aberta || jaAbertas.current.has(chave);
                return (
                  <Fragment key={chave}>
                    {linha(mae, false, filhos)}
                    {/* Os desdobramentos abrem e recolhem com a revelação da
                        casa: o conteúdo monta na primeira abertura e fica, e
                        o filho direto do `.revelar` é um só, o que recorta. */}
                    <li className="objetivos-ramos">
                      <div className={`revelar${aberta ? ' aberto' : ''}`}>
                        <div>
                          {montada && (filhos.length ? (
                            <ul className="inbox-itens">
                              {filhos.map(f => linha(f, true))}
                            </ul>
                          ) : (
                            <p className="objetivos-ramos-vazio">
                              <IconRamificar size={12} />
                              {mae.pai
                                ? 'Nenhum outro desdobramento ainda. Para criar, abra a edição pelo lápis.'
                                : 'Nenhum desdobramento ainda. Para criar, abra a edição pelo lápis.'}
                            </p>
                          ))}
                        </div>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {concluindo && (
        <CaixaDaProva objetivo={concluindo}
          onFechar={() => setConcluindo(null)}
          onConfirmar={arquivos => {
            const o = concluindo;
            setConcluindo(null);
            void aplicar(o, { feito: true, fazendo: false, provas: arquivos },
              { feito: true, fazendo: false, provas: o.provas + arquivos.length }, 'Não foi possível marcar como feito');
          }} />
      )}
    </>
  );
}

// ── O alvo e o balão ────────────────────────────────────────────────────────

/**
 * O alvo do cabeçalho. Solto, ele abre o balão. Com a coluna à direita, ele
 * fica aceso e fecha a coluna - é o gesto de quem quer tirá-la da frente, e
 * por isso também desafixa.
 */
export function ObjetivosDaSemana({ dados, pessoas, fixado, podeFixar, onFixar, onIr, onAtualizar, onDesdobrar }: {
  dados: ObjetivosCarregados;
  pessoas: Pessoa[];
  /** A coluna à direita está na tela. */
  fixado: boolean;
  /** Tela larga o bastante para a coluna. No celular o alfinete some: não
   *  haveria lado para a coluna, e fixar não faria nada visível. */
  podeFixar: boolean;
  onFixar: (v: boolean) => void;
  /** Leva à Planning, no projeto e na semana do objetivo. */
  onIr: (o: MeuObjetivo, semana: string) => void;
  onAtualizar: (o: MeuObjetivo, semana: string, mudanca: MudancaDeObjetivo) => Promise<{ error?: string } | null>;
  onDesdobrar: (mae: MeuObjetivo, semana: string, texto: string) => Promise<{ error?: string; objetivo?: { id: string } }>;
}) {
  const [aberto, setAberto] = useState(false);
  /** Uma edição ou a caixa da prova abertas: o balão fica, porque o clique no
   *  calendário e na caixa acontece fora dele. */
  const [preso, setPreso] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const { abertos } = contagem(dados.objetivos);
  const recarregar = dados.recarregar;

  useDropdownDismiss(aberto && !preso, [gatilho, gaveta], () => setAberto(false));
  useEffect(() => {
    if (!aberto || !gatilho.current) return;
    setPos(ancorarCaixa(gatilho.current, LARGURA, ALTURA));
  }, [aberto]);
  // Abrir relê: a lista pode ter mudado desde a última leitura de fundo.
  useEffect(() => { if (aberto) recarregar(); }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fixou pelo alfinete: o balão sai de cena, e a coluna entra no lugar dele.
  useEffect(() => { if (fixado) setAberto(false); }, [fixado]);

  return (
    <>
      <button ref={gatilho} type="button" className={`topo-icone inbox-gatilho${fixado ? ' ativo' : ''}`}
        onClick={() => { if (fixado) onFixar(false); else setAberto(a => !a); }}
        aria-expanded={fixado || aberto}
        aria-label={abertos ? `Seus objetivos da semana, ${abertos} em aberto` : 'Seus objetivos da semana'}
        title={fixado
          ? 'Fechar a coluna de objetivos'
          : abertos
            ? `${abertos} objetivo${abertos === 1 ? '' : 's'} seu${abertos === 1 ? '' : 's'} em aberto nesta semana`
            : 'Seus objetivos da semana'}>
        <IconTarget size={16} />
        {abertos > 0 && (
          <span className="inbox-balao surge" aria-hidden="true">
            {abertos > 9 ? '9+' : abertos}
          </span>
        )}
      </button>

      {/* A mesma gaveta do inbox: mesma moldura, mesma lista, mesma forma de
          abrir e fechar. São duas portas no mesmo canto, e desenhos diferentes
          ali leriam como dois sistemas. */}
      {aberto && !fixado && createPortal(
        <div ref={gaveta} className="inbox-gaveta" role="dialog" aria-label="Seus objetivos da semana"
          style={{ top: pos.top, left: pos.left, width: LARGURA, maxHeight: ALTURA }}>
          <Topo dados={dados} fixado={false} onAlfinete={podeFixar ? () => onFixar(true) : undefined} />
          <div className="inbox-lista">
            <ListaDeObjetivos dados={dados} pessoas={pessoas} onPrender={setPreso}
              onAtualizar={(o, m) => onAtualizar(o, dados.semana, m)}
              onDesdobrar={(o, texto) => onDesdobrar(o, dados.semana, texto)}
              onIr={o => { setAberto(false); onIr(o, dados.semana); }} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── A coluna ────────────────────────────────────────────────────────────────

/**
 * A coluna fixada à direita. É a casca quem dá a largura (a terceira coluna
 * do grid, de zero à `LARGURA_DA_COLUNA`), como faz com o menu da esquerda: o
 * conteúdo de dentro tem largura própria, e é recortado enquanto a coluna
 * cresce ou encolhe, em vez de requebrar as linhas a cada quadro.
 */
export function ColunaDeObjetivos({ dados, pessoas, aberta, onDesafixar, onIr, onAtualizar, onDesdobrar }: {
  dados: ObjetivosCarregados;
  pessoas: Pessoa[];
  aberta: boolean;
  onDesafixar: () => void;
  onIr: (o: MeuObjetivo, semana: string) => void;
  onAtualizar: (o: MeuObjetivo, semana: string, mudanca: MudancaDeObjetivo) => Promise<{ error?: string } | null>;
  onDesdobrar: (mae: MeuObjetivo, semana: string, texto: string) => Promise<{ error?: string; objetivo?: { id: string } }>;
}) {
  return (
    <aside className={`objetivos-coluna${aberta ? ' aberta' : ''}`} aria-label="Seus objetivos da semana"
      aria-hidden={!aberta}>
      <div className="objetivos-coluna-dentro" style={{ width: LARGURA_DA_COLUNA }}>
        <Topo dados={dados} fixado onAlfinete={onDesafixar} />
        <div className="inbox-lista objetivos-coluna-lista">
          <ListaDeObjetivos dados={dados} pessoas={pessoas} onIr={o => onIr(o, dados.semana)}
            onAtualizar={(o, m) => onAtualizar(o, dados.semana, m)}
            onDesdobrar={(o, texto) => onDesdobrar(o, dados.semana, texto)} />
        </div>
      </div>
    </aside>
  );
}
