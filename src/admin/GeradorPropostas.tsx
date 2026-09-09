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
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowRight, IconDownload, IconPlus, IconTrash, IconUpload } from '../components/icons';
import { AbaPainel, Abas } from '../components/Abas';
import { useAuth, useToast } from './AdminApp';
import { montarPrevia, montarProposta, type Conferencia } from '../lib/proposta/montar';
import { propostaEmBranco } from '../lib/proposta/exemplo';
import type { DadosProposta, Entrega, Fase, OpcaoInvestimento } from '../lib/proposta/tipos';

/** O template mora em `public/` e é buscado na hora: são 83 kB que só quem
 *  monta uma proposta precisa baixar. */
async function lerTemplate(): Promise<string | null> {
  try {
    const r = await fetch('/propostas/base.v3.template.html');
    if (!r.ok) return null;
    return r.text();
  } catch {
    return null;
  }
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

export default function GeradorPropostas() {
  const { toast } = useToast();
  const { usuario } = useAuth();
  const [d, setD] = useState<DadosProposta>(propostaEmBranco);
  const [template, setTemplate] = useState<string | null>(null);
  const [passo, setPasso] = useState(0);
  const [entregaEmFoco, setEntregaEmFoco] = useState(0);
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  /** Os dados de um instante atrás, que é o que a prévia mostra. */
  const [dParaPrevia, setDParaPrevia] = useState<DadosProposta>(d);

  useEffect(() => { void lerTemplate().then(setTemplate); }, []);

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
  const irParaOPasso = (id: PassoId) => setPasso(PASSOS.findIndex(p => p.id === id));
  // No passo das entregas a prévia segue a entrega em que se está digitando. O
  // alvo é montado igual ao `data-secao` do slide, senão não é achado lá dentro.
  const secaoDaPrevia = atual.id === 'entregas'
    ? `Entrega ${entregaEmFoco + 1} · ${dParaPrevia.entregas[entregaEmFoco]?.nome ?? ''}`
    : atual.secao;

  const nomeDoArquivo = useMemo(() => {
    const base = d.cliente.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_');
    return `Proposta_${base || 'Cliente'}_${new Date().toISOString().slice(0, 10)}`;
  }, [d.cliente]);

  const faltando = [
    !d.cliente.trim() && 'cliente',
    !d.subtitulo.trim() && 'subtítulo',
    !d.projeto.trim() && 'o texto do projeto',
    !d.entregas.some(e => e.nome.trim()) && 'ao menos uma entrega',
    !d.investimento.opcoes.some(o => o.valor.trim()) && 'o valor do investimento',
    !d.investimento.memoria.trim() && 'a memória de cálculo',
  ].filter(Boolean) as string[];

  /** Não é campo, é a sessão: fica de fora da lista do que falta preencher,
   *  senão manda voltar a um passo onde não há o que digitar. */
  const semQuemPrepara = !d.preparadoPor.trim();

  function baixar() {
    if (!template) return;
    const r = montarProposta(template, limpar(d, false));
    setConferencia(r.conferencia);
    if (!r.ok) {
      toast('error', 'A proposta não passou na conferência', r.conferencia.problemas[0]);
      return;
    }
    const url = URL.createObjectURL(new Blob([r.html], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nomeDoArquivo}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('success', 'Proposta gerada', `${d.cliente}, ${r.conferencia.slides} slides`);
  }

  return (
    <div className="admin-content-wrap">
      <style>{ESTILO}</style>

      {/* Os passos são as abas da casa, as mesmas de Configurações, sentadas na
          linha do cabeçalho: a faixa ao lado do título estava vazia, e uma
          fileira só para elas empurrava a prévia para baixo. Clicar num passo
          já visitado volta para ele, porque o formulário não tranca ninguém
          andando para frente. */}
      <div className="admin-page-header gp-cabecalho">
        <div className="gp-titulo">
          <h1 className="admin-page-title">Gerador de Propostas</h1>
          <p className="admin-page-desc">A apresentação da casa, um passo por vez</p>
        </div>
        <Abas valor={atual.id} onChange={irParaOPasso}
          opcoes={PASSOS.map(p => ({ valor: p.id, label: p.titulo }))} />
      </div>

      <div className="gp-lado-a-lado">
        <AbaPainel key={atual.id}>
        <div className="gp-card">
          {atual.id === 'capa' && (
            <>
              <p className="gp-secao">A proposta</p>
              <div className="gp-grade">
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
  /* As abas sentam na linha do cabeçalho, e não numa fileira própria. A linha
     passa a ser do cabeçalho inteiro - é ela que atravessa a página -, a das
     abas sai, e o traço da aba ativa desce para pousar em cima dela. É o mesmo
     arranjo que o cabeçalho de modal já usa com abas. */
  .gp-cabecalho {
    align-items: flex-end; flex-wrap: wrap; gap: 4px 24px;
    padding-bottom: 0; border-bottom: 1.5px solid var(--gray3);
  }
  .gp-titulo { padding-bottom: 12px; }
  .gp-cabecalho .config-tabs { border-bottom: none; margin-bottom: 0; }
  .gp-cabecalho .config-tab-traco { bottom: -1.5px; }

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
