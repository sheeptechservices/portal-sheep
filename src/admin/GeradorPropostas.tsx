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
import type { KeyboardEvent as EventoDeTecla } from 'react';
import type { StatusConfig, Submission } from './types';

/** O cadastro de lead do Funil, o mesmo de lá. Sob demanda: só quem cria um
 *  lead daqui paga pelo código da tela do Funil. */
const CadastroDeLead = lazy(() => import('./OportunidadesPage').then(m => ({ default: m.CreateModal })));
import {
  IconArrowLeft, IconArrowRight, IconCheck, IconChevronRight, IconDoc, IconDownload, IconEdit, IconEye,
  IconFunil, IconInbox, IconLink, IconPlus, IconSalvar, IconSparkles, IconSpinner, IconTrash, IconUpload, IconX,
} from '../components/icons';
import { AbaPainel, Abas } from '../components/Abas';
import { SelectSistema } from '../components/SelectSistema';
import { SegSwitch } from '../components/SegSwitch';
import { PreviaArquivo } from '../components/PreviaArquivo';
import { CampoTexto } from '../components/CampoTexto';
import { Chave } from '../components/Chave';
import { Dialogo } from '../components/Dialogo';
import {
  ProgressoDaIa, percentualDaIa, resumoDaIa, usePreenchimentoPorIa,
  type InformadoParaIa, type PropostaDaIa,
} from './PreenchimentoPorIa';
import { useAtividades, type Trabalho } from '../lib/atividades';
import { useRevelar } from '../lib/useRevelar';
import { useAuth, useToast } from './AdminApp';
import { montarPrevia, montarProposta, type Conferencia } from '../lib/proposta/montar';
import { infraEmBranco, propostaEmBranco } from '../lib/proposta/exemplo';
import { emBase64, htmlDaProposta, lerTemplate } from '../lib/proposta/gerar';
import { baixarPdfDaProposta } from '../lib/proposta/pdf';
import {
  abreNaPrevia, baixarPartes, pesoDoArquivo, rotuloDoFormato, salvarArquivo,
  type ArquivoDaProposta,
} from '../lib/proposta/arquivo';
import { EnvioDeProposta, type OrigemDoEnvio, type PedidoDeEnvio } from './EnvioDeProposta';
import { instante, tempoRelativo } from '../lib/datas';
import { TEMPLATES, type TemplateDeProposta } from '../lib/proposta/templates';
import type {
  DadosProposta, Entrega, FaixaDeInfra, FaixaDeVolume, Fase, InfraManutencao, ItemDeInfra,
  ModeloDeInfra, OpcaoInvestimento,
} from '../lib/proposta/tipos';
import { CENARIOS, NOME_DO_CENARIO, manutencaoSugerida, numeroBr, reaisBr } from '../lib/proposta/tipos';

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
  /** Guardada sem ter saído em PDF: continua depois, e o funil não a anuncia
   *  como proposta entregue. Gerar o PDF tira a marca. */
  rascunho?: boolean;
  /** A proposta principal de que esta é versão, ou nulo quando ela é a
   *  principal. É o que agrupa a evolução num bloco só no histórico. */
  origem_id: number | null;
  /** O número dela dentro da família. A principal é a 1. */
  versao: number;
  autor_nome: string;
  criado_em: string;
  atualizado_em: string;
  /** O token do link público, quando ela já foi compartilhada. Com ele, copiar
   *  o link de novo é na hora, sem ida ao servidor. */
  token_publico?: string | null;
  /** O arquivo, quando a proposta foi feita fora do gerador e subida aqui. Ela
   *  não tem campos: abre, baixa e circula pelo arquivo. */
  arquivo?: ArquivoDaProposta | null;
  /** A linha que acabou de nascer e ainda está subindo o arquivo. */
  enviando?: boolean;
}

/** O endereço que o cliente abre para ver a apresentação. */
const linkDaProposta = (tokenPublico: string) => `${window.location.origin}/proposta/${tokenPublico}`;

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
    ver('investimento', `${o.rotulo} · Nome da opção`, o.rotulo);
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
      ver('infra', `Serviço ${i + 1} · Custo base`, x.custo);
    });
    if (inf.volumes) {
      ver('infra', 'O que as faixas medem', inf.volumes.rotulo);
      inf.volumes.faixas.forEach((f, i) => ver('infra', `Faixa ${i + 1} · Até quanto`, f.volume));
    }
    if (inf.faixa) {
      ver('infra', 'Faixa · O que o valor compra', inf.faixa.unidade);
      ver('infra', 'Faixa · Por que varia', inf.faixa.variacao);
      inf.faixa.inclui.forEach((x, k) => ver('infra', `Faixa · Inclui ${k + 1}`, x));
    }
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

/** A faixa de uma proposta que ainda não tem uma: trocar para este desenho não
 *  pode esbarrar num campo que não existe. */
const FAIXA_EM_BRANCO: FaixaDeInfra = {
  de: '', ate: '', unidade: 'por mês, em infraestrutura', variacao: '', inclui: [],
};

/** As faixas de uso de uma proposta que ainda não tem nenhuma, pelo mesmo
 *  motivo. */
const VOLUMES_EM_BRANCO: NonNullable<InfraManutencao['volumes']> = {
  rotulo: 'Uso por mês', faixas: [{ volume: '', infra: '', manutencao: '' }],
};

/** Faixas de uso na tabela do slide: quatro linhas cabem ao lado da lista de
 *  serviços sem passar do rodapé. */
const MAX_FAIXAS_DE_VOLUME = 4;

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
  const faixa = inf.faixa ?? FAIXA_EM_BRANCO;
  const trocarFaixa = (f: Partial<FaixaDeInfra>) =>
    onChange({ ...inf, faixa: { ...faixa, ...f } });
  const volumes = inf.volumes ?? VOLUMES_EM_BRANCO;
  const trocarVolumes = (v: Partial<NonNullable<InfraManutencao['volumes']>>) =>
    onChange({ ...inf, volumes: { ...volumes, ...v } });
  const trocarFaixaDeVolume = (i: number, f: Partial<FaixaDeVolume>) =>
    trocarVolumes({ faixas: volumes.faixas.map((x, k) => (k === i ? { ...x, ...f } : x)) });
  // Proposta gravada antes desta escolha não tem o campo, e continua na tabela.
  const modelo = inf.modelo ?? 'cenarios';

  return (
    <div className="gp-grade surge">
      <div className="gp-campo">
        <span className="form-label">Como este slide se desenha</span>
        <SegSwitch<ModeloDeInfra>
          valor={modelo}
          opcoes={[
            { valor: 'cenarios', label: 'Por cenários' },
            { valor: 'faixa', label: 'Faixa de valor' },
            { valor: 'volume', label: 'Por volume' },
          ]}
          onChange={v => onChange({ ...inf, modelo: v })} />
        <span className="gp-dica">
          {modelo === 'cenarios'
            ? 'A tabela com os três cenários lado a lado, serviço por serviço, e a conta somada.'
            : modelo === 'faixa'
              ? 'De quanto a quanto fica por mês, com o que faz o valor variar - nos cards do slide de investimento.'
              : 'Os serviços com o custo base de cada um, e infra mais manutenção fechadas por faixa de uso.'}
        </span>
      </div>

      {/* O que não é do modelo escolhido sai da tela, mas fica guardado: trocar
          de ida e volta não pode apagar o que já foi escrito do outro lado. */}
      {modelo === 'volume' ? (
        <div className="gp-grade troca" key="volume">
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
                <Campo rotulo="Serviço" valor={item.servico} placeholder="Supabase"
                  onChange={v => trocarItem(i, { ...item, servico: v })} />
                <Campo rotulo="Para que serve" valor={item.detalhe} placeholder="Banco de dados e autenticação"
                  onChange={v => trocarItem(i, { ...item, detalhe: v })} />
                <Campo rotulo="Custo base" valor={item.custo ?? ''} placeholder="R$ 130 por mês"
                  onChange={v => trocarItem(i, { ...item, custo: v })} />
              </div>
            </div>
          ))}
          {inf.itens.length < MAX_INFRA && (
            <button type="button" className="gp-mais"
              onClick={() => onChange({
                ...inf,
                itens: [...inf.itens, { servico: '', detalhe: '', custo: '', valores: { otimista: '', realista: '', pessimista: '' } }],
              })}>
              <IconPlus size={12} /> Mais um serviço
            </button>
          )}

          <p className="gp-secao">Faixas de uso</p>
          <Campo rotulo="O que as faixas medem" valor={volumes.rotulo} placeholder="Leads por mês"
            onChange={v => trocarVolumes({ rotulo: v })}
            dica="É o cabeçalho da coluna das faixas no slide." />
          {volumes.faixas.map((f, i) => {
            const infra = numeroBr(f.infra);
            const man = numeroBr(f.manutencao);
            return (
              <div key={i} className="gp-time">
                <div className="gp-entrega-topo">
                  <span className="gp-entrega-num">Faixa {i + 1}</span>
                  {volumes.faixas.length > 1 && (
                    <button type="button" className="gp-x" aria-label={`Remover a faixa ${i + 1}`}
                      onClick={() => trocarVolumes({ faixas: volumes.faixas.filter((_, k) => k !== i) })}>
                      <IconTrash size={13} />
                    </button>
                  )}
                </div>
                <div className="gp-grade">
                  <Campo rotulo="Até quanto" valor={f.volume} placeholder="Até 1.000 leads"
                    onChange={v => trocarFaixaDeVolume(i, { volume: v })} />
                  <div className="gp-volume-valores">
                    <Campo rotulo="Infra por mês" valor={f.infra} placeholder="1.337"
                      onChange={v => trocarFaixaDeVolume(i, { infra: v })} />
                    <Campo rotulo="Manutenção por mês" valor={f.manutencao} placeholder="2.900"
                      onChange={v => trocarFaixaDeVolume(i, { manutencao: v })} />
                    <div className="gp-campo">
                      <span className="form-label">Total por mês</span>
                      <span className="gp-total-faixa">
                        {infra == null || man == null ? 'a confirmar' : `R$ ${reaisBr(infra + man)}`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {volumes.faixas.length < MAX_FAIXAS_DE_VOLUME && (
            <button type="button" className="gp-mais"
              onClick={() => trocarVolumes({ faixas: [...volumes.faixas, { volume: '', infra: '', manutencao: '' }] })}>
              <IconPlus size={12} /> Mais uma faixa
            </button>
          )}
        </div>
      ) : modelo === 'faixa' ? (
        <div className="gp-grade troca" key="faixa">
          <div className="gp-campo">
            <span className="form-label">A faixa por mês, em reais</span>
            <div className="gp-faixa">
              <input className="form-input" value={faixa.de} inputMode="decimal"
                aria-label="Começo da faixa, em reais" placeholder="2.500"
                onChange={e => trocarFaixa({ de: e.target.value })} />
              <span className="gp-faixa-a">a</span>
              <input className="form-input" value={faixa.ate} inputMode="decimal"
                aria-label="Fim da faixa, em reais" placeholder="3.000"
                onChange={e => trocarFaixa({ ate: e.target.value })} />
            </div>
            <span className="gp-dica">
              Só o número, como no investimento. Sem o segundo, sai um valor só.
            </span>
          </div>
          <Campo rotulo="O que o valor compra" valor={faixa.unidade}
            placeholder="por mês, em infraestrutura"
            onChange={v => trocarFaixa({ unidade: v })} />
          <Texto rotulo="Por que varia" valor={faixa.variacao} linhas={2}
            placeholder="Podem sofrer variação a depender do volume de tráfego na plataforma."
            onChange={v => trocarFaixa({ variacao: v })}
            dica="Fica em destaque ao lado do valor: faixa sem o porquê se lê como preço fechado." />
          <Lista rotulo="Inclui" itens={faixa.inclui} onChange={v => trocarFaixa({ inclui: v })}
            placeholder="Servidor da aplicação" />
        </div>
      ) : (
      <div className="gp-grade troca" key="cenarios">
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
      </div>
      )}

      {/* De onde vêm os preços vale nos dois desenhos: na tabela ele fica sob
          ela, e na faixa, no pé do card. */}
      <Campo rotulo="De onde vêm os preços" valor={inf.fonte}
        placeholder="Tabela de preços da AWS consultada em 18/09/2026, região São Paulo, preços sob demanda."
        onChange={v => onChange({ ...inf, fonte: v })}
        dica="Aparece em letra pequena sob a tabela: é o que deixa o cliente conferir a conta." />

      <p className="gp-secao">Manutenção</p>
      {/* Por volume, o valor da manutenção é de cada faixa, e está nelas. */}
      {modelo !== 'volume' && (<>
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
      </>)}
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

/** O nome que a opção ganha pela posição: "Opção A", "B", "C". */
const nomePadraoDaOpcao = (i: number) => `Opção ${String.fromCharCode(65 + i)}`;

/** As opções depois de uma entrar ou sair: o nome padrão segue a posição, e
 *  sempre há uma recomendada. Nome escrito por alguém ("Implementação",
 *  "Roadmap completo") fica como está - só o automático se renumera, senão
 *  tirar a primeira opção apagaria o nome que a segunda ganhou à mão.
 *
 *  Tirar a recomendada passa o destaque para a primeira que sobrou - sem ele,
 *  o slide perde a borda que diz ao cliente por onde começar. */
function emOrdem(opcoes: OpcaoInvestimento[]): OpcaoInvestimento[] {
  const temRecomendada = opcoes.some(o => o.recomendada);
  return opcoes.map((o, i) => ({
    ...o,
    rotulo: !o.rotulo.trim() || /^Opção [A-Z]$/.test(o.rotulo.trim()) ? nomePadraoDaOpcao(i) : o.rotulo,
    recomendada: temRecomendada ? !!o.recomendada : i === 0,
  }));
}

function CardDeOpcao({ o, i, onChange, onRemover }: {
  o: OpcaoInvestimento;
  /** A posição, para o nome padrão quando o campo fica vazio. */
  i: number;
  onChange: (v: OpcaoInvestimento) => void;
  /** Ausente quando é a única: proposta sem opção nenhuma não tem preço. */
  onRemover?: () => void;
}) {
  const d = o.destaque ?? { valor: '', texto: '', nota: '' };
  const padrao = nomePadraoDaOpcao(i);
  return (
    <div className={`gp-opcao${o.recomendada ? ' rec' : ''}`}>
      <div className="gp-entrega-topo">
        {/* O nome é a etiqueta que flutua na borda do card no slide. Escreve-se
            direto no cabeçalho, como um título: campo vazio volta ao nome da
            posição ao sair dele, porque etiqueta em branco no slide é um
            pedaço de moldura sem nada dentro. */}
        <input className="gp-opcao-nome" value={o.rotulo} placeholder={padrao}
          aria-label="Nome da opção, que aparece na etiqueta do card"
          title="Nome da opção, que aparece na etiqueta do card no slide"
          onChange={e => onChange({ ...o, rotulo: e.target.value })}
          onBlur={() => { if (!o.rotulo.trim()) onChange({ ...o, rotulo: padrao }); }} />
        {o.recomendada && <span className="gp-opcao-rec">recomendada</span>}
        {onRemover && (
          <button type="button" className="gp-x" aria-label={`Remover ${o.rotulo || padrao}`} onClick={onRemover}>
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

/** Uma proposta do histórico e as versões que saíram dela, da mais nova para a
 *  mais velha. */
interface FamiliaDeProposta { principal: PropostaGerada; versoes: PropostaGerada[] }

/** O movimento mais novo da família, que é por onde ela se ordena: criar ou
 *  mexer numa versão sobe a proposta inteira para o topo do histórico. */
function movimentoDaFamilia(f: FamiliaDeProposta): string {
  return [f.principal, ...f.versoes]
    .reduce((maior, p) => (p.atualizado_em > maior ? p.atualizado_em : maior), '');
}

/**
 * As propostas do histórico agrupadas por família.
 *
 * A principal é a que não tem origem; as versões apontam para ela. Quando a
 * principal não vem na lista - ela é cortada em 300 linhas -, a de menor versão
 * entre as que vieram faz o papel dela, para a família não sumir da tela.
 */
function familiasDoHistorico(lista: PropostaGerada[]): FamiliaDeProposta[] {
  const porRaiz = new Map<number, PropostaGerada[]>();
  for (const p of lista) {
    const raiz = p.origem_id ?? p.id;
    const membros = porRaiz.get(raiz);
    if (membros) membros.push(p);
    else porRaiz.set(raiz, [p]);
  }
  const familias = [...porRaiz.entries()].map(([raiz, membros]) => {
    const principal = membros.find(p => p.id === raiz)
      ?? [...membros].sort((a, b) => a.versao - b.versao)[0];
    return {
      principal,
      versoes: membros.filter(p => p.id !== principal.id).sort((a, b) => b.versao - a.versao),
    };
  });
  return familias.sort((a, b) => movimentoDaFamilia(b).localeCompare(movimentoDaFamilia(a)));
}

/**
 * O histórico: toda proposta que já saiu do gerador, com o lead de cada uma.
 * Cada linha abre a apresentação na prévia da casa e baixa a segunda via, as
 * duas montadas de novo a partir dos campos guardados.
 *
 * A proposta que evoluiu aparece num bloco só: a principal na frente e as
 * versões dela recolhidas embaixo, em vez de três linhas soltas com o mesmo
 * cliente e o mesmo subtítulo. Cada versão é proposta de verdade - abre, edita,
 * baixa e é apagada sozinha, sem tocar nas outras.
 */
function HistoricoPropostas({
  lista, onVer, onEditar, abrindo, editando, baixando, onBaixar, onAbrirLead,
  onNovaVersao, versionando, onExcluir, onRenomear, compartilhando, onCompartilhar,
}: {
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
  /** Copia esta proposta numa versão nova, ao lado dela. */
  onNovaVersao: (p: PropostaGerada) => void;
  /** A que está sendo copiada agora, para o botão dela girar. */
  versionando: number | null;
  /** Abre a pergunta de apagar esta proposta. */
  onExcluir: (p: PropostaGerada) => void;
  /** Troca o cliente e o subtítulo de uma proposta, sem abrir o gerador. */
  onRenomear: (p: PropostaGerada, cliente: string, subtitulo: string) => void;
  /** A que está pedindo o link agora, para o botão dela girar. */
  compartilhando: number | null;
  /** Copia o link público da apresentação. */
  onCompartilhar: (p: PropostaGerada) => void;
}) {
  /** As famílias abertas, pelo id da principal. Recolhidas por padrão: o
   *  histórico é a lista das propostas, e a evolução de cada uma se abre para
   *  quem quer olhar. */
  const [abertas, setAbertas] = useState<number[]>([]);
  /** A proposta com o nome aberto para edição, e o que já foi digitado. */
  const [renomeando, setRenomeando] = useState<{ id: number; cliente: string; subtitulo: string } | null>(null);

  if (lista == null) return <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>;
  if (!lista.length) {
    return (
      <div className="admin-empty" style={{ padding: '40px 0' }}>
        <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
        <p>Nenhuma proposta gerada por aqui ainda.</p>
        <p className="gp-hist-nota">
          Toda proposta que sai do gerador entra nesta lista, presa à oportunidade do funil - e daqui
          ela abre de novo, sem precisar preencher tudo outra vez. A que foi feita fora entra por
          "Subir proposta", lá em cima.
        </p>
      </div>
    );
  }
  /** Grava o nome em edição e fecha os campos. Campo vazio não grava: o nome é
   *  o que acha a proposta depois. */
  const gravarNome = () => {
    const alvo = renomeando && (lista ?? []).find(p => p.id === renomeando.id);
    if (!renomeando || !alvo) return;
    const cliente = renomeando.cliente.trim();
    const subtitulo = renomeando.subtitulo.trim();
    if (!cliente || !subtitulo) return;
    setRenomeando(null);
    if (cliente !== alvo.cliente || subtitulo !== alvo.subtitulo) onRenomear(alvo, cliente, subtitulo);
  };
  const teclasDoNome = (e: EventoDeTecla<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); gravarNome(); }
    if (e.key === 'Escape') { e.preventDefault(); setRenomeando(null); }
  };

  /** A linha de uma proposta: a mesma para a principal e para cada versão. */
  const linha = (p: PropostaGerada, familia?: { quantas: number; aberta: boolean; alternar: () => void }) => (
    <div className="gp-hist-item">
      <span className="gp-hist-icone">
        {p.enviando ? <IconSpinner size={15} /> : p.arquivo ? <IconUpload size={15} /> : <IconDoc size={16} />}
      </span>
      <div className="gp-hist-texto">
        {renomeando?.id === p.id ? (
          /* A mesma área trocando de conteúdo: o nome lido vira os dois campos
             que o escrevem, no lugar onde ele estava. */
          <div className="gp-hist-renome troca">
            <input className="form-input gp-hist-renome-campo" value={renomeando.cliente}
              aria-label="Cliente da proposta" placeholder="Cliente" autoFocus
              onKeyDown={teclasDoNome}
              onChange={e => setRenomeando(r => (r ? { ...r, cliente: e.target.value } : r))} />
            <input className="form-input gp-hist-renome-campo gp-hist-renome-sub" value={renomeando.subtitulo}
              aria-label="Subtítulo da proposta" placeholder="Subtítulo"
              onKeyDown={teclasDoNome}
              onChange={e => setRenomeando(r => (r ? { ...r, subtitulo: e.target.value } : r))} />
            <button type="button" className="gp-hist-nome-botao" aria-label="Gravar o nome"
              title="Gravar" onClick={gravarNome}>
              <IconCheck size={13} />
            </button>
            <button type="button" className="gp-hist-nome-botao" aria-label="Deixar o nome como estava"
              title="Cancelar" onClick={() => setRenomeando(null)}>
              <IconX size={13} />
            </button>
          </div>
        ) : (
          <>
            <p className="gp-hist-titulo">
              <span className="gp-hist-nome">{p.cliente}</span>
              {/* A versão diz de qual ela é: sem o número, duas linhas com o mesmo
                  subtítulo não têm como ser diferenciadas. */}
              {p.versao > 1 && <span className="gp-hist-versao">v{p.versao}</span>}
              {/* O rascunho diz que ainda não saiu: ele mora na mesma lista, e
                  sem a marca leria como proposta entregue. */}
              {p.rascunho && <span className="gp-hist-rascunho">Rascunho</span>}
              {/* A proposta feita fora diz de onde veio: ela não abre no gerador,
                  e sem a marca alguém a procuraria lá. */}
              {p.arquivo && (
                <span className="gp-hist-externa" title={`Subida como arquivo: ${p.arquivo.nome}`}>
                  Upload externo
                </span>
              )}
              {/* Trocar o nome aqui, sem percorrer os passos do gerador. Fora
                  quando a proposta está aberta lá: ali o nome é campo do
                  formulário, e os dois juntos brigariam na hora de gravar. */}
              <button type="button" className="gp-hist-renomear"
                aria-label={`Trocar o nome da proposta ${p.cliente}`}
                disabled={editando === p.id || p.id < 0 || p.enviando}
                title={editando === p.id
                  ? 'Esta proposta está aberta no gerador: o nome se troca por lá'
                  : 'Trocar o cliente e o subtítulo'}
                onClick={() => setRenomeando({ id: p.id, cliente: p.cliente, subtitulo: p.subtitulo })}>
                <IconEdit size={12} />
              </button>
            </p>
            <p className="gp-hist-sub">{p.subtitulo}</p>
          </>
        )}
        <p className="gp-hist-meta">
          {instante(p.criado_em)} por {p.autor_nome}
          {p.atualizado_em !== p.criado_em && ` - refeita ${tempoRelativo(p.atualizado_em)}`}
          {p.slides ? ` - ${p.slides} slides` : ''}
          {p.arquivo && ` - ${rotuloDoFormato(p.arquivo)}, ${pesoDoArquivo(p.arquivo.tamanho)}`}
          {p.enviando && ' - subindo o arquivo'}
        </p>
        {familia && (
          <button type="button" className="gp-hist-evolucao" onClick={familia.alternar}
            title={familia.aberta ? 'Esconder as versões' : 'Ver a evolução desta proposta'}>
            <span className={`entrega-seta${familia.aberta ? ' aberta' : ''}`}>
              <IconChevronRight size={11} />
            </span>
            {familia.quantas === 1 ? '1 versão depois desta' : `${familia.quantas} versões depois desta`}
          </button>
        )}
      </div>
      <div className="gp-hist-acoes">
        {/* O lead de onde a proposta veio, que é onde ela aparece como chip. */}
        <button type="button" className="gp-hist-lead" disabled={!onAbrirLead || !p.oportunidade_id}
          title={onAbrirLead && p.oportunidade_id ? 'Abrir a oportunidade no Funil' : undefined}
          onClick={() => onAbrirLead?.(p.oportunidade_id)}>
          <IconFunil size={12} />
          {/* A proposta de fora pode não ter oportunidade: o chip diz isso, em
              vez de "removida", que seria outra história. */}
          <span>{!p.oportunidade_id ? 'Sem oportunidade' : p.lead_empresa ?? 'Oportunidade removida'}</span>
        </button>
        {/* O arquivo de fora que o navegador não mostra - PowerPoint, Keynote -
            não tem o que ver aqui: ele só baixa. */}
        {(!p.arquivo || abreNaPrevia(p.arquivo.tipo)) && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={p.enviando}
            onClick={() => onVer(p)}>
            <IconEye size={13} /> Ver
          </button>
        )}
        {/* Editar é reabrir os campos no gerador, e a proposta de fora não tem
            campos: o que muda nela é o arquivo, por uma versão nova. */}
        {!p.arquivo && (
          <button type="button" className="btn btn-secondary btn-sm"
            disabled={abrindo != null}
            title={editando === p.id ? 'Esta proposta já está aberta no gerador' : 'Abrir no gerador para editar'}
            onClick={() => onEditar(p)}>
            {abrindo === p.id ? <IconSpinner size={13} /> : <IconEdit size={13} />}
            {editando === p.id ? 'Em edição' : 'Editar'}
          </button>
        )}
        {/* A versão nova sai daqui: ela copia esta proposta inteira e segue
            sozinha, para a anterior continuar intacta na mesa do cliente. */}
        <button type="button" className="btn btn-secondary btn-sm"
          disabled={versionando != null || p.enviando}
          title={p.arquivo
            ? 'Subir o arquivo da versão nova desta proposta'
            : 'Criar uma versão nova a partir desta proposta'}
          onClick={() => onNovaVersao(p)}>
          {versionando === p.id ? <IconSpinner size={13} /> : <IconPlus size={13} />} Nova versão
        </button>
        {/* O link no lugar do PDF: a apresentação abre no navegador de quem
            recebe, com os protótipos rodando, e o endereço é o mesmo a cada
            vez que se copia. */}
        <button type="button" className="btn btn-secondary btn-sm"
          disabled={compartilhando === p.id || p.id < 0 || p.enviando}
          title="Copiar o link da apresentação para mandar ao cliente"
          onClick={() => onCompartilhar(p)}>
          {compartilhando === p.id ? <IconSpinner size={13} /> : <IconLink size={13} />} Compartilhar
        </button>
        {/* A de fora baixa como subiu, no formato dela: convertê-la em PDF
            seria entregar outro documento. */}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onBaixar(p)}
          disabled={baixando === p.id || p.enviando}>
          {baixando === p.id ? <IconSpinner size={13} /> : <IconDownload size={13} />}
          {p.arquivo ? 'Baixar' : 'Baixar PDF'}
        </button>
        <button type="button" className="gp-x" aria-label={`Apagar a proposta ${p.cliente}`}
          disabled={p.enviando}
          title="Apagar esta proposta do histórico" onClick={() => onExcluir(p)}>
          <IconTrash size={13} />
        </button>
      </div>
    </div>
  );

  const familias = familiasDoHistorico(lista);
  return (
    <ul className="gp-hist lista-anima" key={lista.map(p => p.id).join('|')}>
      {familias.map(f => {
        const aberta = abertas.includes(f.principal.id);
        return (
          <li key={f.principal.id} className="gp-hist-familia">
            {linha(f.principal, f.versoes.length
              ? {
                quantas: f.versoes.length,
                aberta,
                alternar: () => setAbertas(a => (a.includes(f.principal.id)
                  ? a.filter(x => x !== f.principal.id)
                  : [...a, f.principal.id])),
              }
              : undefined)}
            {/* Montado desde o começo, e não só quando abre: montar na abertura
                faz o bloco animar de nada para nada. */}
            {f.versoes.length > 0 && (
              <div className={`revelar${aberta ? ' aberto' : ''}`}>
                <div>
                  <ul className="gp-hist-versoes">
                    {f.versoes.map(v => <li key={v.id}>{linha(v)}</li>)}
                  </ul>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Os templates: um produto da casa com o miolo da proposta já escrito.
 *
 * Cada card diz o que vem dentro - entregas, prazo, valor, o desenho da infra
 * -, para a escolha ser feita antes de abrir, e não depois de ver o formulário
 * mudar. A prévia mostra o deck inteiro como sairia, com o nome do cliente em
 * aberto.
 */
function TemplatesDeProposta({ onUsar, onVer, bloqueado }: {
  onUsar: (t: TemplateDeProposta) => void;
  onVer: (t: TemplateDeProposta) => void;
  /** Há uma proposta do histórico aberta: o template entraria por cima dela. */
  bloqueado: boolean;
}) {
  return (
    <div className="gp-templates">
      {TEMPLATES.map(t => {
        const d = t.dados();
        const opcao = d.investimento.opcoes.find(o => o.recomendada) ?? d.investimento.opcoes[0];
        const fatos = [
          `${d.entregas.length} ${d.entregas.length === 1 ? 'entrega' : 'entregas'}`,
          `${d.cronograma.meses} ${d.cronograma.meses === 1 ? 'mês' : 'meses'}`,
          opcao?.valor ? `R$ ${opcao.valor} ${opcao.unidade}` : null,
          d.infra?.modelo === 'volume' && d.infra.volumes
            ? `Infra por ${d.infra.volumes.rotulo.toLowerCase()}`
            : d.infra ? 'Com infra e manutenção' : null,
        ].filter(Boolean) as string[];
        return (
          <article key={t.id} className="gp-template">
            <div className="gp-template-topo">
              <span className="gp-template-icone"><IconDoc size={16} /></span>
              <div className="gp-template-nome">
                <b>{t.nome}</b>
                <span>{t.origem}</span>
              </div>
            </div>
            <p className="gp-template-desc">{t.descricao}</p>
            <ul className="gp-template-fatos">
              {fatos.map(f => <li key={f}>{f}</li>)}
            </ul>
            <ul className="gp-template-entregas">
              {d.entregas.map(e => <li key={e.nome}>{e.nome}</li>)}
            </ul>
            <div className="gp-template-acoes">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVer(t)}>
                <IconEye size={13} /> Ver prévia
              </button>
              <button type="button" className="btn btn-primary btn-sm" disabled={bloqueado}
                title={bloqueado ? 'Saia da edição da proposta aberta antes de usar um template' : undefined}
                onClick={() => onUsar(t)}>
                Usar este template <IconArrowRight size={12} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

type AbaDoGerador = 'gerador' | 'templates' | 'historico';

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
  /** O rascunho sendo guardado, para o botão girar enquanto isso. */
  const [salvandoRascunho, setSalvandoRascunho] = useState(false);
  /** A proposta do histórico que está virando PDF. */
  const [baixando, setBaixando] = useState<number | null>(null);
  /** A proposta que está sendo copiada numa versão nova. */
  const [versionando, setVersionando] = useState<number | null>(null);
  /** A proposta do histórico que está pedindo o link público. */
  const [compartilhando, setCompartilhando] = useState<number | null>(null);
  /** A proposta do histórico com a pergunta de apagar aberta. */
  const [apagando, setApagando] = useState<PropostaGerada | null>(null);
  /** A gaveta de subir uma proposta feita fora, e de qual ela é versão. */
  const [envio, setEnvio] = useState<{ origem: OrigemDoEnvio | null } | null>(null);
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
  /** A janela do preenchimento à vista. Fechada, o trabalho continua e quem
   *  conta o andamento é o balão do canto. */
  const [janelaDaIa, setJanelaDaIa] = useState(false);
  /** O mesmo, em ref: o `preencher` é esperado com `await`, e depois dele o
   *  estado lido no corpo da função seria o de antes. */
  const janelaAberta = useRef(false);
  /** O trabalho em segundo plano deste preenchimento, para o balão. */
  const trabalhoDaIa = useRef<Trabalho | null>(null);
  const { iniciar } = useAtividades();
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

  /** O arquivo de uma proposta subida de fora, remontado das partes. */
  const arquivoDoHistorico = useCallback(async (p: PropostaGerada) => {
    if (!p.arquivo) throw new Error('Esta proposta não tem arquivo.');
    return baixarPartes(ordem => api(`?action=proposta_arquivo_parte&id=${p.id}&ordem=${ordem}`), p.arquivo.partes);
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

  // O balão conta a mesma história da janela, em uma linha.
  useEffect(() => {
    if (!ia.andamento) return;
    trabalhoDaIa.current?.andar(percentualDaIa(ia.andamento) / 100, resumoDaIa(ia.andamento));
  }, [ia.andamento]);

  // Com a janela à vista, o balão se cala: dois lugares contando a mesma coisa
  // ao mesmo tempo é ruído.
  useEffect(() => {
    janelaAberta.current = janelaDaIa;
    trabalhoDaIa.current?.mostrarBalao(!janelaDaIa);
  }, [janelaDaIa]);

  // Sair do gerador leva o preenchimento junto: os campos que ele enche são os
  // desta tela, e sem ela a resposta não teria onde cair. O balão diz isso em
  // vez de ficar girando para sempre.
  useEffect(() => () => {
    trabalhoDaIa.current?.falhar('O preenchimento pela IA parou',
      'O gerador foi fechado, e é nele que a proposta escrita cai.');
  }, []);

  const editar = (parte: Partial<DadosProposta>) => setD(a => ({ ...a, ...parte }));

  // ── Templates ──

  /** O template que pede confirmação antes de entrar: o formulário já tinha
   *  conteúdo, e o template o substitui inteiro. */
  const [templatePedido, setTemplatePedido] = useState<TemplateDeProposta | null>(null);
  /** O template com a prévia aberta. */
  const [templateVisto, setTemplateVisto] = useState<TemplateDeProposta | null>(null);

  /** O formulário ainda é o de partida: usar um template não apaga nada. Quem
   *  prepara vem da sessão e não conta como algo escrito. */
  const formularioEmBranco = JSON.stringify({ ...d, preparadoPor: '' }) === JSON.stringify(propostaEmBranco());

  /** Põe o template no formulário. O que é desta proposta, e não do produto,
   *  fica: a oportunidade escolhida, o cliente já digitado e quem prepara. */
  function usarTemplate(t: TemplateDeProposta) {
    const novo = t.dados();
    setD(a => ({ ...novo, cliente: a.cliente || novo.cliente, preparadoPor: usuario?.nome ?? a.preparadoPor }));
    setAntesDaIa(null);
    setConferencia(null);
    setPasso(0);
    setEntregaEmFoco(0);
    setAba('gerador');
    toast('success', `Template ${t.nome} aplicado`,
      leadId ? 'Confira os passos e ajuste o que for deste cliente.' : 'Escolha a oportunidade e confira os passos.');
  }

  function pedirTemplate(t: TemplateDeProposta) {
    if (editando) return;
    if (formularioEmBranco) usarTemplate(t);
    else setTemplatePedido(t);
  }

  /** O deck do template como sairia, com o nome do cliente em aberto. */
  const htmlDoTemplate = useCallback(async (t: TemplateDeProposta) => {
    const html = await htmlDaProposta({ ...t.dados(), cliente: 'Nome do cliente', preparadoPor: usuario?.nome ?? '' });
    if (!html) throw new Error('O modelo da proposta não carregou.');
    return html;
  }, [usuario?.nome]);

  async function baixarHtmlDoTemplate(t: TemplateDeProposta) {
    const html = await htmlDoTemplate(t).catch(() => null);
    if (!html) { toast('error', 'A prévia não saiu', 'O modelo da proposta não carregou.'); return; }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `Template - ${t.nome}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Pede a proposta à IA e põe o que voltou no formulário. O que não é dela -
   *  quem prepara, quem apresenta, a validade - fica como estava, e campo que
   *  ela devolveu vazio não apaga o que o operador já tinha escrito. */
  async function preencherComIa() {
    if (!leadId || ia.andamento) return;
    // A partir daqui quem manda no pedido é o sistema, e não a janela: fechá-la
    // não para nada, e só o Cancelar - dela ou do balão - corta.
    const t = iniciar({
      titulo: 'Preenchendo a proposta',
      onde: 'Gerador de propostas',
      pagina: 'gerador-propostas',
      abrir: () => setJanelaDaIa(true),
      aviso: 'O que a IA já escreveu se perde, e a chamada feita até aqui não volta.',
    });
    trabalhoDaIa.current = t;
    setJanelaDaIa(true);
    t.mostrarBalao(false);
    const r = await ia.preencher(leadId, contextoIa.trim(), informadoIa, t.sinal);
    // Terminado com a janela fora de vista, não há quem a desmonte: o andamento
    // se encerra aqui para o próximo preenchimento poder começar.
    if (!janelaAberta.current) ia.encerrar();
    trabalhoDaIa.current = null;
    if (!r.ok) {
      if (!('cancelado' in r)) t.falhar('A IA não preencheu a proposta', r.erro);
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
    // O fim passa pelo balão: ele confirma com o toast da casa e fica no canto
    // com a cara de pronto, para quem estava noutra tela encontrar o resultado.
    t.concluir('Proposta preenchida pela IA', janelaAberta.current
      ? `${leu}${precos}. Passe pelos passos conferindo o que ela escreveu.`
      : `${leu}${precos}. Os campos estão no gerador, esperando a sua conferida.`);
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
  async function registrar(final: DadosProposta, slides: number, rascunho = false) {
    const r = await api('', 'POST', {
      action: 'registrar_proposta', oportunidade_id: leadId,
      cliente: final.cliente, subtitulo: final.subtitulo, dados: final, slides, rascunho,
    });
    if (!r?.id) {
      toast('error', rascunho
        ? 'O rascunho não foi guardado'
        : 'A proposta saiu, mas não ficou presa à oportunidade',
        r?.error ?? (rascunho ? 'Tente de novo.' : 'Gere de novo para registrar no funil.'));
      return false;
    }
    const lead = leads?.find(l => l.id === leadId);
    const linha: PropostaGerada = {
      id: Number(r.id), oportunidade_id: leadId, lead_empresa: lead?.empresa ?? null,
      cliente: final.cliente, subtitulo: final.subtitulo, slides, rascunho,
      origem_id: null, versao: 1,
      autor_nome: usuario?.nome ?? 'você', criado_em: r.criado_em, atualizado_em: r.atualizado_em,
    };
    // Pelo id: refazer a mesma proposta atualiza a linha dela, e aqui ela sobe
    // para o topo em vez de virar uma segunda.
    setHistorico(atual => (atual == null ? atual : [linha, ...atual.filter(p => p.id !== linha.id)]));
    return true;
  }

  /**
   * Guarda a proposta como está, sem gerar o PDF: o rascunho.
   *
   * Não passa pela conferência do montador nem pela lista do que falta - é
   * justamente a proposta pela metade que ele existe para guardar. O que ele
   * pede é o mínimo para achá-la depois: o lead, o cliente e o subtítulo.
   *
   * Editando uma proposta do histórico, o rascunho sobrescreve a que está
   * aberta: quem abriu para continuar não quer uma segunda linha a cada vez
   * que para no meio.
   */
  async function salvarRascunho() {
    if (salvandoRascunho) return;
    if (!leadId || !d.cliente.trim() || !d.subtitulo.trim()) {
      toast('error', 'Falta o começo', 'O rascunho precisa do lead, do cliente e do subtítulo.');
      setPasso(0);
      return;
    }
    setSalvandoRascunho(true);
    const final = limpar(d, false);
    // Os slides só se contam quando a proposta monta; no rascunho ela pode nem
    // montar ainda, e aí a contagem fica para quando o PDF sair.
    const conferida = template ? montarProposta(template, final) : null;
    const slides = conferida?.ok ? conferida.conferencia.slides : 0;
    if (editando) {
      await gravarEdicao('sobrescrever', { final, slides }, true);
      setSalvandoRascunho(false);
      return;
    }
    const ok = await registrar(final, slides, true);
    setSalvandoRascunho(false);
    if (ok) {
      toast('success', 'Rascunho guardado', `${final.cliente}. Continue por ele no histórico.`);
      setAba('historico');
    }
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
  async function gravarEdicao(
    modo: 'sobrescrever' | 'nova',
    { final, slides }: { final: DadosProposta; slides: number },
    rascunho = false,
  ) {
    if (!editando) return;
    const alvo = editando;
    const emEdicao = { d, leadId };
    const lead = leads?.find(l => l.id === leadId);
    const agora = new Date().toISOString();
    // Salva como nova, a cópia entra na família da que estava aberta: é a
    // versão seguinte dela, e não uma proposta solta com o mesmo subtítulo.
    const raiz = alvo.linha.origem_id ?? alvo.id;
    const proximaVersao = 1 + (historico ?? [])
      .filter(x => x.id === raiz || x.origem_id === raiz)
      .reduce((maior, x) => Math.max(maior, x.versao), 1);
    const nova: PropostaGerada = {
      ...alvo.linha,
      // A cópia ganha um id provisório, negativo, até o de verdade chegar.
      id: modo === 'nova' ? -Date.now() : alvo.id,
      ...(modo === 'nova' ? { origem_id: raiz, versao: proximaVersao } : {}),
      oportunidade_id: leadId,
      lead_empresa: lead?.empresa ?? alvo.linha.lead_empresa,
      cliente: final.cliente,
      subtitulo: final.subtitulo,
      slides,
      rascunho,
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
      ...(modo === 'nova' ? { origem_de: alvo.id } : { id: alvo.id }),
      oportunidade_id: leadId, cliente: final.cliente, subtitulo: final.subtitulo, dados: final, slides,
      rascunho,
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
        ...(modo === 'nova' ? { versao: Number(resposta.versao ?? x.versao) } : {}),
      }
      : x))));
    toast('success',
      rascunho ? 'Rascunho guardado'
        : modo === 'nova' ? `Salva como versão ${nova.versao}` : 'Proposta atualizada',
      rascunho ? `${final.cliente}. Continue por ele no histórico.`
        : modo === 'nova'
          ? `${final.cliente}, ${slides} slides. A versão anterior continua no histórico.`
          : `${final.cliente}, ${slides} slides`);
  }

  async function baixarDoHistorico(p: PropostaGerada) {
    if (baixando != null) return;
    setBaixando(p.id);
    if (p.arquivo) {
      try {
        salvarArquivo(await arquivoDoHistorico(p), p.arquivo.tipo, p.arquivo.nome);
      } catch (e) {
        toast('error', 'O arquivo não desceu', e instanceof Error ? e.message : undefined);
      } finally {
        setBaixando(null);
      }
      return;
    }
    try {
      const pdf = await baixarPdfDaProposta(
        await htmlDoHistorico(p), nomeDoArquivoDe(p.cliente, p.atualizado_em), token);
      if (!pdf.ok) { toast('error', 'O PDF não saiu', pdf.erro); return; }
      // O rascunho que virou PDF deixa de ser rascunho: a marca diz que a
      // proposta ainda não saiu, e agora ela saiu.
      if (p.rascunho) {
        setHistorico(h => (h == null ? h : h.map(x => (x.id === p.id ? { ...x, rascunho: false } : x))));
        const r = await api('', 'POST', { action: 'proposta_deixa_de_ser_rascunho', id: p.id }).catch(() => null);
        if (!r?.ok) {
          setHistorico(h => (h == null ? h : h.map(x => (x.id === p.id ? { ...x, rascunho: true } : x))));
        }
      }
    } catch (e) {
      toast('error', 'Não consegui montar esta proposta', e instanceof Error ? e.message : undefined);
    } finally {
      setBaixando(null);
    }
  }

  /**
   * Copia o link público da proposta, para mandar ao cliente no lugar do PDF.
   *
   * Na primeira vez o servidor cria o endereço; dali em diante ele já vem com a
   * lista, e copiar é na hora. O link mostra a proposta como ela está, então
   * editá-la depois muda o que o cliente vê.
   */
  async function compartilharDoHistorico(p: PropostaGerada) {
    const copiar = async (tokenPublico: string) => {
      const link = linkDaProposta(tokenPublico);
      try {
        await navigator.clipboard.writeText(link);
        toast('success', 'Link copiado', `${p.cliente}. Quem abrir vê a apresentação como ela está agora.`);
      } catch {
        toast('error', 'O navegador não deixou copiar', link);
      }
    };
    if (p.token_publico) { await copiar(p.token_publico); return; }
    if (compartilhando != null) return;
    setCompartilhando(p.id);
    const r = await api('', 'POST', { action: 'compartilhar_proposta', id: p.id }).catch(() => null);
    setCompartilhando(null);
    if (!r?.ok || !r.token) {
      toast('error', 'O link não saiu', r?.error ?? 'A conexão caiu. Tente de novo.');
      return;
    }
    const tokenPublico = String(r.token);
    setHistorico(h => (h == null ? h : h.map(x => (x.id === p.id ? { ...x, token_publico: tokenPublico } : x))));
    await copiar(tokenPublico);
  }

  // ── Versões de uma proposta ──

  /**
   * Uma versão nova a partir de uma proposta do histórico.
   *
   * A cópia aparece na hora, com tudo o que a de origem tem: os campos já estão
   * na tela, e esperar a ida e a volta para ver a linha nascer seria esperar
   * pelo id. Ela nasce rascunho - ainda não foi para ninguém -, e dali em diante
   * é proposta por conta própria: editada, baixada e apagada sem tocar na outra.
   */
  async function criarVersao(p: PropostaGerada) {
    if (versionando != null) return;
    const raiz = p.origem_id ?? p.id;
    // A versão nova da proposta de fora é o arquivo novo: abre a gaveta de
    // subir, presa à mesma família e à mesma oportunidade.
    if (p.arquivo) {
      setEnvio({
        origem: {
          id: p.id, oportunidade_id: p.oportunidade_id, lead_empresa: p.lead_empresa,
          cliente: p.cliente, subtitulo: p.subtitulo,
          proximaVersao: 1 + (historico ?? [])
            .filter(x => x.id === raiz || x.origem_id === raiz)
            .reduce((maior, x) => Math.max(maior, x.versao), 1),
        },
      });
      return;
    }
    setVersionando(p.id);
    const agora = new Date().toISOString();
    const copia: PropostaGerada = {
      ...p,
      // Id provisório, negativo, até o de verdade chegar.
      id: -Date.now(),
      origem_id: raiz,
      versao: 1 + (historico ?? [])
        .filter(x => x.id === raiz || x.origem_id === raiz)
        .reduce((maior, x) => Math.max(maior, x.versao), 1),
      rascunho: true,
      autor_nome: usuario?.nome ?? p.autor_nome,
      criado_em: agora,
      atualizado_em: agora,
    };
    setHistorico(h => (h == null ? h : [copia, ...h]));
    const r = await api('', 'POST', { action: 'criar_versao_proposta', id: p.id }).catch(() => null);
    setVersionando(null);
    if (!r?.ok) {
      setHistorico(h => (h == null ? h : h.filter(x => x.id !== copia.id)));
      toast('error', 'A versão não foi criada', r?.error ?? 'A conexão caiu. Tente de novo.');
      return;
    }
    setHistorico(h => (h == null ? h : h.map(x => (x.id === copia.id
      ? {
        ...x,
        id: Number(r.id ?? x.id),
        origem_id: Number(r.origem_id ?? x.origem_id ?? raiz),
        versao: Number(r.versao ?? x.versao),
        criado_em: String(r.criado_em ?? x.criado_em),
        atualizado_em: String(r.atualizado_em ?? x.atualizado_em),
      }
      : x))));
    toast('success', `Versão ${Number(r.versao ?? copia.versao)} criada`,
      `${p.cliente}. Abra por "Editar" para mexer nela - a anterior continua como está.`);
  }

  /**
   * Sobe uma proposta feita fora do gerador.
   *
   * O arquivo já subiu na gaveta, em partes paralelas, quando foi solto - é lá
   * que a IA leu o título. Aqui a linha entra no histórico no clique, girando,
   * e a proposta é criada por baixo; o servidor só a cria com o arquivo
   * inteiro. Se algo falhar, a linha sai e o toast diz por quê.
   */
  async function subirProposta(pedido: PedidoDeEnvio) {
    const agora = new Date().toISOString();
    const provisorio = -Date.now();
    const familia = pedido.origem_id == null ? null
      : (historico ?? []).find(x => x.id === pedido.origem_id) ?? null;
    const raiz = familia ? (familia.origem_id ?? familia.id) : null;
    const lead = leads?.find(l => l.id === pedido.oportunidade_id);
    const arquivo: ArquivoDaProposta = pedido.arquivo;
    const linha: PropostaGerada = {
      id: provisorio,
      oportunidade_id: pedido.oportunidade_id,
      lead_empresa: familia?.lead_empresa ?? lead?.empresa ?? null,
      cliente: pedido.cliente,
      subtitulo: pedido.subtitulo,
      slides: null,
      rascunho: false,
      origem_id: raiz,
      versao: raiz == null ? 1 : 1 + (historico ?? [])
        .filter(x => x.id === raiz || x.origem_id === raiz)
        .reduce((maior, x) => Math.max(maior, x.versao), 1),
      autor_nome: usuario?.nome ?? 'você',
      criado_em: agora,
      atualizado_em: agora,
      token_publico: null,
      arquivo,
      enviando: true,
    };
    setHistorico(h => [linha, ...(h ?? [])]);
    const desfazer = (erro: string) => {
      setHistorico(h => (h == null ? h : h.filter(x => x.id !== provisorio)));
      toast('error', 'A proposta não subiu', erro);
    };
    // O arquivo já subiu na gaveta, quando foi solto: falta só a linha.
    const r = await api('', 'POST', {
      action: 'criar_proposta_externa',
      envio: pedido.envio, partes: arquivo.partes,
      arquivo_nome: arquivo.nome, arquivo_tipo: arquivo.tipo, arquivo_tamanho: arquivo.tamanho,
      oportunidade_id: pedido.oportunidade_id, cliente: pedido.cliente, subtitulo: pedido.subtitulo,
      origem_id: pedido.origem_id,
    }).catch(() => null);
    if (!r?.ok) { desfazer(r?.error ?? 'A conexão caiu. Tente de novo.'); return; }
    setHistorico(h => (h == null ? h : h.map(x => (x.id === provisorio
      ? {
        ...x,
        id: Number(r.id),
        origem_id: r.origem_id == null ? null : Number(r.origem_id),
        versao: Number(r.versao ?? x.versao),
        criado_em: String(r.criado_em ?? x.criado_em),
        atualizado_em: String(r.atualizado_em ?? x.atualizado_em),
        enviando: false,
      }
      : x))));
    toast('success', raiz == null ? 'Proposta subida' : `Versão ${Number(r.versao)} subida`,
      `${pedido.cliente}. Ela está no histórico com a etiqueta Upload externo.`);
  }

  /**
   * Troca o cliente e o subtítulo de uma proposta pelo histórico.
   *
   * O nome muda na hora e volta atrás se o servidor recusar - dois subtítulos
   * iguais na mesma oportunidade, por exemplo. Lá ele troca também dentro dos
   * campos da apresentação, para a segunda via sair com o nome novo.
   */
  async function renomearProposta(p: PropostaGerada, cliente: string, subtitulo: string) {
    const antes = { cliente: p.cliente, subtitulo: p.subtitulo };
    setHistorico(h => (h == null ? h : h.map(x => (x.id === p.id ? { ...x, cliente, subtitulo } : x))));
    const r = await api('', 'POST', {
      action: 'renomear_proposta', id: p.id, cliente, subtitulo,
    }).catch(() => null);
    if (!r?.ok) {
      setHistorico(h => (h == null ? h : h.map(x => (x.id === p.id ? { ...x, ...antes } : x))));
      toast('error', 'O nome não foi trocado', r?.error ?? 'A conexão caiu. Tente de novo.');
    }
  }

  /**
   * Apaga uma proposta do histórico, e com ela o chip dela no card do lead.
   *
   * Apagar a principal não leva as versões junto: a mais antiga das que ficam
   * assume o lugar dela na tela, como o servidor faz no banco.
   */
  async function apagarProposta(p: PropostaGerada) {
    const antes = historico;
    if (editando?.id === p.id) sairDaEdicao();
    setHistorico(h => {
      if (h == null) return h;
      const herdeira = p.origem_id == null
        ? [...h.filter(x => x.origem_id === p.id)].sort((a, b) => a.versao - b.versao)[0]
        : undefined;
      return h.filter(x => x.id !== p.id).map(x => {
        if (!herdeira) return x;
        if (x.id === herdeira.id) return { ...x, origem_id: null };
        if (x.origem_id === p.id) return { ...x, origem_id: herdeira.id };
        return x;
      });
    });
    const r = await api('', 'POST', { action: 'excluir_proposta', id: p.id }).catch(() => null);
    if (!r?.ok) {
      setHistorico(antes ?? null);
      toast('error', 'A proposta não foi apagada', r?.error ?? 'A conexão caiu. Tente de novo.');
      return;
    }
    toast('success', 'Proposta apagada', `${p.cliente} saiu do histórico e do card do lead.`);
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
              : aba === 'templates'
                ? 'Os produtos da casa com a proposta já escrita, para começar por eles'
                : 'As propostas que já saíram, cada uma presa à sua oportunidade'}
          </p>
        </div>
        {/* Guardar pela metade é gesto de quem vai continuar depois, e por isso
            mora no alto, valendo em qualquer passo: parar no meio do formulário
            é justamente quando ele serve. O último passo é que gera o PDF. */}
        {aba === 'gerador' && (
          <button type="button" className="btn btn-secondary" onClick={() => void salvarRascunho()}
            disabled={salvandoRascunho || gerandoPdf}
            title="Guarda a proposta como está, para continuar depois. Não gera o PDF.">
            {salvandoRascunho ? <IconSpinner size={14} /> : <IconSalvar size={14} />}
            {' '}{salvandoRascunho ? 'Guardando' : editando ? 'Guardar como rascunho' : 'Salvar rascunho'}
          </button>
        )}
        {/* A proposta feita fora entra pelo histórico, que é onde ela mora. */}
        {aba === 'historico' && (
          <button type="button" className="btn btn-secondary surge" onClick={() => setEnvio({ origem: null })}
            title="Guardar no histórico uma proposta feita fora do gerador">
            <IconUpload size={14} /> Subir proposta
          </button>
        )}
      </div>

      {envio && (
        <EnvioDeProposta leads={leads} origem={envio.origem}
          enviar={corpo => api('', 'POST', corpo)}
          onFechar={() => setEnvio(null)}
          onSubir={pedido => { void subirProposta(pedido); }} />
      )}

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
              { valor: 'templates', label: 'Templates' },
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
            onNovaVersao={p => { void criarVersao(p); }}
            versionando={versionando}
            onExcluir={setApagando}
            onRenomear={(p, cliente, subtitulo) => { void renomearProposta(p, cliente, subtitulo); }}
            compartilhando={compartilhando}
            onCompartilhar={p => { void compartilharDoHistorico(p); }}
            onAbrirLead={onAbrirOportunidade} />
        </div>
      )}

      {aba === 'templates' && (
        <div className="aba-painel gp-card">
          <TemplatesDeProposta onUsar={pedirTemplate} onVer={setTemplateVisto} bloqueado={!!editando} />
        </div>
      )}

      {templatePedido && (
        <Dialogo
          titulo={`Usar o template ${templatePedido.nome}?`}
          descricao={<>
            O formulário já tem uma proposta pela metade, e o template entra no lugar dela.
            A oportunidade e o cliente escolhidos ficam. Se quiser guardar o que está lá, salve
            como rascunho antes.
          </>}
          rotuloOk="Usar o template"
          onConfirmar={() => { const t = templatePedido; setTemplatePedido(null); usarTemplate(t); }}
          onFechar={() => setTemplatePedido(null)}
          largura={460} />
      )}

      {templateVisto && (
        <PreviaArquivo
          arquivo={{ nome: `Template - ${templateVisto.nome}`, chave: `template-${templateVisto.id}` }}
          onCarregar={async () => ({ tipo: 'text/html', base64: emBase64(await htmlDoTemplate(templateVisto)) })}
          onBaixar={() => { void baixarHtmlDoTemplate(templateVisto); }}
          onFechar={() => setTemplateVisto(null)}
        />
      )}

      {apagando && (
        <Dialogo
          titulo="Apagar esta proposta?"
          descricao={<>
            <b>{apagando.cliente}</b>{apagando.versao > 1 ? `, versão ${apagando.versao}` : ''} sai do histórico
            e do card do lead no Funil. Não tem volta.
            {apagando.origem_id == null && ' As versões criadas a partir dela ficam, e a mais antiga delas passa a ser a principal.'}
          </>}
          rotuloOk="Apagar"
          onConfirmar={() => { const p = apagando; setApagando(null); void apagarProposta(p); }}
          onFechar={() => setApagando(null)}
          largura={460} />
      )}

      {comoSalvar && editando && (
        <Dialogo
          titulo="Como salvar esta edição?"
          descricao={<>
            <b>Sobrescrever</b> troca a proposta guardada por esta, e a versão anterior não volta.{' '}
            <b>Salvar como versão nova</b> guarda esta como a versão seguinte, junto da original, que
            continua no histórico como está.
          </>}
          rotuloCancelar="Voltar"
          rotuloMeio="Salvar como versão nova"
          onMeio={() => { const c = comoSalvar; setComoSalvar(null); void gravarEdicao('nova', c); }}
          rotuloOk="Sobrescrever a atual"
          onConfirmar={() => { const c = comoSalvar; setComoSalvar(null); void gravarEdicao('sobrescrever', c); }}
          onFechar={() => setComoSalvar(null)}
          largura={500} />
      )}

      {ia.andamento && janelaDaIa && (
        <ProgressoDaIa andamento={ia.andamento} onResponder={ia.responder}
          onCancelar={ia.cancelar}
          onFechada={() => { setJanelaDaIa(false); ia.encerrar(); }}
          onSegundoPlano={() => setJanelaDaIa(false)} />
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
          arquivo={{ nome: vendo.arquivo?.nome ?? `${vendo.cliente} - ${vendo.subtitulo}`, chave: vendo.id }}
          onCarregar={async () => (vendo.arquivo
            ? { tipo: vendo.arquivo.tipo, base64: await arquivoDoHistorico(vendo) }
            : { tipo: 'text/html', base64: emBase64(await htmlDoHistorico(vendo)) })}
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
                <CardDeOpcao key={i} o={o} i={i}
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
      faixa: d.infra.faixa && { ...d.infra.faixa, inclui: semVazios(d.infra.faixa.inclui) },
      volumes: d.infra.volumes && {
        ...d.infra.volumes,
        faixas: d.infra.volumes.faixas.filter(f => previa || f.volume.trim()),
      },
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
  /* O titulo e uma linha de pecas: o nome que corta, as pilulas e o lapis. Sem
     o flex, nome comprido comeria as pilulas e o lapis pelo corte. */
  .gp-hist-titulo { display: flex; align-items: center; min-width: 0; }
  .gp-hist-nome { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* O lapis que abre o nome para edicao: discreto, a vista no hover da linha,
     como o dos objetivos da semana. */
  .gp-hist-renomear {
    flex: none;
    margin-left: 6px;
    width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; border-radius: var(--radius-sm);
    background: none; color: var(--gray2); cursor: pointer;
    opacity: 0;
    transition: opacity var(--transition), background var(--transition), color var(--transition);
  }
  .gp-hist-item:hover .gp-hist-renomear,
  .gp-hist-renomear:focus-visible { opacity: 1; }
  .gp-hist-renomear:hover:not(:disabled),
  .gp-hist-renomear:focus-visible { outline: none; background: var(--gray4); color: var(--black); }
  .gp-hist-renomear:disabled { cursor: default; }
  /* Em tela de toque nao ha mouse em cima: o lapis fica a vista. */
  @media (hover: none) { .gp-hist-renomear { opacity: 1; } }
  /* O nome em edicao, no lugar do nome lido. */
  .gp-hist-renome { display: flex; align-items: center; gap: 6px; }
  .gp-hist-renome-campo { padding: 5px 8px; font-size: 12.5px; width: 180px; flex: none; }
  .gp-hist-renome-sub { flex: 1; min-width: 0; width: auto; }
  .gp-hist-nome-botao {
    flex: none;
    width: 26px; height: 26px;
    display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--gray3); border-radius: var(--radius-sm);
    background: var(--white); color: var(--gray); cursor: pointer;
    transition: background var(--transition), border-color var(--transition), color var(--transition);
  }
  .gp-hist-nome-botao:hover { background: var(--gray4); border-color: var(--gray2); color: var(--black); }
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
    .gp-hist-lead, .gp-hist-evolucao { transition: none; }
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
  /* O nome da opcao, editavel no proprio cabecalho: le como titulo, e so
     mostra a moldura de campo no hover e no foco. */
  .gp-opcao-nome {
    flex: 1; min-width: 0; height: 28px; margin-left: -8px; padding: 0 8px;
    border: 1px solid transparent; border-radius: var(--radius-sm); background: transparent;
    font: inherit; font-size: 11.5px; font-weight: 800; color: var(--black);
    transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
  }
  .gp-opcao-nome:hover { border-color: var(--gray3); background: var(--white); }
  .gp-opcao-nome:focus { outline: none; border-color: var(--gray2); background: var(--white); box-shadow: 0 0 0 3px var(--gray4); }
  .gp-opcao-nome::placeholder { color: var(--gray2); }
  .gp-opcao-rec {
    flex: none; padding: 2px 8px; border-radius: var(--radius-pill);
    background: var(--yellow); color: var(--on-yellow);
    font-size: 10px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase;
  }
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
  /* O rascunho na lista: a mesma pilula dos chips de estado, em cinza - ele
     nao e um aviso, e so o lembrete de que aquilo ainda nao saiu. */
  .gp-hist-rascunho {
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--gray4);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .02em;
    text-transform: uppercase;
    color: var(--gray2);
    vertical-align: middle;
  }
  /* A versao, na mesma pilula do rascunho mas em amarelo: ela nao e um aviso,
     e o numero que diz qual das propostas da familia e esta. */
  /* A etiqueta da proposta de fora: a mesma pilula do rascunho, com borda no
     lugar do fundo - e outra informacao, nao um outro estado. */
  .gp-hist-externa {
    flex: none;
    margin-left: 8px;
    padding: 1px 8px;
    border: 1px solid var(--gray3);
    border-radius: var(--radius-pill);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: .02em;
    text-transform: uppercase;
    color: var(--gray);
    white-space: nowrap;
  }
  .gp-hist-versao {
    margin-left: 8px;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--yellow);
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: .02em;
    color: var(--on-yellow);
    vertical-align: middle;
  }
  /* A familia: a principal na frente e as versoes recolhidas embaixo. */
  .gp-hist-familia { display: flex; flex-direction: column; }
  /* O gatilho da evolucao, dentro do texto da principal. */
  .gp-hist-evolucao {
    display: inline-flex; align-items: center; gap: 5px;
    margin-top: 5px; padding: 0;
    border: 0; background: none; cursor: pointer;
    font-size: 11.5px; font-weight: 700; color: var(--gray);
    transition: color var(--transition);
  }
  .gp-hist-evolucao:hover { color: var(--black); }
  .gp-hist-evolucao .entrega-seta { color: var(--gray2); }
  .gp-hist-evolucao:hover .entrega-seta { color: var(--black); }
  /* As versoes descem recuadas sob a principal, cada uma presa por um traco em
     L - o mesmo ramo dos desdobramentos de objetivo. A ligacao e por linha, e
     nao um fio corrido ao lado: e dela que sai cada versao. */
  .gp-hist-versoes {
    list-style: none; margin: 8px 0 0 36px; padding: 0;
    display: flex; flex-direction: column; gap: 8px;
  }
  .gp-hist-versoes > li { position: relative; }
  .gp-hist-versoes > li::before {
    content: '';
    position: absolute;
    left: -14px;
    top: -12px;
    width: 14px;
    height: calc(50% + 12px);
    border-left: 1.5px solid var(--gray3);
    border-bottom: 1.5px solid var(--gray3);
    border-bottom-left-radius: 7px;
    pointer-events: none;
  }
  /* O tronco segue da curva de uma versao ate a de baixo: sem ele o traco
     nasceria de novo a cada linha, e as versoes leriam como ramos de nada.

     Ele comeca onde a curva sai da vertical (o raio, 7px acima do meio) e
     morre onde a curva de baixo comeca (12px acima dela, 4px acima do fim
     desta linha): encostam sem se sobrepor, senao o traco engrossa no meio. */
  .gp-hist-versoes > li:not(:last-child)::after {
    content: '';
    position: absolute;
    left: -14px;
    top: calc(50% - 7px);
    bottom: 4px;
    width: 1.5px;
    background: var(--gray3);
    pointer-events: none;
  }
  .gp-hist-versoes .gp-hist-item { background: var(--bg); }
  /* Os tres cenarios lado a lado: o mesmo servico nas tres colunas, que e como
     a tabela do slide le. */
  .gp-infra-valores { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .gp-cenario { font-size: 11px; font-weight: 700; color: var(--gray); min-width: 70px; }
  .gp-sugerir { flex-shrink: 0; white-space: nowrap; }
  /* Infra, manutencao e total de uma faixa: lado a lado quando a coluna e
     larga, e quebrando de linha quando ela aperta - os rotulos sao longos, e
     tres colunas fixas os encavalavam. */
  .gp-volume-valores {
    display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 130px), 1fr));
  }
  /* O total de uma faixa de uso: conta, e nao campo, com a altura de um campo
     para a linha nao pular quando ele aparece. */
  .gp-total-faixa {
    display: flex; align-items: center; min-height: 36px; padding: 0 10px;
    border-radius: var(--radius-sm); background: var(--gray4);
    font-size: 13px; font-weight: 800; color: var(--black); white-space: nowrap;
  }

  /* Os templates: um card por produto, lado a lado quando ha largura. */
  .gp-templates {
    display: grid; gap: 14px;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
  }
  .gp-template {
    display: flex; flex-direction: column; gap: 12px; padding: 16px;
    background: var(--white); border: 1px solid var(--gray3); border-radius: var(--radius-md);
  }
  .gp-template-topo { display: flex; align-items: center; gap: 10px; }
  .gp-template-icone {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    width: 34px; height: 34px; border-radius: var(--radius-sm);
    background: var(--yellow); color: var(--on-yellow);
  }
  .gp-template-nome { display: flex; flex-direction: column; min-width: 0; }
  .gp-template-nome b { font-size: 14px; font-weight: 800; color: var(--black); }
  .gp-template-nome span { font-size: 11.5px; color: var(--gray2); }
  .gp-template-desc { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--gray); }
  .gp-template-fatos, .gp-template-entregas {
    list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px;
  }
  .gp-template-fatos li {
    font-size: 11px; font-weight: 700; color: var(--black);
    padding: 3px 9px; border-radius: var(--radius-pill); background: var(--gray4);
  }
  .gp-template-entregas li {
    font-size: 11px; font-weight: 600; color: var(--gray);
    padding: 3px 9px; border-radius: var(--radius-pill); border: 1px solid var(--gray3);
  }
  .gp-template-acoes { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 4px; }
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
