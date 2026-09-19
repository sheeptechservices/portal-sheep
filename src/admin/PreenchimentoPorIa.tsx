// ─────────────────────────────────────────────────────────────────────────────
//  A proposta preenchida pela IA: o pedido e a janela que mostra ele andando.
//
//  O pedido vai para `/api/proposta-ia`, que responde em fluxo: leu o card,
//  leu tal reunião, consultou o preço de tal serviço na AWS, está escrevendo o
//  cronograma. A janela conta essa história no centro da tela, com o giro da
//  casa e uma barra, porque a espera é de um minuto ou mais e custa dinheiro -
//  sem notícia, ninguém sabe se travou, e o reflexo é clicar de novo.
//
//  No meio do caminho a IA pode parar e perguntar: quantos usuários, quanto
//  de dado. A janela troca a lista de etapas pelas perguntas, o operador
//  responde (ou diz que não sabe) e o preenchimento retoma de onde parou. Para
//  quem chama, é uma chamada só: `preencher` só termina com a proposta, com
//  erro ou cancelado.
//
//  O que volta é um rascunho, e não uma proposta pronta: o gerador põe os
//  campos no formulário e o operador passa pelos passos conferindo. Por isso
//  quem chama guarda o formulário de antes, para o preenchimento poder ser
//  desfeito inteiro.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconSparkles } from '../components/icons';
import { Chave } from '../components/Chave';
import { lerEventos } from '../lib/sse';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import type { DadosProposta } from '../lib/proposta/tipos';

/** As partes da proposta na ordem em que a IA as escreve. */
const SECOES = [
  { id: 'capa', nome: 'Capa' },
  { id: 'projeto', nome: 'O projeto' },
  { id: 'entregas', nome: 'Entregas' },
  { id: 'operacao', nome: 'Como funciona' },
  { id: 'cronograma', nome: 'Cronograma' },
  { id: 'investimento', nome: 'Investimento' },
  { id: 'infra', nome: 'Infra' },
] as const;

type Secao = typeof SECOES[number]['id'];

/** Uma pergunta da IA ao operador. */
export interface PerguntaDaIa {
  id: string;
  pergunta: string;
  exemplo: string;
}

/** O que o operador respondeu. Nulo é "não sei". */
export interface RespostaAIa {
  id: string;
  resposta: string | null;
}

/** Onde o preenchimento está. */
export interface AndamentoDaIa {
  /** `fim` é o instante entre a resposta chegar e a janela terminar de sair.
   *  `pergunta` é a pausa em que a IA espera o operador. */
  fase: 'oportunidade' | 'reunioes' | 'pensando' | 'pergunta' | 'precos' | 'escrevendo' | 'conferindo' | 'fim';
  empresa: string | null;
  reunioes: { lidas: number; total: number; assunto: string | null } | null;
  /** A última consulta à tabela da AWS. Nulo enquanto ela não consultou. */
  aws: { rotulo: string; consultas: number } | null;
  perguntas: PerguntaDaIa[] | null;
  secao: Secao | null;
}

/** O que a IA devolve: os campos do formulário, menos os que não são dela
 *  (quem prepara, quem apresenta e a validade). Sem "Como funciona" ou sem
 *  infra é `null`: aquele slide sai. */
export type PropostaDaIa = Pick<DadosProposta,
  'cliente' | 'subtitulo' | 'projeto' | 'ganhos' | 'entregas' | 'cronograma' | 'investimento'>
  & {
    comoFunciona: DadosProposta['comoFunciona'] | null;
    infra: DadosProposta['infra'] | null;
  };

/** O que o operador já decidiu, em campo próprio. Vazio não vai. */
export interface InformadoParaIa {
  formato?: '' | 'mensal' | 'fechado' | 'ambos';
  opcoes?: number;
  valor?: string;
  prazo?: string;
  time?: string;
}

type Resultado =
  | { ok: true; proposta: PropostaDaIa; reunioes: number; consultasAws: number }
  | { ok: false; erro: string }
  | { ok: false; cancelado: true };

/** O pedido e o andamento dele. `andamento` nulo é que não há nada em curso. */
export function usePreenchimentoPorIa(token: string, onSessaoExpirada: () => void) {
  const [andamento, setAndamento] = useState<AndamentoDaIa | null>(null);
  const controle = useRef<AbortController | null>(null);
  /** A pergunta à espera de resposta: `responder` a resolve, `cancelar` a
   *  resolve com nulo. */
  const aguardando = useRef<((r: RespostaAIa[] | null) => void) | null>(null);

  // Sair da tela no meio corta o pedido: a resposta não teria onde cair.
  useEffect(() => () => {
    controle.current?.abort();
    aguardando.current?.(null);
  }, []);

  const preencher = useCallback(async (
    oportunidadeId: string, contexto: string, informado?: InformadoParaIa,
  ): Promise<Resultado> => {
    setAndamento({
      fase: 'oportunidade', empresa: null, reunioes: null, aws: null, perguntas: null, secao: null,
    });
    let retomada: { estado: string; respostas: RespostaAIa[] } | undefined;
    try {
      // Uma volta por pedido: a primeira, e uma a mais para cada pergunta que
      // a IA fizer no caminho.
      for (;;) {
        const c = new AbortController();
        controle.current = c;
        let final: Resultado = { ok: false, erro: 'A IA não respondeu. Tente de novo.' };
        let pausa: { perguntas: PerguntaDaIa[]; estado: string } | null = null;
        try {
          const r = await fetch('/api/proposta-ia', {
            method: 'POST',
            signal: c.signal,
            headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
            body: JSON.stringify({ oportunidade_id: oportunidadeId, contexto, informado, retomada }),
          });
          if (r.status === 401) { onSessaoExpirada(); return { ok: false, erro: 'Sessão expirada.' }; }
          if (!r.ok || !r.body) {
            const dados = await r.json().catch(() => null);
            return { ok: false, erro: dados?.error ?? 'Não foi possível preencher a proposta.' };
          }
          await lerEventos(r.body, e => {
            if (e.tipo === 'oportunidade') {
              setAndamento(a => a && {
                ...a, fase: e.reunioes ? 'reunioes' : 'pensando', empresa: e.empresa,
                reunioes: { lidas: 0, total: e.reunioes, assunto: null },
              });
            } else if (e.tipo === 'reuniao') {
              setAndamento(a => a && { ...a, reunioes: { lidas: e.lidas, total: e.total, assunto: e.assunto } });
            } else if (e.tipo === 'pensando') {
              setAndamento(a => a && { ...a, fase: 'pensando' });
            } else if (e.tipo === 'aws') {
              setAndamento(a => a && { ...a, fase: 'precos', aws: { rotulo: String(e.rotulo), consultas: Number(e.consultas) } });
            } else if (e.tipo === 'secao') {
              setAndamento(a => a && { ...a, fase: 'escrevendo', secao: e.secao });
            } else if (e.tipo === 'conferindo') {
              setAndamento(a => a && { ...a, fase: 'conferindo' });
            } else if (e.tipo === 'pergunta') {
              pausa = { perguntas: e.perguntas as PerguntaDaIa[], estado: String(e.estado) };
            } else if (e.tipo === 'pronto') {
              final = {
                ok: true, proposta: e.proposta as PropostaDaIa,
                reunioes: Number(e.reunioes ?? 0), consultasAws: Number(e.consultasAws ?? 0),
              };
            } else if (e.tipo === 'erro') {
              final = { ok: false, erro: String(e.error ?? 'Não foi possível preencher a proposta.') };
            }
          });
        } finally {
          if (controle.current === c) controle.current = null;
        }

        const parada = pausa as { perguntas: PerguntaDaIa[]; estado: string } | null;
        if (!parada) return final;

        // A IA parou para perguntar. A janela mostra as perguntas e o laço
        // espera a resposta - ou o cancelamento, que chega como nulo.
        setAndamento(a => a && { ...a, fase: 'pergunta', perguntas: parada.perguntas });
        const respostas = await new Promise<RespostaAIa[] | null>(resolver => {
          aguardando.current = resolver;
        });
        aguardando.current = null;
        if (!respostas) return { ok: false, cancelado: true };
        setAndamento(a => a && { ...a, fase: 'pensando', perguntas: null });
        retomada = { estado: parada.estado, respostas };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return { ok: false, cancelado: true };
      return { ok: false, erro: 'A conexão caiu no meio do preenchimento. Tente de novo.' };
    } finally {
      // A janela não some aqui: ela recebe o `fim` e sai com a animação dela,
      // e só então `encerrar` a desmonta.
      setAndamento(a => a && { ...a, fase: 'fim' });
    }
  }, [token, onSessaoExpirada]);

  const responder = useCallback((respostas: RespostaAIa[]) => { aguardando.current?.(respostas); }, []);
  const cancelar = useCallback(() => {
    controle.current?.abort();
    aguardando.current?.(null);
  }, []);
  const encerrar = useCallback(() => setAndamento(null), []);

  return { andamento, preencher, responder, cancelar, encerrar };
}

/** Quanto já andou, de 0 a 100. É uma estimativa pelas etapas, e não um
 *  cronômetro: a barra anda quando algo de fato acontece. */
function percentual(a: AndamentoDaIa): number {
  if (a.fase === 'oportunidade') return 6;
  if (a.fase === 'reunioes') {
    const r = a.reunioes;
    return 10 + (r && r.total ? (r.lidas / r.total) * 15 : 15);
  }
  if (a.fase === 'pensando' || a.fase === 'pergunta') return 28;
  // Cada consulta anda um pouco, sem passar do começo da escrita.
  if (a.fase === 'precos') return Math.min(40, 30 + (a.aws?.consultas ?? 0));
  if (a.fase === 'conferindo') return 96;
  if (a.fase === 'fim') return 100;
  const i = SECOES.findIndex(s => s.id === a.secao);
  return 40 + ((i + 1) / SECOES.length) * 54;
}

/** Uma etapa da lista: feita, em curso ou por vir. */
function Etapa({ estado, titulo, nota, children, surge }: {
  estado: 'feita' | 'agora' | 'depois';
  titulo: string;
  nota?: string | null;
  children?: React.ReactNode;
  /** A etapa nasceu no meio do caminho (a consulta de preços): entra subindo. */
  surge?: boolean;
}) {
  return (
    <li className={`ia-etapa ${estado}${surge ? ' surge' : ''}`}>
      <span className="ia-etapa-marca" aria-hidden="true">
        {estado === 'feita' ? <IconCheck size={12} />
          : estado === 'agora' ? <span className="dux-spinner sm" /> : <span className="ia-etapa-ponto" />}
      </span>
      <span className="ia-etapa-corpo">
        <span className="ia-etapa-titulo">{titulo}</span>
        {nota && <span className="ia-etapa-nota troca" key={nota}>{nota}</span>}
        {children}
      </span>
    </li>
  );
}

/**
 * As perguntas da IA, no lugar da lista de etapas.
 *
 * Toda pergunta aceita "não sei": é a resposta honesta mais comum sobre número
 * de usuários numa proposta, e a IA sabe o que fazer com ela (abre mais os
 * cenários). Campo em branco vale o mesmo - ninguém precisa marcar a chave
 * para poder seguir.
 */
function PerguntasDaIa({ perguntas, onResponder }: {
  perguntas: PerguntaDaIa[];
  onResponder: (r: RespostaAIa[]) => void;
}) {
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [naoSei, setNaoSei] = useState<Record<string, boolean>>({});
  const primeiro = useRef<HTMLInputElement | null>(null);

  // O foco vai para a primeira pergunta quando o painel troca de cara, e não
  // na montagem por `autoFocus`: a troca é animada, e o foco antes da hora
  // rolaria a janela.
  useEffect(() => { primeiro.current?.focus(); }, []);

  const enviar = () => onResponder(perguntas.map(p => ({
    id: p.id,
    resposta: naoSei[p.id] || !(textos[p.id] ?? '').trim() ? null : textos[p.id].trim(),
  })));

  return (
    <form id="ia-perguntas" className="ia-perguntas troca" onSubmit={e => { e.preventDefault(); enviar(); }}>
      <p className="ia-perguntas-intro">
        {perguntas.length === 1
          ? 'A IA precisa de mais um dado para seguir.'
          : 'A IA precisa de mais alguns dados para seguir.'}
        {' '}Se não souber, marque "Não sei": ela estima com uma faixa maior entre os cenários.
      </p>
      {perguntas.map((p, i) => (
        <div key={p.id} className="ia-pergunta">
          <label className="form-label" htmlFor={`ia-pergunta-${p.id}`}>{p.pergunta}</label>
          <div className="ia-pergunta-linha">
            <input id={`ia-pergunta-${p.id}`} className="form-input"
              ref={i === 0 ? primeiro : undefined}
              value={textos[p.id] ?? ''}
              placeholder={p.exemplo ? `Ex.: ${p.exemplo}` : ''}
              disabled={!!naoSei[p.id]}
              onChange={e => setTextos(t => ({ ...t, [p.id]: e.target.value }))} />
            <Chave ligada={!!naoSei[p.id]} rotulo="Não sei"
              onChange={v => setNaoSei(n => ({ ...n, [p.id]: v }))} />
          </div>
        </div>
      ))}
    </form>
  );
}

/**
 * A janela do preenchimento, no centro da tela.
 *
 * Clicar fora não fecha, de propósito: é uma ação de um minuto que custa
 * dinheiro, e um clique distraído no fundo jogaria tudo fora. O que cancela é
 * o botão - e o Escape, que é o gesto de quem quer sair.
 */
export function ProgressoDaIa({ andamento, onResponder, onCancelar, onFechada }: {
  andamento: AndamentoDaIa;
  /** A resposta às perguntas da IA, que retoma o preenchimento. */
  onResponder: (r: RespostaAIa[]) => void;
  /** Corta o pedido. A janela sai sozinha logo depois, pelo `fim`. */
  onCancelar: () => void;
  /** A janela terminou de sair: quem a montou já pode desmontá-la. */
  onFechada: () => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechada);

  // Terminou - bem, mal ou cancelado -: a janela sai com a animação dela, em
  // vez de sumir de estalo debaixo do formulário que acabou de encher.
  useEffect(() => { if (andamento.fase === 'fim') fechar(); }, [andamento.fase, fechar]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCancelar]);

  const ordem = ['oportunidade', 'reunioes', 'pensando', 'pergunta', 'precos', 'escrevendo', 'conferindo', 'fim'] as const;
  const aqui = ordem.indexOf(andamento.fase);
  const estadoDe = (fase: typeof ordem[number]) => {
    const i = ordem.indexOf(fase);
    return i < aqui ? 'feita' : i === aqui ? 'agora' : 'depois';
  };
  const r = andamento.reunioes;
  const aws = andamento.aws;
  const iSecao = SECOES.findIndex(s => s.id === andamento.secao);
  // Escrever é uma etapa só na lista, com as partes da proposta dentro dela: a
  // parte em curso gira, as de antes ficam marcadas.
  const escrevendo = andamento.fase === 'escrevendo' || andamento.fase === 'pensando'
    ? 'agora' : aqui > ordem.indexOf('escrevendo') ? 'feita' : 'depois';
  const perguntando = andamento.fase === 'pergunta' && !!andamento.perguntas?.length;

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10040, alignItems: 'center', justifyContent: 'center' }}>
      <div className="delete-confirm-modal ia-janela" role="dialog" aria-modal="true"
        aria-labelledby="ia-janela-titulo">
        <div className="ia-giro" aria-hidden="true">
          {/* Parada na pergunta, a IA não está trabalhando: o giro para, e fica
              só o ícone, para não dizer "espere" a quem precisa agir. */}
          {!perguntando && <span className="dux-spinner" />}
          <span className="ia-giro-icone"><IconSparkles size={16} /></span>
        </div>
        <h3 id="ia-janela-titulo" className="ia-janela-titulo troca" key={perguntando ? 'p' : 'e'}>
          {!perguntando ? 'Preenchendo a proposta'
            : andamento.perguntas!.length === 1 ? 'A IA tem uma pergunta' : 'A IA tem algumas perguntas'}
        </h3>
        <p className="ia-janela-sub">
          {andamento.empresa ? `${andamento.empresa} · ` : ''}
          {perguntando ? 'responda para ela seguir' : 'leva cerca de um minuto'}
        </p>

        <div className="ia-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(percentual(andamento))}>
          <span style={{ width: `${percentual(andamento)}%` }} />
        </div>

        {perguntando ? (
          <PerguntasDaIa key="perguntas" perguntas={andamento.perguntas!} onResponder={onResponder} />
        ) : (
          <ol className="ia-etapas troca" key="etapas">
            <Etapa estado={estadoDe('oportunidade')} titulo="Lendo o card da oportunidade"
              nota={andamento.empresa} />
            <Etapa estado={aqui <= 0 ? 'depois' : aqui === 1 ? 'agora' : 'feita'}
              titulo="Lendo as reuniões do Fireflies"
              nota={!r ? null : r.total === 0
                ? 'Nenhuma reunião presa a esta oportunidade'
                : `${r.lidas} de ${r.total}${r.assunto ? ` · ${r.assunto}` : ''}`} />
            {/* A consulta de preços só aparece quando acontece: numa proposta
                sem sistema a manter no ar, ela não existe, e uma etapa que
                nunca começa leria como travada. */}
            {aws && (
              <Etapa surge estado={andamento.fase === 'precos' ? 'agora' : aqui > ordem.indexOf('precos') ? 'feita' : 'depois'}
                titulo="Consultando preços na AWS"
                nota={`${aws.rotulo} · ${aws.consultas === 1 ? '1 consulta' : `${aws.consultas} consultas`}`} />
            )}
            <Etapa estado={escrevendo} titulo="Escrevendo a proposta"
              nota={andamento.fase === 'pensando' ? 'Correlacionando o card, as reuniões e o seu contexto' : null}>
              <span className="ia-secoes">
                {SECOES.map((s, i) => (
                  <span key={s.id}
                    className={`ia-secao${i < iSecao || aqui > ordem.indexOf('escrevendo') ? ' feita' : ''}${i === iSecao && andamento.fase === 'escrevendo' ? ' agora' : ''}`}>
                    {s.nome}
                  </span>
                ))}
              </span>
            </Etapa>
            <Etapa estado={estadoDe('conferindo')} titulo="Conferindo o que veio" />
          </ol>
        )}

        <div className="ia-janela-acoes">
          <button type="button" className="btn btn-secondary" onClick={onCancelar}
            disabled={andamento.fase === 'fim'}>
            Cancelar
          </button>
          {/* Fora do formulário, ao lado do Cancelar: as duas saídas da
              pergunta ficam na mesma linha. O `form` liga o botão a ele. */}
          {perguntando && (
            <button type="submit" form="ia-perguntas" className="btn btn-primary surge">Continuar</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
