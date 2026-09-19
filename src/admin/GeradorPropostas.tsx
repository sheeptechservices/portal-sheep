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
  IconArrowLeft, IconArrowRight, IconCheck, IconChevronRight, IconDoc, IconDownload, IconEdit, IconEye,
  IconFunil, IconInbox, IconPlus, IconSparkles, IconSpinner, IconTrash, IconUpload,
} from '../components/icons';
import { AbaPainel, Abas } from '../components/Abas';
import { SelectSistema } from '../components/SelectSistema';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { CampoTexto } from '../components/CampoTexto';
import { Chave } from '../components/Chave';
import { Dialogo } from '../components/Dialogo';
import {
  ProgressoDaIa, usePreenchimentoPorIa, type InformadoParaIa, type PropostaDaIa,
} from './PreenchimentoPorIa';
import { useRevelar } from '../lib/useRevelar';
import { useAuth, useToast } from './AdminApp';
import { montarPrevia, montarProposta, type Conferencia } from '../lib/proposta/montar';
import { infraEmBranco, propostaEmBranco } from '../lib/proposta/exemplo';
import { emBase64, htmlDaProposta, lerTemplate } from '../lib/proposta/gerar';
import { baixarPdfDaProposta } from '../lib/proposta/pdf';
import { instante, tempoRelativo } from '../lib/datas';
import type {
  DadosProposta, Entrega, Fase, InfraManutencao, ItemDeInfra, OpcaoInvestimento,
} from '../lib/proposta/tipos';
import { CENARIOS, NOME_DO_CENARIO, manutencaoSugerida } from '../lib/proposta/tipos';

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

/** O nome do arquivo que sai: cliente e data, sem o que o sistema de arquivos
 *  não aceita. */
function nomeDoArquivoDe(cliente: string, data = new Date().toISOString()) {
  const base = cliente.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '_');
  return `Proposta_${base || 'Cliente'}_${data.slice(0, 10)}`;
}

/** Os passos, e qual slide a prévia mostra em cada um. */
type PassoId = 'capa' | 'projeto' | 'entregas' | 'operacao' | 'cronograma' | 'investimento' | 'infra' | 'fim';

const PASSOS: { id: PassoId; titulo: string; secao: string | null }[] = [
  { id: 'capa', titulo: 'A proposta', secao: null },
  { id: 'projeto', titulo: 'O projeto', secao: 'O projeto' },
  { id: 'entregas', titulo: 'Entregas', secao: null },
  { id: 'operacao', titulo: 'Como funciona', secao: 'Como funciona' },
  { id: 'cronograma', titulo: 'Cronograma', secao: 'Cronograma' },
  { id: 'investimento', titulo: 'Investimento', secao: 'Investimento' },
  { id: 'infra', titulo: 'Infra', secao: 'Infra e manutenção' },
  { id: 'fim', titulo: 'Gerar', secao: null },
];

// ── Travessões: onde estão, e a troca de todos ──────────────────────────────

/** Um travessão achado no formulário: em que passo, em que campo e o trecho em
 *  volta dele, para quem vai corrigir saber o que procurar. */
interface Travessao { passo: PassoId; campo: string; antes: string; traco: string; depois: string }

/** Travessão longo e médio, pelo código de cada um: o caractere escrito no
 *  arquivo é o que a própria regra da casa proíbe. */
const TRACOS = /[\u2014\u2013]/g;

/**
 * Todos os travessões do formulário, campo a campo.
 *
 * O montador conta os travessões do arquivo inteiro e recusa, mas "6
 * travessões no texto visível" não diz onde eles estão - e numa proposta de
 * dezenove campos, achar à mão é ler tudo de novo. Aqui cada um vem com o
 * passo, o nome do campo e o pedaço de texto em volta.
 */
function ondeHaTravessao(d: DadosProposta): Travessao[] {
  const achados: Travessao[] = [];
  const ver = (passo: PassoId, campo: string, texto: string | undefined | null) => {
    const s = String(texto ?? '');
    for (const m of s.matchAll(TRACOS)) {
      const i = m.index ?? 0;
      const limpar = (x: string) => x.replace(/\s+/g, ' ');
      achados.push({
        passo, campo,
        antes: (i > 30 ? '...' : '') + limpar(s.slice(Math.max(0, i - 30), i)),
        traco: m[0],
        depois: limpar(s.slice(i + 1, i + 31)) + (i + 31 < s.length ? '...' : ''),
      });
    }
  };
  ver('capa', 'Cliente', d.cliente);
  ver('capa', 'Subtítulo', d.subtitulo);
  ver('projeto', 'A situação', d.projeto);
  d.ganhos.forEach((g, i) => ver('projeto', `Ganho ${i + 1}`, g));
  d.entregas.forEach((e, i) => {
    ver('entregas', `Entrega ${i + 1} · Nome`, e.nome);
    ver('entregas', `Entrega ${i + 1} · Resumo`, e.resumo);
    e.itens.forEach((x, k) => ver('entregas', `Entrega ${i + 1} · Item ${k + 1}`, x));
  });
  if (d.comoFunciona) {
    ver('operacao', 'Linha fina', d.comoFunciona.linhaFina);
    d.comoFunciona.passos.forEach((p, i) => {
      ver('operacao', `Passo ${i + 1} · Título`, p.titulo);
      ver('operacao', `Passo ${i + 1} · Texto`, p.texto);
    });
    ver('operacao', 'A conta que sustenta o prazo', d.comoFunciona.nota);
  }
  d.cronograma.fases.forEach(f => {
    f.sub.forEach((x, k) => ver('cronograma', `${f.nome} · Atividade ${k + 1}`, x));
    f.entregas.forEach((x, k) => ver('cronograma', `${f.nome} · Entrega ${k + 1}`, x));
  });
  d.investimento.opcoes.forEach(o => {
    ver('investimento', `${o.rotulo} · Linha fina`, o.titulo);
    ver('investimento', `${o.rotulo} · Valor`, o.valor);
    ver('investimento', `${o.rotulo} · O que o valor compra`, o.unidade);
    ver('investimento', `${o.rotulo} · Destaque`, o.destaque?.valor);
    ver('investimento', `${o.rotulo} · Texto do destaque`, o.destaque?.texto);
    ver('investimento', `${o.rotulo} · Nota do destaque`, o.destaque?.nota);
    o.bullets.forEach((b, k) => ver('investimento', `${o.rotulo} · Bullet ${k + 1}`, b));
  });
  d.investimento.time.forEach((p, i) => {
    ver('investimento', `Pessoa ${i + 1} · Papel`, p.papel);
    ver('investimento', `Pessoa ${i + 1} · Dedicação`, p.dedicacao);
    ver('investimento', `Pessoa ${i + 1} · O que faz`, p.descricao);
  });
  ver('investimento', 'Memória de cálculo', d.investimento.memoria);
  if (d.infra) {
    const inf = d.infra;
    CENARIOS.forEach(c => ver('infra', `Premissa ${NOME_DO_CENARIO[c].toLowerCase()}`, inf.premissas[c]));
    inf.itens.forEach((x, i) => {
      ver('infra', `Serviço ${i + 1}`, x.servico);
      ver('infra', `Serviço ${i + 1} · O que foi precificado`, x.detalhe);
    });
    ver('infra', 'De onde vêm os preços', inf.fonte);
    ver('infra', 'Manutenção · O que o valor compra', inf.manutencao.unidade);
    inf.manutencao.inclui.forEach((x, k) => ver('infra', `Manutenção · Inclui ${k + 1}`, x));
    inf.manutencao.naoInclui.forEach((x, k) => ver('infra', `Manutenção · Não inclui ${k + 1}`, x));
    ver('infra', 'Nota sob a tabela', inf.nota);
  }
  return achados;
}

/** O formulário com todo travessão trocado por hífen cercado de espaços, que é
 *  o substituto da casa. O HTML do protótipo não entra: é arquivo de quem
 *  subiu, e o montador não o lê como texto. */
function semTravessao(d: DadosProposta): DadosProposta {
  const troca = (s: string) => s.replace(/\s*[\u2014\u2013]\s*/g, ' - ');
  const fundo = (v: any): any => {
    if (typeof v === 'string') return troca(v);
    if (Array.isArray(v)) return v.map(fundo);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'prototipo' ? x : fundo(x)]));
    }
    return v;
  };
  return fundo(d) as DadosProposta;
}

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

/** Texto que vai para o slide. É o campo da casa: Enter quebra a linha,
 *  Ctrl+B, Ctrl+I e Ctrl+U formatam, "- " abre uma lista - e tudo isso sai igual
 *  na prévia e no arquivo final, em vez de juntar num bloco só.
 *
 *  `div` e não `label`: o campo é `contentEditable`, e um `label` em volta
 *  mandaria o clique em qualquer lugar dele para o primeiro campo de dentro. */
function Texto({ rotulo, valor, onChange, placeholder, linhas = 4, dica }: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  linhas?: number;
  dica?: string;
}) {
  return (
    <div className="gp-campo">
      <span className="form-label">{rotulo}</span>
      <CampoTexto valor={valor} onMudar={onChange} placeholder={placeholder}
        linhas={linhas} ariaLabel={rotulo} />
      {dica && <span className="gp-dica">{dica}</span>}
    </div>
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

/**
 * O passo de infra e manutenção.
 *
 * Os valores de infra vêm da tabela da AWS, pela IA, ou de quem consultou à
 * mão: o formulário não sugere número nenhum ali. A manutenção é o contrário -
 * tem um padrão da casa, 10% do valor mensal do contrato, e o botão o aplica
 * com a conta à vista.
 */
function PassoDeInfra({ inf, sugestao, onChange }: {
  inf: InfraManutencao;
  sugestao: { valor: string; base: string } | null;
  onChange: (v: InfraManutencao) => void;
}) {
  const trocarItem = (i: number, v: ItemDeInfra) =>
    onChange({ ...inf, itens: inf.itens.map((x, k) => (k === i ? v : x)) });
  const manutencao = (m: Partial<InfraManutencao['manutencao']>) =>
    onChange({ ...inf, manutencao: { ...inf.manutencao, ...m } });

  return (
    <div className="gp-grade surge">
      <div className="gp-campo">
        <span className="form-label">O que cada cenário supõe</span>
        {CENARIOS.map(c => (
          <div key={c} className="gp-linha">
            <span className="gp-cenario">{NOME_DO_CENARIO[c]}</span>
            <input className="form-input" value={inf.premissas[c]}
              aria-label={`Premissa do cenário ${NOME_DO_CENARIO[c].toLowerCase()}`}
              placeholder={c === 'otimista' ? 'Até 100 usuários, 2 GB de dados'
                : c === 'realista' ? 'Cerca de 300 usuários, 10 GB de dados'
                  : 'Mil usuários em pico, 50 GB de dados'}
              onChange={e => onChange({ ...inf, premissas: { ...inf.premissas, [c]: e.target.value } })} />
          </div>
        ))}
      </div>

      {inf.itens.map((item, i) => (
        <div key={i} className="gp-time">
          <div className="gp-entrega-topo">
            <span className="gp-entrega-num">Serviço {i + 1}</span>
            {inf.itens.length > 1 && (
              <button type="button" className="gp-x" aria-label={`Remover o serviço ${i + 1}`}
                onClick={() => onChange({ ...inf, itens: inf.itens.filter((_, k) => k !== i) })}>
                <IconTrash size={13} />
              </button>
            )}
          </div>
          <div className="gp-grade">
            <Campo rotulo="Serviço" valor={item.servico} placeholder="Servidor da aplicação"
              onChange={v => trocarItem(i, { ...item, servico: v })} />
            <Campo rotulo="O que foi precificado" valor={item.detalhe}
              placeholder="EC2 t4g.medium, São Paulo, 24h por dia"
              onChange={v => trocarItem(i, { ...item, detalhe: v })} />
            <div className="gp-campo">
              <span className="form-label">Custo por mês, em reais</span>
              <div className="gp-infra-valores">
                {CENARIOS.map(c => (
                  <label key={c} className="gp-campo">
                    <span className="gp-cenario">{NOME_DO_CENARIO[c]}</span>
                    <input className="form-input" value={item.valores[c]} inputMode="decimal"
                      placeholder="0,00"
                      aria-label={`${item.servico || 'Serviço'}, cenário ${NOME_DO_CENARIO[c].toLowerCase()}`}
                      onChange={e => trocarItem(i, { ...item, valores: { ...item.valores, [c]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
      {inf.itens.length < MAX_INFRA && (
        <button type="button" className="gp-mais"
          onClick={() => onChange({
            ...inf,
            itens: [...inf.itens, { servico: '', detalhe: '', valores: { otimista: '', realista: '', pessimista: '' } }],
          })}>
          <IconPlus size={12} /> Mais um serviço
        </button>
      )}

      <Campo rotulo="De onde vêm os preços" valor={inf.fonte}
        placeholder="Tabela de preços da AWS consultada em 18/09/2026, região São Paulo, preços sob demanda."
        onChange={v => onChange({ ...inf, fonte: v })}
        dica="Aparece em letra pequena sob a tabela: é o que deixa o cliente conferir a conta." />

      <p className="gp-secao">Manutenção</p>
      <div className="gp-campo">
        <span className="form-label">Valor por mês</span>
        <div className="gp-linha">
          <input className="form-input" value={inf.manutencao.valor} inputMode="decimal"
            aria-label="Valor da manutenção por mês" placeholder="2.160"
            onChange={e => manutencao({ valor: e.target.value })} />
          {sugestao && sugestao.valor !== inf.manutencao.valor && (
            <button type="button" className="btn btn-secondary gp-sugerir surge"
              onClick={() => manutencao({ valor: sugestao.valor })}>
              Usar R$ {sugestao.valor}
            </button>
          )}
        </div>
        <span className="gp-dica">
          {sugestao
            ? `O padrão da casa é 10% do valor mensal do contrato: ${sugestao.base} dá R$ ${sugestao.valor}.`
            : 'O padrão da casa é 10% do valor mensal do contrato. Preencha o investimento para ver a sugestão.'}
        </span>
      </div>
      <Campo rotulo="O que o valor compra" valor={inf.manutencao.unidade}
        onChange={v => manutencao({ unidade: v })} />
      <Lista rotulo="Inclui" itens={inf.manutencao.inclui} onChange={v => manutencao({ inclui: v })} />
      <Lista rotulo="Não inclui" itens={inf.manutencao.naoInclui} onChange={v => manutencao({ naoInclui: v })}
        dica="Sem essa lista, manutenção vira escopo aberto." />
      <Texto rotulo="Nota sob a tabela" valor={inf.nota} linhas={2}
        onChange={v => onChange({ ...inf, nota: v })}
        placeholder="O que move o custo de um cenário para o outro." />
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

/** Quantas pessoas o time alocado mostra. O time divide o slide de investimento
 *  com as opções e a memória de cálculo, e o slide tem de caber numa tela. Da
 *  quarta pessoa em diante o slide põe o time em duas colunas; medido no tamanho
 *  do PDF (1280x720), com três opções e toda pessoa com descrição, seis cabem e
 *  a sétima passa por cima do rodapé. */
const MAX_TIME = 6;
/** Serviços na tabela de infra: seis linhas mais as três contas é o que cabe
 *  no slide sem passar do rodapé. */
const MAX_INFRA = 6;

/** Quantas pessoas um papel pode ter. É o número que vai para a etiqueta do
 *  slide, e não uma linha por pessoa: o limite é só para um erro de digitação
 *  (um 20 no lugar de 2) não sair na proposta. */
const MAX_POR_PAPEL = 20;

/** Quantas opções cabem lado a lado no slide de investimento. Três é o teto: com
 *  quatro, o card fica estreito demais para o preço e o destaque, e a escolha
 *  vira uma tabela em vez de uma decisão. */
const MAX_OPCOES = 3;

/** As opções depois de uma entrar ou sair: a etiqueta segue a posição ("Opção
 *  A", "B", "C"), e sempre há uma recomendada. Tirar a recomendada passa o
 *  destaque para a primeira que sobrou - sem ele, o slide perde a borda que diz
 *  ao cliente por onde começar. */
function emOrdem(opcoes: OpcaoInvestimento[]): OpcaoInvestimento[] {
  const temRecomendada = opcoes.some(o => o.recomendada);
  return opcoes.map((o, i) => ({
    ...o,
    rotulo: `Opção ${String.fromCharCode(65 + i)}`,
    recomendada: temRecomendada ? !!o.recomendada : i === 0,
  }));
}

function CardDeOpcao({ o, onChange, onRemover }: {
  o: OpcaoInvestimento;
  onChange: (v: OpcaoInvestimento) => void;
  /** Ausente quando é a única: proposta sem opção nenhuma não tem preço. */
  onRemover?: () => void;
}) {
  const d = o.destaque ?? { valor: '', texto: '', nota: '' };
  return (
    <div className={`gp-opcao${o.recomendada ? ' rec' : ''}`}>
      <div className="gp-entrega-topo">
        <span className="gp-entrega-num">{o.rotulo}{o.recomendada ? ' · recomendada' : ''}</span>
        {onRemover && (
          <button type="button" className="gp-x" aria-label={`Remover ${o.rotulo}`} onClick={onRemover}>
            <IconTrash size={13} />
          </button>
        )}
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
          dica="Os bullets se espelham entre as opções: a mesma pergunta respondida em todas, inclusive quando a resposta é ruim." />
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
function HistoricoPropostas({ lista, onVer, onEditar, abrindo, editando, baixando, onBaixar, onAbrirLead }: {
  /** `null` enquanto a lista não chegou. */
  lista: PropostaGerada[] | null;
  onVer: (p: PropostaGerada) => void;
  /** Abre a proposta no formulário, em modo de edição. */
  onEditar: (p: PropostaGerada) => void;
  /** A que está sendo aberta agora, para o botão dela girar. */
  abrindo: number | null;
  /** A que já está aberta no formulário. */
  editando: number | null;
  /** A que está virando PDF agora, para o botão dela girar. */
  baixando: number | null;
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
          Toda proposta que sai do gerador entra nesta lista, presa à oportunidade do funil - e daqui
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
              title={onAbrirLead ? 'Abrir a oportunidade no Funil' : undefined}
              onClick={() => onAbrirLead?.(p.oportunidade_id)}>
              <IconFunil size={12} />
              <span>{p.lead_empresa ?? 'Oportunidade removida'}</span>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVer(p)}>
              <IconEye size={13} /> Ver
            </button>
            <button type="button" className="btn btn-secondary btn-sm"
              disabled={abrindo != null}
              title={editando === p.id ? 'Esta proposta já está aberta no gerador' : 'Abrir no gerador para editar'}
              onClick={() => onEditar(p)}>
              {abrindo === p.id ? <IconSpinner size={13} /> : <IconEdit size={13} />}
              {editando === p.id ? 'Em edição' : 'Editar'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onBaixar(p)}
              disabled={baixando === p.id}>
              {baixando === p.id ? <IconSpinner size={13} /> : <IconDownload size={13} />} Baixar PDF
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
  /** A proposta do histórico aberta para edição. Nula: o formulário é de uma
   *  proposta nova. `original` é o formulário como abriu, para saber se algo
   *  mudou - salvar sem mudança nenhuma seria só um carimbo de data. */
  const [editando, setEditando] = useState<{ id: number; linha: PropostaGerada; original: string } | null>(null);
  /** Qual proposta está sendo aberta para edição, enquanto os campos dela vêm. */
  const [abrindo, setAbrindo] = useState<number | null>(null);
  /** O formulário que estava na tela antes da edição - uma proposta nova pela
   *  metade -, para voltar a ele ao sair, em vez de perdê-lo. */
  const guardado = useRef<{ d: DadosProposta; leadId: string } | null>(null);
  /** A pergunta de como salvar a edição, aberta com ela já conferida. */
  const [comoSalvar, setComoSalvar] = useState<{ final: DadosProposta; slides: number } | null>(null);
  /** O PDF do formulário sendo montado no servidor. */
  const [gerandoPdf, setGerandoPdf] = useState(false);
  /** A proposta do histórico que está virando PDF. */
  const [baixando, setBaixando] = useState<number | null>(null);
  /** O lead do funil a que a proposta pertence. Obrigatório para gerar. */
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState<LeadDoFunil[] | null>(null);
  /** As etapas do funil, para o cadastro de lead perguntar em qual ele entra. */
  const [etapasDoFunil, setEtapasDoFunil] = useState<StatusConfig[]>([]);
  /** O cadastro de lead aberto, com a empresa que já foi digitada na busca. */
  const [novoLead, setNovoLead] = useState<{ empresa: string } | null>(null);

  const [d, setD] = useState<DadosProposta>(propostaEmBranco);

  // ── A IA, opcional ──
  /** O bloco da IA aberto. Fechado por padrão: preencher com IA é escolha, e o
   *  primeiro passo continua sendo escolher a oportunidade. */
  const [comIa, setComIa] = useState(false);
  const blocoDaIa = useRevelar(comIa);
  /** A seção inteira da IA, que só existe com a oportunidade escolhida. */
  const secaoDaIa = useRevelar(!!leadId);
  /** O que o operador escreve para a IA: o que não está no card nem nas
   *  reuniões. */
  const [contextoIa, setContextoIa] = useState('');
  /** O que o operador já decidiu, em campo próprio: vai para a IA como decisão,
   *  e não como sugestão misturada ao texto livre. Campo vazio não vai. */
  const [informadoIa, setInformadoIa] = useState<InformadoParaIa>({
    formato: '', opcoes: 0, valor: '', prazo: '', time: '',
  });
  const informar = (parte: Partial<InformadoParaIa>) => setInformadoIa(a => ({ ...a, ...parte }));
  /** O formulário de antes do preenchimento, para ele poder ser desfeito
   *  inteiro. Nulo quando não há o que desfazer. */
  const [antesDaIa, setAntesDaIa] = useState<DadosProposta | null>(null);
  const ia = usePreenchimentoPorIa(token, onSessionExpired);
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

  /** Pede a proposta à IA e põe o que voltou no formulário. O que não é dela -
   *  quem prepara, quem apresenta, a validade - fica como estava, e campo que
   *  ela devolveu vazio não apaga o que o operador já tinha escrito. */
  async function preencherComIa() {
    if (!leadId || ia.andamento) return;
    const r = await ia.preencher(leadId, contextoIa.trim(), informadoIa);
    if (!r.ok) {
      if (!('cancelado' in r)) toast('error', 'A IA não preencheu a proposta', r.erro);
      return;
    }
    const nova: PropostaDaIa = r.proposta;
    setAntesDaIa(d);
    setD(a => ({
      ...a,
      cliente: nova.cliente || a.cliente,
      subtitulo: nova.subtitulo || a.subtitulo,
      projeto: nova.projeto || a.projeto,
      ganhos: nova.ganhos.length ? nova.ganhos : a.ganhos,
      entregas: nova.entregas.length ? nova.entregas : a.entregas,
      comoFunciona: nova.comoFunciona ?? undefined,
      cronograma: nova.cronograma,
      investimento: {
        ...nova.investimento,
        time: nova.investimento.time.length ? nova.investimento.time : a.investimento.time,
      },
      infra: nova.infra ?? undefined,
    }));
    setEntregaEmFoco(0);
    const leu = r.reunioes
      ? `Leu o card e ${r.reunioes === 1 ? 'uma reunião' : `${r.reunioes} reuniões`}`
      : 'Leu o card; não havia reunião presa à oportunidade';
    const precos = r.consultasAws
      ? `, e consultou ${r.consultasAws === 1 ? 'um preço' : `${r.consultasAws} preços`} na AWS`
      : '';
    toast('success', 'Proposta preenchida pela IA',
      `${leu}${precos}. Passe pelos passos conferindo o que ela escreveu.`);
  }

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
  // A manutenção que a casa sugere, a partir do investimento: muda quando o
  // valor ou o formato da opção recomendada mudam.
  const sugestaoDeManutencao = useMemo(() => manutencaoSugerida(d), [d.investimento, d.cronograma.meses]);

  const faltando = [
    !leadId && 'a oportunidade',
    !d.cliente.trim() && 'cliente',
    !d.subtitulo.trim() && 'subtítulo',
    !d.projeto.trim() && 'o texto do projeto',
    !d.entregas.some(e => e.nome.trim()) && 'ao menos uma entrega',
    !d.investimento.opcoes.some(o => o.valor.trim()) && 'o valor do investimento',
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
      // A memória de cálculo ajuda a defender o preço, mas é opcional: há
      // proposta em que a conta não vai para o cliente.
      case 'investimento': return d.investimento.opcoes.some(o => o.valor.trim());
      default: return false;
    }
  };

  /** Não é campo, é a sessão: fica de fora da lista do que falta preencher,
   *  senão manda voltar a um passo onde não há o que digitar. */
  const semQuemPrepara = !d.preparadoPor.trim();

  async function baixar() {
    if (!template || !leadId || gerandoPdf) return;
    const final = limpar(d, false);
    const r = montarProposta(template, final);
    setConferencia(r.conferencia);
    if (!r.ok) {
      toast('error', 'A proposta não passou na conferência', r.conferencia.problemas[0]);
      return;
    }
    // O arquivo é PDF, montado no servidor: leva alguns segundos, e o botão
    // gira enquanto isso. Sem o PDF, nada é registrado - o funil não pode
    // ganhar o chip de uma proposta que não saiu.
    setGerandoPdf(true);
    const pdf = await baixarPdfDaProposta(r.html, nomeDoArquivo, token);
    setGerandoPdf(false);
    if (!pdf.ok) {
      toast('error', 'O PDF não saiu', pdf.erro);
      return;
    }
    // Editando, o arquivo sai e a pergunta de como salvar abre: sobrescrever
    // regrava pelo id, e salvar como nova guarda uma cópia ao lado da original.
    // Pelo registro comum, com o subtítulo trocado, ela viraria uma segunda
    // proposta sem ninguém ter escolhido isso.
    if (editando) { pedirComoSalvar(r.conferencia.slides); return; }
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
      toast('error', 'A proposta saiu, mas não ficou presa à oportunidade',
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

  // ── Edição de uma proposta do histórico ──

  /** Os travessões do formulário, onde estão. Contados a cada mudança: é um
   *  passeio pelos campos, e é o que deixa a lista sumir sozinha conforme a
   *  pessoa corrige. */
  const travessoes = useMemo(() => ondeHaTravessao(d), [d]);

  /** Algo mudou desde que a proposta foi aberta. */
  const mudou = !!editando && JSON.stringify({ d, leadId }) !== editando.original;

  /** Abre uma proposta do histórico no formulário. O que estava na tela antes
   *  fica guardado, e volta quando a edição termina - salvando ou não. */
  async function editarDoHistorico(p: PropostaGerada) {
    if (abrindo != null) return;
    setAbrindo(p.id);
    const r = await api(`?action=proposta_dados&id=${p.id}`).catch(() => null);
    setAbrindo(null);
    if (!r?.dados) {
      toast('error', 'Não consegui abrir esta proposta', r?.error ?? 'Tente de novo.');
      return;
    }
    // Só a primeira edição guarda o formulário: trocar de uma proposta aberta
    // para outra não pode perder a proposta nova que ficou pela metade.
    if (!editando) guardado.current = { d, leadId };
    const carregado: DadosProposta = { ...propostaEmBranco(), ...(r.dados as DadosProposta) };
    setD(carregado);
    setLeadId(p.oportunidade_id);
    setEditando({ id: p.id, linha: p, original: JSON.stringify({ d: carregado, leadId: p.oportunidade_id }) });
    setPasso(0);
    setEntregaEmFoco(0);
    setConferencia(null);
    setAntesDaIa(null);
    setAba('gerador');
  }

  /** Sai da edição e devolve à tela o formulário de antes. Devolve o que estava
   *  guardado, para quem precisar voltar à edição (a gravação que falhou). */
  function sairDaEdicao(voltarAoHistorico = true) {
    const g = guardado.current;
    guardado.current = null;
    setD(g?.d ?? { ...propostaEmBranco(), preparadoPor: usuario?.nome ?? '' });
    setLeadId(g?.leadId ?? '');
    setEditando(null);
    setPasso(0);
    setConferencia(null);
    setAntesDaIa(null);
    if (voltarAoHistorico) setAba('historico');
    return g;
  }

  /**
   * Confere a edição antes de perguntar como salvar: os mesmos campos
   * obrigatórios e a mesma conferência do montador de quem gera. O que fica no
   * histórico é o que abre depois, e uma proposta que o montador recusaria não
   * deveria ficar guardada como pronta - nem perguntar "como salvar" algo que
   * não vai poder ser salvo.
   */
  function conferirParaSalvar(slidesJaConferidos?: number): { final: DadosProposta; slides: number } | null {
    if (!editando || !template) return null;
    if (faltando.length) {
      toast('error', 'Falta preencher', faltando.join(', '));
      return null;
    }
    const final = limpar(d, false);
    if (slidesJaConferidos != null) return { final, slides: slidesJaConferidos };
    const r = montarProposta(template, final);
    setConferencia(r.conferencia);
    if (!r.ok) {
      toast('error', 'A proposta não passou na conferência', r.conferencia.problemas[0]);
      setPasso(PASSOS.length - 1);
      return null;
    }
    return { final, slides: r.conferencia.slides };
  }

  /** Abre a pergunta de como salvar, com a edição já conferida. */
  function pedirComoSalvar(slidesJaConferidos?: number) {
    const pronto = conferirParaSalvar(slidesJaConferidos);
    if (pronto) setComoSalvar(pronto);
  }

  /**
   * Grava a edição, sobrescrevendo a proposta aberta ou guardando uma nova ao
   * lado dela.
   *
   * A tela responde no gesto: a linha do histórico muda (ou nasce) na hora e a
   * tela volta para ele. Se o servidor recusar, a linha volta a ser a de antes
   * e a edição reabre com o que foi escrito, para nada se perder.
   */
  async function gravarEdicao(modo: 'sobrescrever' | 'nova', { final, slides }: { final: DadosProposta; slides: number }) {
    if (!editando) return;
    const alvo = editando;
    const emEdicao = { d, leadId };
    const lead = leads?.find(l => l.id === leadId);
    const agora = new Date().toISOString();
    const nova: PropostaGerada = {
      ...alvo.linha,
      // A cópia ganha um id provisório, negativo, até o de verdade chegar.
      id: modo === 'nova' ? -Date.now() : alvo.id,
      oportunidade_id: leadId,
      lead_empresa: lead?.empresa ?? alvo.linha.lead_empresa,
      cliente: final.cliente,
      subtitulo: final.subtitulo,
      slides,
      autor_nome: usuario?.nome ?? alvo.linha.autor_nome,
      atualizado_em: agora,
      ...(modo === 'nova' ? { criado_em: agora } : {}),
    };
    setHistorico(h => (h == null ? h : modo === 'nova'
      ? [nova, ...h]
      : [nova, ...h.filter(x => x.id !== alvo.id)]));
    const g = sairDaEdicao();

    const resposta = await api('', 'POST', {
      action: modo === 'nova' ? 'salvar_proposta_como_nova' : 'atualizar_proposta',
      ...(modo === 'nova' ? {} : { id: alvo.id }),
      oportunidade_id: leadId, cliente: final.cliente, subtitulo: final.subtitulo, dados: final, slides,
    }).catch(() => null);
    if (!resposta?.ok) {
      setHistorico(h => (h == null ? h : modo === 'nova'
        ? h.filter(x => x.id !== nova.id)
        : h.map(x => (x.id === alvo.id ? alvo.linha : x))));
      guardado.current = g;
      setD(emEdicao.d);
      setLeadId(emEdicao.leadId);
      setEditando(alvo);
      setAba('gerador');
      toast('error', 'Não foi possível salvar a proposta', resposta?.error ?? 'A conexão caiu. Tente de novo.');
      return;
    }
    setHistorico(h => (h == null ? h : h.map(x => (x.id === nova.id
      ? {
        ...x,
        id: Number(resposta.id ?? x.id),
        atualizado_em: String(resposta.atualizado_em ?? x.atualizado_em),
        criado_em: modo === 'nova' ? String(resposta.criado_em ?? x.criado_em) : x.criado_em,
      }
      : x))));
    toast('success', modo === 'nova' ? 'Salva como nova proposta' : 'Proposta atualizada',
      modo === 'nova'
        ? `${final.cliente}, ${slides} slides. A versão anterior continua no histórico.`
        : `${final.cliente}, ${slides} slides`);
  }

  async function baixarDoHistorico(p: PropostaGerada) {
    if (baixando != null) return;
    setBaixando(p.id);
    try {
      const pdf = await baixarPdfDaProposta(
        await htmlDoHistorico(p), nomeDoArquivoDe(p.cliente, p.atualizado_em), token);
      if (!pdf.ok) toast('error', 'O PDF não saiu', pdf.erro);
    } catch (e) {
      toast('error', 'Não consegui montar esta proposta', e instanceof Error ? e.message : undefined);
    } finally {
      setBaixando(null);
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
              : 'As propostas que já saíram, cada uma presa à sua oportunidade'}
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
            onEditar={p => { void editarDoHistorico(p); }}
            abrindo={abrindo}
            editando={editando?.id ?? null}
            baixando={baixando}
            onBaixar={p => { void baixarDoHistorico(p); }}
            onAbrirLead={onAbrirOportunidade} />
        </div>
      )}

      {comoSalvar && editando && (
        <Dialogo
          titulo="Como salvar esta edição?"
          descricao={<>
            <b>Sobrescrever</b> troca a proposta guardada por esta, e a versão anterior não volta.{' '}
            <b>Salvar como nova</b> guarda esta ao lado da original, que continua no histórico como está.
          </>}
          rotuloCancelar="Voltar"
          rotuloMeio="Salvar como nova"
          onMeio={() => { const c = comoSalvar; setComoSalvar(null); void gravarEdicao('nova', c); }}
          rotuloOk="Sobrescrever a atual"
          onConfirmar={() => { const c = comoSalvar; setComoSalvar(null); void gravarEdicao('sobrescrever', c); }}
          onFechar={() => setComoSalvar(null)}
          largura={500} />
      )}

      {ia.andamento && (
        <ProgressoDaIa andamento={ia.andamento} onResponder={ia.responder}
          onCancelar={ia.cancelar} onFechada={ia.encerrar} />
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
              if (lead.empresa) editar({ cliente: lead.empresa });
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

      {/* A faixa da edição: diz qual proposta está aberta e dá as duas saídas.
          Fora do painel do passo, para não reanimar a cada passo. */}
      {editando && aba === 'gerador' && (
        <div className="gp-editando surge">
          <span className="gp-editando-icone"><IconEdit size={14} /></span>
          <span className="gp-editando-texto">
            <b>Editando uma proposta do histórico</b>
            <span>{editando.linha.cliente} · {editando.linha.subtitulo}</span>
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => sairDaEdicao()}>
            Descartar alterações
          </button>
          <button type="button" className="btn btn-primary btn-sm"
            disabled={!mudou || !template}
            title={mudou ? undefined : 'Nada mudou desde que a proposta foi aberta'}
            onClick={() => pedirComoSalvar()}>
            Salvar alterações
          </button>
        </div>
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
                {/* A oportunidade e a IA num bloco só, sem o vão da grade entre os
                    dois: a IA nasce depois da escolha, abrindo espaço, e um vão
                    automático entre eles entraria na tela de estalo. O respiro
                    fica dentro da parte que anima. */}
                <div className="gp-oportunidade">
                <div className="gp-campo">
                  <span className="form-label">Oportunidade *</span>
                  {leads == null ? (
                    <div className="dux-spinner-row" style={{ justifyContent: 'flex-start', padding: '10px 0' }}>
                      <span className="dux-spinner sm" />
                    </div>
                  ) : (
                  <SelectSistema
                    valor={leadId}
                    placeholder="Escolha a oportunidade desta proposta"
                    onChange={id => {
                      // O cliente acompanha a oportunidade, sempre: trocar de
                      // oportunidade é trocar de cliente. Antes ele só era
                      // preenchido com o campo vazio, e a capa seguia com o nome
                      // da escolhida anterior. Ajustar o nome à mão continua
                      // valendo - depois de escolher, e para esta oportunidade.
                      const lead = leads?.find(l => l.id === id);
                      setLeadId(id);
                      if (lead?.empresa) editar({ cliente: lead.empresa });
                    }}
                    opcoes={(leads ?? []).map(l => ({
                      valor: l.id,
                      label: l.empresa ?? 'Oportunidade sem empresa',
                      descricao: [l.etapa, l.contato].filter(Boolean).join(' · ') || undefined,
                    }))}
                    // O lead que ainda não existe nasce daqui: abre o cadastro do
                    // Funil, e ao cadastrar ele já volta escolhido. Só para quem
                    // pode criar oportunidade, que é o que o cadastro exige.
                    criar={pode('oportunidades:criar') ? {
                      rotulo: 'Nova oportunidade',
                      semNome: true,
                      onCriar: async texto => { setNovoLead({ empresa: texto }); return true; },
                    } : undefined} />
                  )}
                  {leads != null && leads.length === 0 && (
                    <span className="gp-dica">
                      Nenhuma oportunidade aberta no funil. Crie a oportunidade no Funil antes de montar a proposta.
                    </span>
                  )}
                </div>
                {/* A IA, opcional, e só depois da oportunidade escolhida: é dela
                    que sai o material, e oferecer antes seria um botão que ainda
                    não pode fazer nada. Aparece abrindo espaço, porque empurra o
                    cliente e o subtítulo para baixo. */}
                {secaoDaIa.montado && (
                <div className={`revelar${secaoDaIa.aberto ? ' aberto' : ''}`}>
                <div>
                <div className={`gp-ia${comIa ? ' aberta' : ''}`}>
                  <button type="button" className="gp-ia-gatilho" aria-expanded={comIa}
                    onClick={() => setComIa(v => !v)}>
                    <span className="gp-ia-icone"><IconSparkles size={14} /></span>
                    <span className="gp-ia-textos">
                      <b>Preencher com IA</b>
                      <span>Opcional. A IA escreve todos os passos e você revisa.</span>
                    </span>
                    <span className={`entrega-seta${comIa ? ' aberta' : ''}`}><IconChevronRight size={12} /></span>
                  </button>
                  {blocoDaIa.montado && (
                    <div className={`revelar${blocoDaIa.aberto ? ' aberto' : ''}`}>
                      <div>
                        <div className="gp-ia-corpo">
                          {/* O essencial em campo próprio, cada um opcional: o que o
                              operador já fechou vai como decisão, e o que ficar em
                              branco a IA tira do card e das reuniões. */}
                          <div className="gp-ia-campos">
                            <div className="gp-campo">
                              <span className="form-label">Formato</span>
                              <SelectSistema<NonNullable<InformadoParaIa['formato']>>
                                valor={informadoIa.formato ?? ''}
                                onChange={v => informar({ formato: v })}
                                opcoes={[
                                  { valor: '', label: 'A IA decide', descricao: 'Pelo que o card e as reuniões indicarem' },
                                  { valor: 'mensal', label: 'Time dedicado mensal', descricao: 'Contratação continuada, com fila de prioridades' },
                                  { valor: 'fechado', label: 'Escopo fechado', descricao: 'Um projeto com início, meio e fim' },
                                  { valor: 'ambos', label: 'Os dois, lado a lado', descricao: 'Uma opção mensal e uma fechada' },
                                ]} />
                            </div>
                            <div className="gp-campo">
                              <span className="form-label">Opções de preço</span>
                              <SelectSistema<string>
                                valor={String(informadoIa.opcoes ?? 0)}
                                onChange={v => informar({ opcoes: Number(v) })}
                                opcoes={[
                                  { valor: '0', label: 'A IA decide' },
                                  { valor: '1', label: 'Uma opção' },
                                  { valor: '2', label: 'Duas opções' },
                                  { valor: '3', label: 'Três opções' },
                                ]} />
                            </div>
                            <Campo rotulo="Valor" valor={informadoIa.valor ?? ''}
                              onChange={v => informar({ valor: v })}
                              placeholder="R$ 21.600 por mês, ou R$ 80 mil fechado" />
                            <Campo rotulo="Prazo" valor={informadoIa.prazo ?? ''}
                              onChange={v => informar({ prazo: v })}
                              placeholder="5 meses, começando em outubro" />
                            <div className="gp-ia-largo">
                              <Campo rotulo="Time" valor={informadoIa.time ?? ''}
                                onChange={v => informar({ time: v })}
                                placeholder="2 devs em 8h, QA meio período, gestor não cobrado" />
                            </div>
                          </div>
                          <div className="gp-campo">
                            <span className="form-label">Mais contexto</span>
                            <CampoTexto valor={contextoIa} onMudar={setContextoIa} linhas={3}
                              ariaLabel="Mais contexto para a IA"
                              placeholder="O que mais a IA precisa saber: o que priorizar, o que o cliente já recusou, o tom da conversa." />
                          </div>
                          <div className="gp-ia-acoes">
                            {antesDaIa && (
                              <button type="button" className="gp-mais surge" style={{ marginTop: 0 }}
                                onClick={() => { setD(antesDaIa); setAntesDaIa(null); }}>
                                Desfazer o preenchimento
                              </button>
                            )}
                            <button type="button" className="btn btn-primary"
                              disabled={!!ia.andamento}
                              onClick={() => void preencherComIa()}>
                              <IconSparkles size={13} />
                              {antesDaIa ? 'Preencher de novo' : 'Preencher com IA'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                </div>
                </div>
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
                      <div style={{ marginTop: 6 }}>
                        <CampoTexto valor={p.texto} linhas={2} placeholder="O que acontece nesse passo"
                          ariaLabel={`Texto do passo ${i + 1}`}
                          onMudar={v => editar({
                            comoFunciona: {
                              ...d.comoFunciona!,
                              passos: d.comoFunciona!.passos.map((x, k) => (k === i ? { ...x, texto: v } : x)),
                            },
                          })} />
                      </div>
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
                  })}
                  onRemover={d.investimento.opcoes.length > 1 ? () => editar({
                    investimento: {
                      ...d.investimento,
                      opcoes: emOrdem(d.investimento.opcoes.filter((_, k) => k !== i)),
                    },
                  }) : undefined} />
              ))}
              {d.investimento.opcoes.length < MAX_OPCOES && (
                <button type="button" className="gp-mais"
                  onClick={() => editar({
                    investimento: {
                      ...d.investimento,
                      opcoes: emOrdem([...d.investimento.opcoes,
                        { rotulo: '', titulo: '', valor: '', unidade: '', bullets: ['', '', ''] }]),
                    },
                  })}>
                  <IconPlus size={12} /> Mais uma opção
                </button>
              )}

              <p className="gp-secao">Time alocado</p>
              {d.investimento.time.map((p, i) => (
                <div key={i} className="gp-grade gp-time">
                  {/* Quem é o número e quem sai. Sem a lixeira, o time ficava preso
                      às duas pessoas com que a proposta nasce. */}
                  <div className="gp-entrega-topo">
                    <span className="gp-entrega-num">Pessoa {i + 1}</span>
                    {/* Sim ou não, e à vista: antes só o gestor da proposta de
                        partida vinha como não cobrado, e não havia como tirar a
                        etiqueta dele nem pôr em outra pessoa. */}
                    <span className="gp-nao-cobrado">
                      <Chave ligada={!!p.naoCobrado} rotulo="Não cobrado"
                        dica='O papel sai com a etiqueta "Não cobrado" no lugar da dedicação'
                        onChange={v => editar({
                          investimento: {
                            ...d.investimento,
                            time: d.investimento.time.map((x, k) => (k === i
                              ? { ...x, naoCobrado: v || undefined } : x)),
                          },
                        })} />
                    </span>
                    {d.investimento.time.length > 1 && (
                      <button type="button" className="gp-x" aria-label={`Remover a pessoa ${i + 1}`}
                        onClick={() => editar({
                          investimento: {
                            ...d.investimento,
                            time: d.investimento.time.filter((_, k) => k !== i),
                          },
                        })}>
                        <IconTrash size={13} />
                      </button>
                    )}
                  </div>
                  <Campo rotulo="Papel" valor={p.papel}
                    onChange={v => editar({
                      investimento: {
                        ...d.investimento,
                        time: d.investimento.time.map((x, k) => (k === i ? { ...x, papel: v } : x)),
                      },
                    })} />
                  {/* Quantas pessoas no papel: três devs são um papel com três, e
                      não três cards iguais disputando o teto do time. */}
                  <label className="gp-campo">
                    <span className="form-label">Quantas pessoas</span>
                    <input className="form-input gp-mini" value={String(p.quantidade ?? 1)}
                      inputMode="numeric" aria-label={`Quantas pessoas em ${p.papel || 'este papel'}`}
                      onFocus={e => e.target.select()}
                      onChange={e => editar({
                        investimento: {
                          ...d.investimento,
                          time: d.investimento.time.map((x, k) => (k === i
                            ? { ...x, quantidade: Math.max(1, Math.min(MAX_POR_PAPEL, Number(e.target.value.replace(/\D/g, '')) || 1)) }
                            : x)),
                        },
                      })} />
                  </label>
                  <Campo rotulo="Dedicação" valor={p.dedicacao} placeholder="8h por dia"
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
              {d.investimento.time.length < MAX_TIME && (
                <button type="button" className="gp-mais"
                  onClick={() => editar({
                    investimento: {
                      ...d.investimento,
                      time: [...d.investimento.time, { papel: '', dedicacao: '', descricao: '' }],
                    },
                  })}>
                  <IconPlus size={12} /> Mais uma pessoa
                </button>
              )}

              <div className="gp-grade">
                <Texto rotulo="Memória de cálculo" valor={d.investimento.memoria} linhas={3}
                  onChange={v => editar({ investimento: { ...d.investimento, memoria: v } })}
                  placeholder="A hora-homem é R$ 135, em jornadas de 8 horas, e o mês tem 20 dias úteis: 8 x 20 x 135 = R$ 21.600."
                  dica={'Mostrar a conta tira a conversa do "está caro" e leva para o que compõe o preço.'} />
              </div>
            </>
          )}

          {atual.id === 'infra' && (
            <>
              <p className="gp-secao">
                Infra e manutenção
                <button type="button" className="gp-ligar"
                  onClick={() => editar({
                    infra: d.infra ? undefined : infraEmBranco(sugestaoDeManutencao?.valor ?? ''),
                  })}>
                  {d.infra ? 'Tirar este slide' : 'Incluir este slide'}
                </button>
              </p>
              {d.infra ? (
                <PassoDeInfra key="com" inf={d.infra} sugestao={sugestaoDeManutencao}
                  onChange={v => editar({ infra: v })} />
              ) : (
                <p className="gp-dica surge" key="sem">
                  Fora da proposta. Ele mostra o custo de manter o sistema no ar depois da entrega,
                  em três cenários, e a manutenção. Sai quando não há sistema a hospedar, como numa
                  consultoria ou em painéis dentro do Power BI do cliente.
                </p>
              )}
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

              {/* Onde está cada travessão, e não só quantos: o passo, o campo e o
                  trecho em volta, com o traço marcado. Aparece antes de gerar,
                  porque é o que o montador vai recusar. */}
              {travessoes.length > 0 && (
                <div className="gp-problemas gp-travessoes surge">
                  <b>
                    {travessoes.length === 1 ? 'Um travessão para trocar' : `${travessoes.length} travessões para trocar`}
                  </b>
                  <p className="gp-dica" style={{ marginTop: 2 }}>
                    A casa não usa travessão, e o montador recusa a proposta que tiver um. Troque
                    por vírgula, dois-pontos ou hífen com espaços.
                  </p>
                  <ul className="gp-trav-lista">
                    {travessoes.map((x, i) => (
                      <li key={i}>
                        <span className="gp-trav-onde">
                          {PASSOS.find(p => p.id === x.passo)?.titulo} · {x.campo}
                        </span>
                        <span className="gp-trav-trecho">
                          {x.antes}<mark>{x.traco}</mark>{x.depois}
                        </span>
                        <button type="button" className="gp-trav-ir"
                          onClick={() => setPasso(PASSOS.findIndex(p => p.id === x.passo))}>
                          Ir <IconArrowRight size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const n = travessoes.length;
                      setD(semTravessao(d));
                      setConferencia(null);
                      toast('success', n === 1 ? 'Travessão trocado' : `${n} travessões trocados`,
                        'Viraram hífen com espaços. Confira na prévia se a frase continua boa.');
                    }}>
                    Trocar todos por hífen
                  </button>
                </div>
              )}

              {conferencia && conferencia.problemas
                // Os travessões já estão na lista acima, um por um: repetir a
                // contagem aqui seria dizer a mesma coisa duas vezes.
                .filter(p => !(travessoes.length > 0 && /travess/i.test(p))).length > 0 && (
                <div className="gp-problemas surge">
                  <b>A proposta não pode sair assim:</b>
                  <ul>
                    {conferencia.problemas
                      .filter(p => !(travessoes.length > 0 && /travess/i.test(p)))
                      .map(p => <li key={p}>{p}</li>)}
                  </ul>
                </div>
              )}

              <div className="gp-rodape">
                <button type="button" className="btn btn-primary" onClick={() => void baixar()}
                  disabled={faltando.length > 0 || semQuemPrepara || !template || gerandoPdf}>
                  {gerandoPdf ? <IconSpinner size={14} /> : <IconDownload size={14} />}
                  {' '}{gerandoPdf ? 'Gerando o PDF' : editando ? 'Salvar e baixar o PDF' : 'Baixar em PDF'}
                </button>
                {!template && <span className="dux-spinner sm" />}
              </div>
            </>
          )}

          <div className="gp-andar">
            {/* No primeiro passo não há para onde voltar, e o botão apagado ali
                só ocupava o canto. O "avançar" continua à direita sozinho: é
                a margem automática dele, e não o vizinho, que o empurra. */}
            {passo > 0 && (
              <button type="button" className="gp-voltar"
                onClick={() => setPasso(p => Math.max(0, p - 1))}>
                <IconArrowLeft size={12} /> Voltar
              </button>
            )}
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
    infra: d.infra && {
      ...d.infra,
      itens: d.infra.itens.filter(x => previa || x.servico.trim()),
      manutencao: {
        ...d.infra.manutencao,
        inclui: semVazios(d.infra.manutencao.inclui),
        naoInclui: semVazios(d.infra.manutencao.naoInclui),
      },
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
  .gp-mais:hover, .gp-anexar:hover, .gp-ligar:hover, .gp-voltar:hover { color: var(--black); }
  .gp-ligar { margin-left: auto; text-transform: none; letter-spacing: 0; }
  .gp-entrega, .gp-fase, .gp-opcao, .gp-time {
    border: 1px solid var(--gray3); border-radius: var(--radius-md);
    padding: 14px 16px; margin-top: 10px; background: var(--bg);
  }
  .gp-opcao.rec { border-color: var(--yellow); background: var(--yd); }

  /* A IA, opcional: um gatilho que abre o contexto e o botao. Ocupa a grade
     inteira, entre a oportunidade e o cliente, que e onde a escolha acontece. */
  /* A oportunidade e a IA juntas, sem o vao da grade entre elas. O respiro do
     bloco da IA e margem dele, dentro da parte que anima: cresce com a altura
     em vez de entrar de estalo. */
  /* A faixa da edicao: qual proposta esta aberta e as duas saidas. No tom de
     destaque da casa, porque e um modo diferente do normal e precisa ser visto
     antes de alguem gerar achando que esta montando uma proposta nova. */
  .gp-editando {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    margin-bottom: 12px; padding: 10px 14px;
    border: 1px solid var(--yb, var(--yellow)); border-radius: var(--radius-md);
    background: var(--yd);
  }
  .gp-editando-icone {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 28px; height: 28px; border-radius: var(--radius-pill);
    background: var(--white); color: var(--yellow-tinta, var(--yellow));
  }
  .gp-editando-texto { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 180px; }
  .gp-editando-texto b { font-size: 12.5px; font-weight: 700; color: var(--black); }
  .gp-editando-texto span {
    font-size: 11.5px; color: var(--gray);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .gp-hist-acoes .btn { display: inline-flex; align-items: center; gap: 5px; }

  .gp-oportunidade { display: block; min-width: 0; }
  .gp-oportunidade .gp-ia { margin-top: 12px; }
  .gp-ia {
    border: 1px solid var(--gray3); border-radius: var(--radius-md);
    background: var(--bg);
    transition: border-color var(--transition);
  }
  .gp-ia:hover, .gp-ia.aberta { border-color: var(--gray2); }
  .gp-ia-gatilho {
    display: flex; align-items: center; gap: 10px; width: 100%;
    padding: 10px 14px; border: none; background: none; cursor: pointer;
    font-family: inherit; text-align: left; color: var(--black);
  }
  .gp-ia-icone {
    display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
    width: 28px; height: 28px; border-radius: var(--radius-pill);
    background: var(--yd); color: var(--yellow-tinta, var(--yellow));
  }
  .gp-ia-textos { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .gp-ia-textos b { font-size: 12.5px; font-weight: 700; }
  .gp-ia-textos span { font-size: 11.5px; color: var(--gray2); }
  .gp-ia-gatilho .entrega-seta { color: var(--gray2); }
  .gp-ia-corpo { display: flex; flex-direction: column; gap: 10px; padding: 2px 14px 14px; }
  .gp-ia-acoes { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  /* Os campos do que ja foi decidido, dois por linha; o time ocupa a linha
     inteira, que e onde cabe "2 devs em 8h, QA meio periodo". */
  .gp-ia-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  .gp-ia-largo { grid-column: 1 / -1; }
  @media (max-width: 560px) { .gp-ia-campos { grid-template-columns: minmax(0, 1fr); } }
  .gp-ia-acoes .btn { display: inline-flex; align-items: center; gap: 6px; }
  @media (prefers-reduced-motion: reduce) { .gp-ia { transition: none; } }
  .gp-entrega-topo, .gp-fase-topo {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .gp-entrega-num, .gp-fase-nome { font-size: 11.5px; font-weight: 800; color: var(--black); }
  .gp-entrega-topo .gp-x, .gp-fase-topo .gp-x { margin-left: auto; }
  /* A chave do "Nao cobrado" vai para a direita do topo, e a lixeira encosta
     nela em vez de disputar o espaco. */
  .gp-nao-cobrado { margin-left: auto; display: inline-flex; }

  /* A lista dos travessoes: onde, o trecho com o traco marcado, e o atalho. */
  .gp-travessoes .btn { margin-top: 10px; }
  .gp-problemas .gp-trav-lista { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .gp-trav-lista li {
    display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 10px;
    padding: 7px 10px; border-radius: var(--radius-sm); background: var(--white);
    border: 1px solid var(--gray3);
  }
  .gp-trav-onde { font-size: 11px; font-weight: 700; color: var(--black); }
  .gp-trav-trecho {
    grid-column: 1; font-size: 11.5px; color: var(--gray);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .gp-trav-trecho mark {
    background: color-mix(in srgb, var(--red) 14%, transparent); color: var(--red);
    font-weight: 800; padding: 0 3px; border-radius: 3px;
  }
  .gp-trav-ir {
    grid-column: 2; grid-row: 1 / span 2;
    display: inline-flex; align-items: center; gap: 4px;
    border: none; background: none; cursor: pointer; font-family: inherit;
    font-size: 11.5px; font-weight: 700; color: var(--gray2);
    transition: color var(--transition);
  }
  .gp-trav-ir:hover { color: var(--black); }
  .gp-nao-cobrado ~ .gp-x { margin-left: 0; }
  .gp-fase-meses { margin-left: auto; display: flex; align-items: center; gap: 10px; }
  .gp-fase-meses label {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 700; color: var(--gray2);
  }
  .gp-mini { width: 54px; padding: 6px 8px; text-align: center; }
  /* Os tres cenarios lado a lado: o mesmo servico nas tres colunas, que e como
     a tabela do slide le. */
  .gp-infra-valores { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .gp-cenario { font-size: 11px; font-weight: 700; color: var(--gray); min-width: 70px; }
  .gp-sugerir { flex-shrink: 0; white-space: nowrap; }
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
