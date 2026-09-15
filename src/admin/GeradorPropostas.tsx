// ─────────────────────────────────────────────────────────────────────────────
//  Gerador de Propostas.
//
//  A proposta da casa é uma apresentação de slides 16:9, e a forma dela está
//  fechada desde a SHP-LPA-26-01: capa, agenda, quem somos, stack, clientes,
//  soluções, o projeto, uma entrega por slide, como funciona, cronograma,
//  investimento e próximos passos. Os seis primeiros e o último já vêm no
//  template; o que esta tela pergunta é o miolo.
//
//  Um passo por vez, e a prévia do lado. São dezenas de campos: numa tela só,
//  quem preenche escreve no escuro e só descobre o resultado no fim. Aqui cada
//  passo mostra ao vivo o slide que ele está escrevendo - o texto do projeto
//  aparece no slide do projeto, o cronograma vira barra enquanto se digita.
//
//  O que a ferramenta NÃO faz é escrever por você. Proposta boa é concreta, e
//  campo em branco vira slide vazio no cliente - por isso o montador recusa
//  entregar quando falta coisa, em vez de gerar assim mesmo.
// ─────────────────────────────────────────────────────────────────────────────
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StatusConfig, Submission } from './types';

/** O cadastro de lead do Funil, o mesmo de lá. Sob demanda: só quem cria um
 *  lead daqui paga pelo código da tela do Funil. */
const CadastroDeLead = lazy(() => import('./OportunidadesPage').then(m => ({ default: m.CreateModal })));
import {
  IconArrowLeft, IconArrowRight, IconCheck, IconDoc, IconDownload, IconEye, IconFunil, IconInbox, IconPlus, IconTrash,
  IconUpload,
} from '../components/icons';
import { AbaPainel, Abas } from '../components/Abas';
import { SelectSistema } from '../components/SelectSistema';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { useAuth, useToast } from './AdminApp';
import { montarPrevia, montarProposta, type Conferencia } from '../lib/proposta/montar';
import { propostaEmBranco } from '../lib/proposta/exemplo';
import { emBase64, htmlDaProposta, lerTemplate } from '../lib/proposta/gerar';
import { instante, tempoRelativo } from '../lib/datas';
import type { DadosProposta, Entrega, Fase, OpcaoInvestimento } from '../lib/proposta/tipos';

/** Um lead do funil, no recorte que o seletor mostra. */
interface LeadDoFunil {
  id: string;
  empresa: string | null;
  contato: string | null;
  etapa: string | null;
}

/** Uma linha do histórico: uma proposta que já saiu, e o lead dela. */
interface PropostaGerada {
  id: number;
  oportunidade_id: string;
  lead_empresa: string | null;
  cliente: string;
  subtitulo: string;
  slides: number | null;
  autor_nome: string;
  criado_em: string;
  atualizado_em: string;
}

/** Baixa um HTML como arquivo. */
function baixarHtml(html: string, nome: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nome}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** O nome do arquivo que sai: cliente e data, sem o que o sistema de arquivos
 *  não aceita. */
function nomeDoArquivoDe(cliente: string, data = new Date().toISOString()) {
  const base = cliente.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_');
  return `Proposta_${base || 'Cliente'}_${data.slice(0, 10)}`;
}

/** Os passos, e qual slide a prévia mostra em cada um. */
type PassoId = 'capa' | 'projeto' | 'entregas' | 'operacao' | 'cronograma' | 'investimento' | 'fim';

const PASSOS: { id: PassoId; titulo: string; secao: string | null }[] = [
  { id: 'capa', titulo: 'A proposta', secao: null },
  { id: 'projeto', titulo: 'O projeto', secao: 'O projeto' },
  { id: 'entregas', titulo: 'Entregas', secao: null },
  { id: 'operacao', titulo: 'Como funciona', secao: 'Como funciona' },
  { id: 'cronograma', titulo: 'Cronograma', secao: 'Cronograma' },
  { id: 'investimento', titulo: 'Investimento', secao: 'Investimento' },
  { id: 'fim', titulo: 'Gerar', secao: null },
];

// ── Peças do formulário ─────────────────────────────────────────────────────

function Campo({ rotulo, valor, onChange, placeholder, dica }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dica?: string;
}) {
  return (
    <label className="gp-campo">
      <span className="form-label">{rotulo}</span>
      <input className="form-input" value={valor} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} />
      {dica && <span className="gp-dica">{dica}</span>}
    </label>
  );
}

function Texto({ rotulo, valor, onChange, placeholder, linhas = 4, dica }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  linhas?: number;
  dica?: string;
}) {
  return (
    <label className="gp-campo">
      <span className="form-label">{rotulo}</span>
      <textarea className="form-input" value={valor} placeholder={placeholder} rows={linhas}
        style={{ resize: 'vertical', lineHeight: 1.5 }}
        onChange={e => onChange(e.target.value)} />
      {dica && <span className="gp-dica">{dica}</span>}
    </label>
  );
}

/** Uma lista de frases curtas: os ganhos, os itens de uma entrega, os bullets
 *  de uma opção. */
function Lista({ rotulo, itens, onChange, placeholder, dica }: {
  rotulo: string;
  itens: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  dica?: string;
}) {
  const trocar = (i: number, v: string) => onChange(itens.map((x, k) => (k === i ? v : x)));
  return (
    <div className="gp-campo">
      <span className="form-label">{rotulo}</span>
      {itens.map((item, i) => (
        <div key={i} className="gp-linha">
          <input className="form-input" value={item} placeholder={placeholder}
            onChange={e => trocar(i, e.target.value)} />
          <button type="button" className="gp-x" aria-label="Remover"
            onClick={() => onChange(itens.filter((_, k) => k !== i))}>
            <IconTrash size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="gp-mais" onClick={() => onChange([...itens, ''])}>
        <IconPlus size={12} /> Mais um
      </button>
      {dica && <span className="gp-dica">{dica}</span>}
    </div>
  );
}

function CardDeEntrega({ e, i, total, onChange, onRemover, onFoco }: {
  e: Entrega;
  i: number;
  total: number;
  onChange: (v: Entrega) => void;
  onRemover: () => void;
  onFoco: () => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function carregarPrototipo(arquivo: File | null | undefined) {
    if (!arquivo) return;
    if (!/\.html?$/i.test(arquivo.name) && !/html/.test(arquivo.type)) {
      toast('error', 'Protótipo precisa ser um .html', 'É o arquivo que roda dentro do slide.');
      return;
    }
    const html = await arquivo.text();
    onChange({
      ...e,
      // Com protótipo, os pontos saem: o painel é a imagem do slide, e lista ao
      // lado dele rouba a tela.
      itens: [],
      prototipo: { html, largura: 1440, altura: 900, titulo: e.nome || arquivo.name },
    });
  }

  return (
    <div className="gp-entrega" onFocusCapture={onFoco}>
      <div className="gp-entrega-topo">
        <span className="gp-entrega-num">Entrega {i + 1}</span>
        {total > 1 && (
          <button type="button" className="gp-x" aria-label="Remover entrega" onClick={onRemover}>
            <IconTrash size={13} />
          </button>
        )}
      </div>
      <div className="gp-grade">
        <Campo rotulo="Nome" valor={e.nome} onChange={v => onChange({ ...e, nome: v })}
          placeholder="Pacote de BIs"
          dica={`Vira "Entrega ${i + 1} · ${e.nome || 'nome'}" no slide e na agenda.`} />
        <Texto rotulo="Resumo" valor={e.resumo} onChange={v => onChange({ ...e, resumo: v })}
          linhas={3} placeholder="O que essa entrega resolve, em duas ou três frases." />
        {!e.prototipo && (
          <Lista rotulo="Pontos" itens={e.itens} onChange={v => onChange({ ...e, itens: v })}
            placeholder="Um ponto por linha" />
        )}
        <div className="gp-campo">
          <span className="form-label">Protótipo clicável</span>
          {e.prototipo ? (
            <div className="gp-proto">
              <span>{(e.prototipo.html.length / 1024).toFixed(0)} kB de HTML, rodando dentro do slide</span>
              <button type="button" className="gp-x" aria-label="Tirar o protótipo"
                onClick={() => onChange({ ...e, prototipo: undefined, itens: ['', '', ''] })}>
                <IconTrash size={13} />
              </button>
            </div>
          ) : (
            <button type="button" className="gp-anexar" onClick={() => entrada.current?.click()}>
              <IconUpload size={13} /> Escolher o .html do protótipo
            </button>
          )}
          <input ref={entrada} type="file" accept=".html,.htm,text/html" hidden
            onChange={ev => { void carregarPrototipo(ev.target.files?.[0]); ev.target.value = ''; }} />
          <span className="gp-dica">
            O arquivo entra inteiro no slide, então a proposta continua sendo um arquivo só.
          </span>
        </div>
      </div>
    </div>
  );
}

function LinhaDeFase({ f, meses, onChange }: {
  f: Fase;
  meses: number;
  onChange: (v: Fase) => void;
}) {
  const numero = (v: string) => Math.max(1, Math.min(meses, Number(v.replace(/\D/g, '')) || 1));
  return (
    <div className="gp-fase">
      <div className="gp-fase-topo">
        <span className="gp-fase-nome">{f.nome}</span>
        <span className="gp-fase-meses">
          <label>
            de
            <input className="form-input gp-mini" value={f.de} inputMode="numeric"
              onChange={e => onChange({ ...f, de: numero(e.target.value) })} />
          </label>
          <label>
            até
            <input className="form-input gp-mini" value={f.ate} inputMode="numeric"
              onChange={e => onChange({ ...f, ate: numero(e.target.value) })} />
          </label>
        </span>
      </div>
      <div className="gp-grade">
        <Lista rotulo="O que acontece" itens={f.sub} onChange={v => onChange({ ...f, sub: v })}
          placeholder="Uma atividade por linha" />
        <Lista rotulo="Entregas" itens={f.entregas} onChange={v => onChange({ ...f, entregas: v })}
          placeholder="O que fica pronto" />
      </div>
    </div>
  );
}

function CardDeOpcao({ o, onChange }: { o: OpcaoInvestimento; onChange: (v: OpcaoInvestimento) => void }) {
  const d = o.destaque ?? { valor: '', texto: '', nota: '' };
  return (
    <div className={`gp-opcao${o.recomendada ? ' rec' : ''}`}>
      <div className="gp-entrega-topo">
        <span className="gp-entrega-num">{o.rotulo}{o.recomendada ? ' · recomendada' : ''}</span>
      </div>
      <div className="gp-grade">
        <Campo rotulo="Linha fina" valor={o.titulo} onChange={v => onChange({ ...o, titulo: v })}
          placeholder="Roadmap completo" />
        <Campo rotulo="Valor" valor={o.valor} onChange={v => onChange({ ...o, valor: v })}
          placeholder="21.600" dica="Só o número: o R$ é desenhado pelo template." />
        <Campo rotulo="O que o valor compra" valor={o.unidade}
          onChange={v => onChange({ ...o, unidade: v })}
          placeholder="por mês · 1 desenvolvedor em 8h/dia" />
        <Campo rotulo="Destaque" valor={d.valor}
          onChange={v => onChange({ ...o, destaque: { ...d, valor: v } })}
          placeholder="R$ 0" dica="O quadro ao lado do preço. Em branco, ele não aparece." />
        <Campo rotulo="Texto do destaque" valor={d.texto}
          onChange={v => onChange({ ...o, destaque: { ...d, texto: v } })}
          placeholder="no primeiro mês" />
        <Campo rotulo="Nota do destaque" valor={d.nota ?? ''}
          onChange={v => onChange({ ...o, destaque: { ...d, nota: v } })}
          placeholder="os três painéis e o setup ocupam os 20 dias úteis" />
        <Lista rotulo="Bullets" itens={o.bullets} onChange={v => onChange({ ...o, bullets: v })}
          placeholder="Um ponto por linha"
          dica="Os bullets se espelham entre as duas opções: a mesma pergunta respondida nas duas, inclusive quando a resposta é ruim." />
      </div>
    </div>
  );
}

// ── A prévia ────────────────────────────────────────────────────────────────

/**
 * O deck ao vivo, parado no slide do passo atual.
 *
 * O HTML é remontado com um respiro depois da última tecla: montar a cada
 * letra recarregaria o quadro no meio da digitação, e o que se veria seria
 * piscar, não a proposta.
 *
 * O slide certo é escolhido de fora, trocando a classe `active` dentro do
 * quadro. O conteúdo vem de `srcDoc`, então ele é da mesma origem e dá para
 * alcançá-lo - é o mesmo caminho que o próprio deck usa para navegar.
 *
 * Quem escreve o nome no alto é o próprio quadro, e não o passo: com o "Como
 * funciona" desligado, o slide daquele passo não existe, e anunciar um nome
 * enquanto se mostra outro slide é pior do que não anunciar nada.
 */
function Previa({ html, secao }: { html: string | null; secao: string | null }) {
  const quadro = useRef<HTMLIFrameElement>(null);
  const [mostrando, setMostrando] = useState('Capa');

  const irParaOSlide = () => {
    const doc = quadro.current?.contentDocument;
    if (!doc) return;
    const slides = [...doc.querySelectorAll('.slide')];
    if (!slides.length) return;
    const alvo = (secao
      ? slides.find(s => s.querySelector('.sh')?.getAttribute('data-secao') === secao)
      : slides[0]) ?? slides[0];
    slides.forEach(s => s.classList.remove('active'));
    alvo.classList.add('active');
    // O separador solto sobra quando a entrega ainda não tem nome.
    const nome = alvo.querySelector('.sh')?.getAttribute('data-secao') ?? 'Capa';
    setMostrando(nome.replace(/\s*·\s*$/, ''));
  };

  // Trocar de passo não remonta o deck: só muda qual slide está na frente.
  useEffect(irParaOSlide, [secao, html]);

  return (
    <div className="gp-previa">
      <div className="gp-previa-topo">
        <span>Prévia</span>
        <span className="gp-previa-secao">{mostrando}</span>
      </div>
      {html
        ? <iframe ref={quadro} title="Prévia da proposta" srcDoc={html} onLoad={irParaOSlide} />
        : (
          <div className="gp-previa-vazia">
            <span className="dux-spinner sm" />
          </div>
        )}
    </div>
  );
}

// ── A tela ──────────────────────────────────────────────────────────────────

/**
 * O histórico: toda proposta que já saiu do gerador, com o lead de cada uma.
 * Cada linha abre a apresentação na prévia da casa e baixa a segunda via, as
 * duas montadas de novo a partir dos campos guardados.
 */
function HistoricoPropostas({ lista, onVer, onBaixar, onAbrirLead }: {
  /** `null` enquanto a lista não chegou. */
  lista: PropostaGerada[] | null;
  onVer: (p: PropostaGerada) => void;
  onBaixar: (p: PropostaGerada) => void;
  onAbrirLead?: (oportunidadeId: string) => void;
}) {
  if (lista == null) return <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>;
  if (!lista.length) {
    return (
      <div className="admin-empty" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
        <p>Nenhuma proposta gerada por aqui ainda.</p>
        <p className="gp-hist-nota">
          Toda proposta que sai do gerador entra nesta lista, presa ao lead do funil - e daqui
          ela abre de novo, sem precisar preencher tudo outra vez.
        </p>
      </div>
    );
  }
  return (
    <ul className="gp-hist lista-anima" key={lista.map(p => p.id).join('|')}>
      {lista.map(p => (
        <li key={p.id} className="gp-hist-item">
          <span className="gp-hist-icone"><IconDoc size={16} /></span>
          <div className="gp-hist-texto">
            <p className="gp-hist-titulo">{p.cliente}</p>
            <p className="gp-hist-sub">{p.subtitulo}</p>
            <p className="gp-hist-meta">
              {instante(p.criado_em)} por {p.autor_nome}
              {p.atualizado_em !== p.criado_em && ` - refeita ${tempoRelativo(p.atualizado_em)}`}
              {p.slides ? ` - ${p.slides} slides` : ''}
            </p>
          </div>
          <div className="gp-hist-acoes">
            {/* O lead de onde a proposta veio, que é onde ela aparece como chip. */}
            <button type="button" className="gp-hist-lead" disabled={!onAbrirLead}
              title={onAbrirLead ? 'Abrir o lead no Funil' : undefined}
              onClick={() => onAbrirLead?.(p.oportunidade_id)}>
              <IconFunil size={12} />
              <span>{p.lead_empresa ?? 'Lead removido'}</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVer(p)}>
              <IconEye size={13} /> Ver
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onBaixar(p)}>
              <IconDownload size={13} /> Baixar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

type AbaDoGerador = 'gerador' | 'historico';

export default function GeradorPropostas({ token, onAbrirOportunidade }: {
  token: string;
  /** Leva à tela do Funil com o lead aberto. */
  onAbrirOportunidade?: (id: string) => void;
}) {
  const { toast } = useToast();
  const { usuario, onSessionExpired, pode } = useAuth();
  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return null; }
    return res.json().catch(() => null);
  }, [token, onSessionExpired]);

  const [aba, setAba] = useState<AbaDoGerador>('gerador');
  /** `null` = ainda não buscado: a aba pede a lista na primeira visita. */
  const [historico, setHistorico] = useState<PropostaGerada[] | null>(null);
  const [vendo, setVendo] = useState<PropostaGerada | null>(null);
  /** O lead do funil a que a proposta pertence. Obrigatório para gerar. */
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState<LeadDoFunil[] | null>(null);
  /** As etapas do funil, para o cadastro de lead perguntar em qual ele entra. */
  const [etapasDoFunil, setEtapasDoFunil] = useState<StatusConfig[]>([]);
  /** O cadastro de lead aberto, com a empresa que já foi digitada na busca. */
  const [novoLead, setNovoLead] = useState<{ empresa: string } | null>(null);

  const [d, setD] = useState<DadosProposta>(propostaEmBranco);
  const [template, setTemplate] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  const [entregaEmFoco, setEntregaEmFoco] = useState(0);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  /** Os dados de um instante atrás, que é o que a prévia mostra. */
  const [dParaPrevia, setDParaPrevia] = useState<DadosProposta>(d);

  useEffect(() => { void lerTemplate().then(setTemplate); }, []);

  // Os leads chegam com a tela: o seletor é o primeiro campo do primeiro passo.
  useEffect(() => {
    let vivo = true;
    void api('?action=propostas_leads').then(r => {
      if (!vivo) return;
      setLeads(Array.isArray(r?.leads) ? r.leads : []);
      setEtapasDoFunil(Array.isArray(r?.etapas) ? r.etapas : []);
    });
    return () => { vivo = false; };
  }, [api]);

  // O histórico só é buscado quando a aba é aberta: quem entra para montar uma
  // proposta não paga por uma lista que não vai olhar.
  useEffect(() => {
    if (aba !== 'historico' || historico != null) return;
    let vivo = true;
    void api('?action=propostas_geradas').then(r => {
      if (vivo) setHistorico(Array.isArray(r?.propostas) ? r.propostas : []);
    });
    return () => { vivo = false; };
  }, [aba, historico, api]);

  /** Os campos de uma proposta já registrada, montados de novo em HTML. */
  const htmlDoHistorico = useCallback(async (p: PropostaGerada) => {
    const r = await api(`?action=proposta_dados&id=${p.id}`);
    if (!r?.dados) throw new Error(r?.error ?? 'A proposta não veio.');
    const html = await htmlDaProposta(r.dados as DadosProposta);
    if (!html) throw new Error('O modelo da proposta não carregou.');
    return html;
  }, [api]);

  // Quem prepara é quem está com a tela aberta. Vem por efeito, e não do estado
  // inicial, porque a sessão costuma chegar depois da primeira pintura.
  useEffect(() => {
    const nome = usuario?.nome;
    if (nome) setD(a => (a.preparadoPor === nome ? a : { ...a, preparadoPor: nome }));
  }, [usuario?.nome]);

  // O respiro entre a última tecla e a remontagem do quadro.
  useEffect(() => {
    const t = setTimeout(() => setDParaPrevia(d), 450);
    return () => clearTimeout(t);
  }, [d]);

  const editar = (parte: Partial<DadosProposta>) => setD(a => ({ ...a, ...parte }));

  const htmlDaPrevia = useMemo(
    () => (template ? montarPrevia(template, limpar(dParaPrevia, true)) : null),
    [template, dParaPrevia],
  );

  const atual = PASSOS[passo];
  // No passo das entregas a prévia segue a entrega em que se está digitando. O
  // alvo é montado igual ao `data-secao` do slide, senão não é achado lá dentro.
  const secaoDaPrevia = atual.id === 'entregas'
    ? `Entrega ${entregaEmFoco + 1} · ${dParaPrevia.entregas[entregaEmFoco]?.nome ?? ''}`
    : atual.secao;

  const nomeDoArquivo = useMemo(() => nomeDoArquivoDe(d.cliente), [d.cliente]);

  const faltando = [
    !leadId && 'o lead no funil',
    !d.cliente.trim() && 'cliente',
    !d.subtitulo.trim() && 'subtítulo',
    !d.projeto.trim() && 'o texto do projeto',
    !d.entregas.some(e => e.nome.trim()) && 'ao menos uma entrega',
    !d.investimento.opcoes.some(o => o.valor.trim()) && 'o valor do investimento',
    !d.investimento.memoria.trim() && 'a memória de cálculo',
  ].filter(Boolean) as string[];

  /** O passo já tem o que a geração exige dele: é o visto no chip. Só os
   *  passos obrigatórios o recebem - "Como funciona" e "Cronograma" já nascem
   *  preenchidos pelo modelo, e um visto neles antes de qualquer toque diria
   *  que alguém os conferiu. "Gerar" é a ação, e não um passo a cumprir. */
  const passoPronto = (id: PassoId): boolean => {
    switch (id) {
      case 'capa': return !!leadId && !!d.cliente.trim() && !!d.subtitulo.trim();
      case 'projeto': return !!d.projeto.trim();
      case 'entregas': return d.entregas.some(e => e.nome.trim());
      case 'investimento': return d.investimento.opcoes.some(o => o.valor.trim()) && !!d.investimento.memoria.trim();
      default: return false;
    }
  };

  /** Não é campo, é a sessão: fica de fora da lista do que falta preencher,
   *  senão manda voltar a um passo onde não há o que digitar. */
  const semQuemPrepara = !d.preparadoPor.trim();

  function baixar() {
    if (!template || !leadId) return;
    const final = limpar(d, false);
    const r = montarProposta(template, final);
    setConferencia(r.conferencia);
    if (!r.ok) {
      toast('error', 'A proposta não passou na conferência', r.conferencia.problemas[0]);
      return;
    }
    baixarHtml(r.html, nomeDoArquivo);
    toast('success', 'Proposta gerada', `${d.cliente}, ${r.conferencia.slides} slides`);
    void registrar(final, r.conferencia.slides);
  }

  /**
   * A proposta acabou de sair, e o lead dela passa a saber: é isto que põe o
   * chip no card do funil e a linha no histórico.
   *
   * O arquivo é gerado no navegador antes - se o registro falhar, a proposta
   * continua na mão de quem pediu, e é o funil que fica devendo, com o aviso.
   */
  async function registrar(final: DadosProposta, slides: number) {
    const r = await api('', 'POST', {
      action: 'registrar_proposta', oportunidade_id: leadId,
      cliente: final.cliente, subtitulo: final.subtitulo, dados: final, slides,
    });
    if (!r?.id) {
      toast('error', 'A proposta saiu, mas não ficou presa ao lead',
        r?.error ?? 'Gere de novo para registrar no funil.');
      return;
    }
    const lead = leads?.find(l => l.id === leadId);
    const linha: PropostaGerada = {
      id: Number(r.id), oportunidade_id: leadId, lead_empresa: lead?.empresa ?? null,
      cliente: final.cliente, subtitulo: final.subtitulo, slides,
      autor_nome: usuario?.nome ?? 'você', criado_em: r.criado_em, atualizado_em: r.atualizado_em,
    };
    // Pelo id: refazer a mesma proposta atualiza a linha dela, e aqui ela sobe
    // para o topo em vez de virar uma segunda.
    setHistorico(atual => (atual == null ? atual : [linha, ...atual.filter(p => p.id !== linha.id)]));
  }

  async function baixarDoHistorico(p: PropostaGerada) {
    try {
      baixarHtml(await htmlDoHistorico(p), nomeDoArquivoDe(p.cliente, p.atualizado_em));
    } catch (e) {
      toast('error', 'Não consegui montar esta proposta', e instanceof Error ? e.message : undefined);
    }
  }

  return (
    <div className="admin-content-wrap">
      <style>{ESTILO}</style>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Gerador de Propostas</h1>
          <p className="admin-page-desc">
            {aba === 'gerador'
              ? 'A apresentação da casa, um passo por vez'
              : 'As propostas que já saíram, cada uma presa ao seu lead'}
          </p>
        </div>
      </div>

      {/* Montar uma proposta ou olhar as que já saíram, nas abas da casa, abaixo
          do título e no começo da linha, como no Banco de Talentos. O formulário
          fica montado atrás do histórico: espiar a lista não apaga o que estava
          sendo escrito. Os passos da proposta dividem a mesma linha, na coluna
          da prévia. */}
      <div className="gp-passos-linha">
        <div className="gp-abas">
          <Abas valor={aba} onChange={setAba}
            opcoes={[
              { valor: 'gerador', label: 'Gerador' },
              { valor: 'historico', label: 'Histórico' },
            ]} />
        </div>

      {/* Os passos da proposta, em chips: o número diz a ordem, o visto diz o
          que já tem conteúdo, e clicar vai direto ao passo - o formulário não
          tranca ninguém andando para frente. */}
      {aba === 'gerador' && (
        <nav className="gp-passos surge" aria-label="Passos da proposta">
          {PASSOS.map((p, i) => {
            const pronto = passoPronto(p.id);
            return (
              <button key={p.id} type="button"
                className={`gp-passo${i === passo ? ' atual' : ''}${pronto ? ' pronto' : ''}`}
                aria-current={i === passo ? 'step' : undefined}
                onClick={() => setPasso(i)}>
                <span className="gp-passo-num" aria-hidden="true">
                  {pronto && i !== passo ? <IconCheck size={11} /> : i + 1}
                </span>
                {p.titulo}
              </button>
            );
          })}
        </nav>
      )}
      </div>

      {(aba === 'historico' || historico != null) && (
        <div className={aba === 'historico' ? 'aba-painel gp-card' : 'gp-fora'}>
          <HistoricoPropostas lista={historico}
            onVer={setVendo}
            onBaixar={p => { void baixarDoHistorico(p); }}
            onAbrirLead={onAbrirOportunidade} />
        </div>
      )}

      {novoLead && (
        <Suspense fallback={null}>
          <CadastroDeLead
            statuses={etapasDoFunil}
            token={token}
            inicial={{ empresa: novoLead.empresa }}
            onClose={() => setNovoLead(null)}
            onCreated={(sub: Submission) => {
              const etapa = etapasDoFunil.find(e => Number(e.id) === Number(sub.current_status_id))?.nome ?? null;
              const lead: LeadDoFunil = {
                id: String(sub.id), empresa: sub.empresa, contato: sub.contato_nome, etapa,
              };
              // Entra na lista e já fica escolhido: foi para esta proposta que ele nasceu.
              setLeads(atual => [lead, ...(atual ?? []).filter(l => l.id !== lead.id)]);
              setLeadId(lead.id);
              if (lead.empresa && !d.cliente.trim()) editar({ cliente: lead.empresa });
            }}
          />
        </Suspense>
      )}

      {vendo && (
        <PreviaArquivo
          arquivo={{ nome: `${vendo.cliente} - ${vendo.subtitulo}`, chave: vendo.id }}
          onCarregar={async () => ({ tipo: 'text/html', base64: emBase64(await htmlDoHistorico(vendo)) })}
          onBaixar={() => { void baixarDoHistorico(vendo); }}
          onFechar={() => setVendo(null)}
        />
      )}

      <div className={`gp-lado-a-lado${aba === 'gerador' ? '' : ' gp-fora'}`}>
        <AbaPainel key={atual.id}>
        <div className="gp-card">
          {atual.id === 'capa' && (
            <>
              <p className="gp-secao">A proposta</p>
              <div className="gp-grade">
                {/* O lead vem primeiro e é obrigatório: toda proposta tem um card no
                    funil, e é nele que ela aparece depois de gerada. Escolher o lead
                    preenche o cliente quando ele ainda está em branco. */}
                <div className="gp-campo">
                  <span className="form-label">Lead no funil *</span>
                  {leads == null ? (
                    <div className="dux-spinner-row" style={{ justifyContent: 'flex-start', padding: '10px 0' }}>
                      <span className="dux-spinner sm" />
                    </div>
                  ) : (
                  <SelectSistema
                    valor={leadId}
                    placeholder="Escolha o lead desta proposta"
                    onChange={id => {
                      setLeadId(id);
                      const lead = leads?.find(l => l.id === id);
                      if (lead?.empresa && !d.cliente.trim()) editar({ cliente: lead.empresa });
                    }}
                    opcoes={(leads ?? []).map(l => ({
                      valor: l.id,
                      label: l.empresa ?? 'Lead sem empresa',
                      descricao: [l.etapa, l.contato].filter(Boolean).join(' · ') || undefined,
                    }))}
                    // O lead que ainda não existe nasce daqui: abre o cadastro do
                    // Funil, e ao cadastrar ele já volta escolhido. Só para quem
                    // pode criar oportunidade, que é o que o cadastro exige.
                    criar={pode('oportunidades:criar') ? {
                      rotulo: 'Novo lead',
                      semNome: true,
                      onCriar: async texto => { setNovoLead({ empresa: texto }); return true; },
                    } : undefined} />
                  )}
                  {leads != null && leads.length === 0 && (
                    <span className="gp-dica">
                      Nenhum lead aberto no funil. Crie o card do lead no Funil antes de montar a proposta.
                    </span>
                  )}
                </div>
                <Campo rotulo="Cliente" valor={d.cliente} onChange={v => editar({ cliente: v })}
                  placeholder="Laticínios Porto Alegre" />
                <Campo rotulo="Subtítulo" valor={d.subtitulo} onChange={v => editar({ subtitulo: v })}
                  placeholder="Painéis de gestão em Power BI" />
              </div>
              {/* Quem prepara, quem apresenta e a validade não aparecem aqui:
                  não se perguntam, e a prévia ao lado já mostra os três na capa. */}
            </>
          )}

          {atual.id === 'projeto' && (
            <>
              <p className="gp-secao">O projeto</p>
              <div className="gp-grade">
                <Texto rotulo="A situação, e o que a proposta faz com ela" valor={d.projeto}
                  onChange={v => editar({ projeto: v })} linhas={6}
                  placeholder="O que o cliente vive hoje, e o que muda. Concreto, sem adjetivo vazio."
                  dica="Sem travessão: a casa não usa, e o montador recusa." />
                <Lista rotulo="O que o cliente ganha" itens={d.ganhos}
                  onChange={v => editar({ ganhos: v })} placeholder="Um ganho por linha" />
              </div>
            </>
          )}

          {atual.id === 'entregas' && (
            <>
              <p className="gp-secao">Entregas</p>
              <p className="gp-dica">Uma entrega por slide, na ordem em que aparecem aqui.</p>
              {d.entregas.map((e, i) => (
                <CardDeEntrega key={i} e={e} i={i} total={d.entregas.length}
                  onFoco={() => setEntregaEmFoco(i)}
                  onChange={v => {
                    setEntregaEmFoco(i);
                    editar({ entregas: d.entregas.map((x, k) => (k === i ? v : x)) });
                  }}
                  onRemover={() => {
                    setEntregaEmFoco(0);
                    editar({ entregas: d.entregas.filter((_, k) => k !== i) });
                  }} />
              ))}
              <button type="button" className="gp-mais"
                onClick={() => {
                  setEntregaEmFoco(d.entregas.length);
                  editar({ entregas: [...d.entregas, { nome: '', resumo: '', itens: ['', '', ''] }] });
                }}>
                <IconPlus size={12} /> Mais uma entrega
              </button>
            </>
          )}

          {atual.id === 'operacao' && (
            <>
              <p className="gp-secao">
                Como funciona
                <button type="button" className="gp-ligar"
                  onClick={() => editar({
                    comoFunciona: d.comoFunciona ? undefined : propostaEmBranco().comoFunciona,
                  })}>
                  {d.comoFunciona ? 'Tirar este slide' : 'Incluir este slide'}
                </button>
              </p>
              {d.comoFunciona ? (
                <div className="gp-grade">
                  <Campo rotulo="Linha fina" valor={d.comoFunciona.linhaFina}
                    onChange={v => editar({ comoFunciona: { ...d.comoFunciona!, linhaFina: v } })} />
                  {d.comoFunciona.passos.map((p, i) => (
                    <div key={i} className="gp-campo">
                      <span className="form-label">{`Passo ${i + 1}`}</span>
                      <input className="form-input" value={p.titulo} placeholder="Título do passo"
                        onChange={e => editar({
                          comoFunciona: {
                            ...d.comoFunciona!,
                            passos: d.comoFunciona!.passos.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)),
                          },
                        })} />
                      <textarea className="form-input" value={p.texto} rows={2}
                        style={{ resize: 'vertical', marginTop: 6 }} placeholder="O que acontece nesse passo"
                        onChange={e => editar({
                          comoFunciona: {
                            ...d.comoFunciona!,
                            passos: d.comoFunciona!.passos.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)),
                          },
                        })} />
                    </div>
                  ))}
                  <Texto rotulo="A conta que sustenta o prazo" valor={d.comoFunciona.nota} linhas={2}
                    onChange={v => editar({ comoFunciona: { ...d.comoFunciona!, nota: v } })}
                    placeholder="Cerca de 40 painéis a cinco dias cada dá 7 meses." />
                </div>
              ) : (
                <p className="gp-dica">
                  Fora da proposta. Ele é o slide do modelo de operação, e sai quando a contratação
                  é de escopo fechado.
                </p>
              )}
            </>
          )}

          {atual.id === 'cronograma' && (
            <>
              <p className="gp-secao">Cronograma</p>
              <div className="gp-grade">
                <Campo rotulo="Quantos meses" valor={String(d.cronograma.meses)}
                  onChange={v => editar({
                    cronograma: { ...d.cronograma, meses: Math.max(1, Number(v.replace(/\D/g, '')) || 1) },
                  })}
                  dica="Sempre em meses, nunca em semanas." />
              </div>
              {d.cronograma.fases.map((f, i) => (
                <LinhaDeFase key={f.nome} f={f} meses={d.cronograma.meses}
                  onChange={v => editar({
                    cronograma: {
                      ...d.cronograma,
                      fases: d.cronograma.fases.map((x, k) => (k === i ? v : x)),
                    },
                  })} />
              ))}
            </>
          )}

          {atual.id === 'investimento' && (
            <>
              <p className="gp-secao">Investimento</p>
              {d.investimento.opcoes.map((o, i) => (
                <CardDeOpcao key={i} o={o}
                  onChange={v => editar({
                    investimento: {
                      ...d.investimento,
                      opcoes: d.investimento.opcoes.map((x, k) => (k === i ? v : x)),
                    },
                  })} />
              ))}
              <button type="button" className="gp-mais"
                onClick={() => editar({
                  investimento: {
                    ...d.investimento,
                    opcoes: d.investimento.opcoes.length > 1
                      ? [d.investimento.opcoes[0]]
                      : [...d.investimento.opcoes,
                        { rotulo: 'Opção B', titulo: '', valor: '', unidade: '', bullets: ['', '', ''] }],
                  },
                })}>
                {d.investimento.opcoes.length > 1 ? 'Deixar uma opção só' : 'Comparar com uma segunda opção'}
              </button>

              <p className="gp-secao">Time alocado</p>
              {d.investimento.time.map((p, i) => (
                <div key={i} className="gp-grade gp-time">
                  <Campo rotulo="Papel" valor={p.papel}
                    onChange={v => editar({
                      investimento: {
                        ...d.investimento,
                        time: d.investimento.time.map((x, k) => (k === i ? { ...x, papel: v } : x)),
                      },
                    })} />
                  <Campo rotulo="Dedicação" valor={p.dedicacao} placeholder="1 pessoa · 8h por dia"
                    dica={p.naoCobrado ? 'Não aparece: o papel leva a etiqueta "Não cobrado".' : undefined}
                    onChange={v => editar({
                      investimento: {
                        ...d.investimento,
                        time: d.investimento.time.map((x, k) => (k === i ? { ...x, dedicacao: v } : x)),
                      },
                    })} />
                  <Texto rotulo="O que faz no projeto" valor={p.descricao} linhas={2}
                    onChange={v => editar({
                      investimento: {
                        ...d.investimento,
                        time: d.investimento.time.map((x, k) => (k === i ? { ...x, descricao: v } : x)),
                      },
                    })} />
                </div>
              ))}

              <div className="gp-grade">
                <Texto rotulo="Memória de cálculo" valor={d.investimento.memoria} linhas={3}
                  onChange={v => editar({ investimento: { ...d.investimento, memoria: v } })}
                  placeholder="A hora-homem é R$ 135, em jornadas de 8 horas, e o mês tem 20 dias úteis: 8 x 20 x 135 = R$ 21.600."
                  dica={'Mostrar a conta tira a conversa do "está caro" e leva para o que compõe o preço.'} />
              </div>
            </>
          )}

          {atual.id === 'fim' && (
            <>
              <p className="gp-secao">Gerar a proposta</p>
              {faltando.length > 0 ? (
                <p className="gp-dica">
                  Falta preencher: {faltando.join(', ')}. Volte pelos passos acima.
                </p>
              ) : semQuemPrepara ? (
                <p className="gp-dica">
                  Falta saber quem está preparando, e isso vem da sua sessão. Recarregue a página.
                </p>
              ) : (
                <p className="gp-dica">
                  Tudo preenchido. Passe pelos slides na prévia ao lado, clicando dentro dela ou
                  com as setas, e confira que nada transborda. O arquivo sai com a apresentação
                  inteira dentro, protótipo incluído, e abre em qualquer navegador.
                </p>
              )}

              {conferencia && conferencia.problemas.length > 0 && (
                <div className="gp-problemas surge">
                  <b>A proposta não pode sair assim:</b>
                  <ul>{conferencia.problemas.map(p => <li key={p}>{p}</li>)}</ul>
                </div>
              )}

              <div className="gp-rodape">
                <button type="button" className="btn btn-primary" onClick={baixar}
                  disabled={faltando.length > 0 || semQuemPrepara || !template}>
                  <IconDownload size={14} /> Baixar a proposta
                </button>
                {!template && <span className="dux-spinner sm" />}
              </div>
            </>
          )}

          <div className="gp-andar">
            <button type="button" className="gp-voltar" disabled={passo === 0}
              onClick={() => setPasso(p => Math.max(0, p - 1))}>
              <IconArrowLeft size={12} /> Voltar
            </button>
            {passo < PASSOS.length - 1 && (
              <button type="button" className="btn btn-secondary"
                onClick={() => setPasso(p => Math.min(PASSOS.length - 1, p + 1))}>
                {PASSOS[passo + 1].titulo} <IconArrowRight size={12} />
              </button>
            )}
          </div>
        </div>
        </AbaPainel>

        <Previa html={htmlDaPrevia} secao={secaoDaPrevia} />
      </div>
    </div>
  );
}

/**
 * Tira as linhas em branco antes de montar.
 *
 * Na prévia as entregas sem nome ficam: quem está digitando o nome precisa ver
 * o slide dela nascendo. Na hora de gerar elas saem, porque "Entrega 2 · " sem
 * nome é um slide pela metade indo para o cliente.
 */
function limpar(d: DadosProposta, previa: boolean): DadosProposta {
  const semVazios = (l: string[]) => l.map(x => x.trim()).filter(Boolean);
  return {
    ...d,
    ganhos: semVazios(d.ganhos),
    entregas: d.entregas
      .filter(e => previa || e.nome.trim())
      .map(e => ({ ...e, itens: semVazios(e.itens) })),
    comoFunciona: d.comoFunciona && {
      ...d.comoFunciona,
      passos: d.comoFunciona.passos.filter(p => p.titulo.trim() || p.texto.trim()),
    },
    cronograma: {
      ...d.cronograma,
      fases: d.cronograma.fases.map(f => ({
        ...f, sub: semVazios(f.sub), entregas: semVazios(f.entregas),
      })),
    },
    investimento: {
      ...d.investimento,
      opcoes: d.investimento.opcoes.map(o => ({
        ...o,
        bullets: semVazios(o.bullets),
        destaque: o.destaque?.valor.trim() ? o.destaque : undefined,
      })),
      time: d.investimento.time.filter(p => p.papel.trim()),
    },
  };
}

const ESTILO = `
  /* A linha das abas: Gerador e Historico na coluna do formulario, os passos da
     proposta na coluna da previa. E a mesma grade do formulario com a previa,
     entao os chips comecam onde a previa comeca. Com a grade empilhada, os
     chips descem para baixo das abas, no comeco da linha. */
  .gp-passos-linha {
    display: grid; grid-template-columns: minmax(280px, 0.36fr) minmax(0, 1fr);
    gap: 10px 18px; align-items: center; flex-shrink: 0;
  }
  .gp-abas { display: flex; grid-column: 1; }
  .gp-abas .config-tabs { margin-bottom: 0; }
  .gp-passos-linha .gp-passos { grid-column: 2; }
  @media (max-width: 1100px) {
    .gp-passos-linha { grid-template-columns: minmax(0, 1fr); }
    .gp-passos-linha .gp-passos { grid-column: 1; }
  }

  /* Os passos da proposta, em chips. O atual e cheio, no verde da casa; o que
     ja tem conteudo leva o visto no lugar do numero; o resto e contorno. Uma
     fileira que rola de lado no estreito, em vez de quebrar em duas.
     A pagina e uma coluna flex de altura presa, e o overflow-x zera a altura
     minima da fileira: sem o flex-shrink: 0 na linha era ela que encolhia quando
     o formulario pedia espaco, e os chips saiam recortados. O respiro de cima e
     de baixo e para o hover, que sobe o chip e acende a sombra, nao ser cortado
     pelo proprio overflow; a margem negativa devolve o espaco. */
  .gp-passos {
    display: flex; align-items: center; gap: 6px; min-width: 0;
    overflow-x: auto; scrollbar-width: none; padding: 6px 2px 6px 0; margin: -6px 0;
  }
  .gp-passo {
    flex: none; display: inline-flex; align-items: center; gap: 7px;
    height: 32px; padding: 0 12px 0 5px;
    border: 1px solid var(--gray3); border-radius: var(--radius-pill);
    background: var(--white); font-family: inherit; font-size: 12px; font-weight: 700;
    color: var(--gray); cursor: pointer; white-space: nowrap;
    transition: border-color var(--transition), color var(--transition), background var(--transition),
      box-shadow var(--transition-spring), transform var(--transition-spring);
  }
  .gp-passo:hover { border-color: var(--gray2); color: var(--black); box-shadow: var(--shadow-card); transform: translateY(-1px); }
  .gp-passo:focus-visible { outline: none; border-color: var(--gray2); color: var(--black); }
  .gp-passo-num {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--gray4); color: var(--gray); font-size: 11px; font-weight: 800;
    font-variant-numeric: tabular-nums;
    transition: background var(--transition), color var(--transition);
  }
  .gp-passo.pronto .gp-passo-num { background: var(--yd); color: var(--yellow); }
  .gp-passo.atual {
    border-color: var(--yellow); background: var(--yd); color: var(--black);
  }
  .gp-passo.atual .gp-passo-num { background: var(--yellow); color: var(--on-yellow); }
  @media (prefers-reduced-motion: reduce) {
    .gp-passo, .gp-passo-num { transition: none; }
    .gp-passo:hover { transform: none; }
  }
  /* O painel fora da aba sai por display, e nao desmontado: o formulario fica de
     pe com o que ja foi escrito. Duas classes, para vencer o display do grid. */
  .gp-fora, .gp-lado-a-lado.gp-fora { display: none; }

  .gp-hist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .gp-hist-item {
    display: flex; align-items: center; gap: 12px; padding: 12px 14px;
    background: var(--white); border: 1px solid var(--gray3); border-radius: var(--radius-md);
  }
  .gp-hist-icone {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 30px; height: 30px; border-radius: var(--radius-sm); background: var(--gray4); color: var(--gray);
  }
  .gp-hist-texto { flex: 1; min-width: 0; }
  .gp-hist-titulo, .gp-hist-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0; }
  .gp-hist-titulo { font-size: 13px; font-weight: 800; color: var(--black); }
  .gp-hist-sub { font-size: 12px; color: var(--gray); margin-top: 1px; }
  .gp-hist-meta { font-size: 11.5px; color: var(--gray2); margin: 2px 0 0; }
  .gp-hist-acoes { display: flex; align-items: center; gap: 6px; flex: none; }
  .gp-hist-acoes .btn { display: inline-flex; align-items: center; gap: 6px; }
  .gp-hist-lead {
    display: inline-flex; align-items: center; gap: 5px; max-width: 200px;
    padding: 4px 10px; border: 1px solid var(--gray3); border-radius: var(--radius-pill);
    background: none; font-family: inherit; font-size: 11.5px; font-weight: 700; color: var(--gray);
    cursor: pointer; transition: border-color var(--transition), color var(--transition);
  }
  .gp-hist-lead span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gp-hist-lead:hover:not(:disabled) { border-color: var(--gray2); color: var(--black); }
  .gp-hist-lead:disabled { cursor: default; }
  .gp-hist-nota { font-size: 11.5px; color: var(--gray2); line-height: 1.5; max-width: 420px; margin: 6px auto 0; }
  @media (max-width: 700px) {
    .gp-hist-item { flex-wrap: wrap; }
    .gp-hist-acoes { width: 100%; flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: reduce) {
    .gp-hist-lead { transition: none; }
  }

  /* O formulário fica estreito de propósito: os campos empilham, e a largura
     que sobra vai toda para o slide, que é o que precisa ser lido. */
  .gp-lado-a-lado {
    display: grid; grid-template-columns: minmax(280px, 0.36fr) minmax(0, 1fr);
    gap: 18px; align-items: start;
  }
  @media (max-width: 1100px) {
    .gp-lado-a-lado { grid-template-columns: minmax(0, 1fr); }
  }

  .gp-card {
    background: var(--white); border: 1px solid var(--gray3);
    border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card);
  }
  .gp-secao {
    display: flex; align-items: center; gap: 10px;
    font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
    color: var(--gray2); margin-top: 26px;
  }
  .gp-secao:first-child { margin-top: 0; }
  /* Uma coluna, em qualquer largura: um campo por linha faz a leitura descer
     reta, e a largura que sobra é do slide. */
  .gp-grade {
    display: grid; grid-template-columns: minmax(0, 1fr);
    gap: 12px; margin-top: 10px;
  }
  .gp-campo { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .gp-dica { font-size: 11px; color: var(--gray2); line-height: 1.45; margin-top: 6px; }
  .gp-linha { display: flex; align-items: center; gap: 6px; }
  .gp-linha .form-input { flex: 1; }
  .gp-x {
    display: inline-flex; align-items: center; justify-content: center; gap: 5px;
    background: none; border: none; padding: 4px 6px; cursor: pointer; font-family: inherit;
    font-size: 11px; font-weight: 700; color: var(--gray2); border-radius: var(--radius-sm);
    transition: color var(--transition), background var(--transition);
  }
  .gp-x:hover { color: var(--red); background: var(--gray4); }
  .gp-mais, .gp-anexar, .gp-ligar, .gp-voltar {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 5px;
    background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
    font-size: 11.5px; font-weight: 700; color: var(--gray);
    transition: color var(--transition);
  }
  .gp-mais { margin-top: 10px; }
  .gp-mais:hover, .gp-anexar:hover, .gp-ligar:hover, .gp-voltar:hover:not(:disabled) { color: var(--black); }
  .gp-voltar:disabled { color: var(--gray3); cursor: default; }
  .gp-ligar { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .gp-entrega, .gp-fase, .gp-opcao, .gp-time {
    border: 1px solid var(--gray3); border-radius: var(--radius-md);
    padding: 14px 16px; margin-top: 10px; background: var(--bg);
  }
  .gp-opcao.rec { border-color: var(--yellow); background: var(--yd); }
  .gp-entrega-topo, .gp-fase-topo {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .gp-entrega-num, .gp-fase-nome { font-size: 11.5px; font-weight: 800; color: var(--black); }
  .gp-entrega-topo .gp-x, .gp-fase-topo .gp-x { margin-left: auto; }
  .gp-fase-meses { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .gp-fase-meses label {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; color: var(--gray2);
  }
  .gp-mini { width: 54px; padding: 6px 8px; text-align: center; }
  .gp-proto {
    display: flex; align-items: center; gap: 8px;
    font-size: 11.5px; color: var(--gray);
    background: var(--white); border: 1px solid var(--gray3);
    border-radius: var(--radius-md); padding: 8px 12px;
  }
  .gp-proto .gp-x { margin-left: auto; }
  .gp-problemas {
    margin-top: 16px; padding: 14px 16px;
    border: 1px solid var(--red); border-radius: var(--radius-md);
    background: var(--bg); font-size: 12px; color: var(--gray); line-height: 1.55;
  }
  .gp-problemas ul { margin: 6px 0 0; padding-left: 18px; }
  .gp-rodape {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 18px;
  }
  .gp-rodape .btn { display: inline-flex; align-items: center; gap: 7px; }
  .gp-falta { font-size: 11.5px; color: var(--gray2); }
  .gp-andar {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--gray3);
  }
  .gp-andar .btn { margin-left: auto; display: inline-flex; align-items: center; gap: 7px; }

  .gp-previa {
    position: sticky; top: 18px;
    background: var(--white); border: 1px solid var(--gray3);
    border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-card);
  }
  .gp-previa-topo {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    border-bottom: 1px solid var(--gray3);
    font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase;
    color: var(--gray2);
  }
  .gp-previa-secao {
    margin-left: auto; text-transform: none; letter-spacing: 0;
    font-size: 11.5px; font-weight: 700; color: var(--black);
  }
  /* 16:9, que é a proporção do deck. */
  .gp-previa iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }
  .gp-previa-vazia {
    aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center;
    font-size: 12px; color: var(--gray2); background: var(--bg);
  }
`;
