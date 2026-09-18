// ─────────────────────────────────────────────────────────────────────────────
//  A proposta preenchida pela IA: o pedido e a janela que mostra ele andando.
//
//  O pedido vai para `/api/proposta-ia`, que responde em fluxo: leu o card,
//  leu tal reunião, está escrevendo o cronograma. A janela conta essa história
//  no centro da tela, com o giro da casa e uma barra, porque a espera é de um
//  minuto e custa dinheiro - sem notícia, ninguém sabe se travou, e o reflexo é
//  clicar de novo.
//
//  O que volta é um rascunho, e não uma proposta pronta: o gerador põe os
//  campos no formulário e o operador passa pelos passos conferindo. Por isso
//  quem chama guarda o formulário de antes, para o preenchimento poder ser
//  desfeito inteiro.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconSparkles } from '../components/icons';
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
] as const;

type Secao = typeof SECOES[number]['id'];

/** Onde o preenchimento está. */
export interface AndamentoDaIa {
  /** `fim` é o instante entre a resposta chegar e a janela terminar de sair. */
  fase: 'oportunidade' | 'reunioes' | 'pensando' | 'escrevendo' | 'conferindo' | 'fim';
  empresa: string | null;
  reunioes: { lidas: number; total: number; assunto: string | null } | null;
  secao: Secao | null;
}

/** O que a IA devolve: os campos do formulário, menos os que não são dela
 *  (quem prepara, quem apresenta e a validade). Sem "Como funciona" é `null`:
 *  numa contratação de escopo fechado aquele slide sai. */
export type PropostaDaIa = Pick<DadosProposta,
  'cliente' | 'subtitulo' | 'projeto' | 'ganhos' | 'entregas' | 'cronograma' | 'investimento'>
  & { comoFunciona: DadosProposta['comoFunciona'] | null };

/** O que o operador já decidiu, em campo próprio. Vazio não vai. */
export interface InformadoParaIa {
  formato?: '' | 'mensal' | 'fechado' | 'ambos';
  opcoes?: number;
  valor?: string;
  prazo?: string;
  time?: string;
}

type Resultado =
  | { ok: true; proposta: PropostaDaIa; reunioes: number }
  | { ok: false; erro: string }
  | { ok: false; cancelado: true };

/** O pedido e o andamento dele. `andamento` nulo é que não há nada em curso. */
export function usePreenchimentoPorIa(token: string, onSessaoExpirada: () => void) {
  const [andamento, setAndamento] = useState<AndamentoDaIa | null>(null);
  const controle = useRef<AbortController | null>(null);

  // Sair da tela no meio corta o pedido: a resposta não teria onde cair.
  useEffect(() => () => controle.current?.abort(), []);

  const preencher = useCallback(async (
    oportunidadeId: string, contexto: string, informado?: InformadoParaIa,
  ): Promise<Resultado> => {
    const c = new AbortController();
    controle.current = c;
    setAndamento({ fase: 'oportunidade', empresa: null, reunioes: null, secao: null });
    let final: Resultado = { ok: false, erro: 'A IA não respondeu. Tente de novo.' };
    try {
      const r = await fetch('/api/proposta-ia', {
        method: 'POST',
        signal: c.signal,
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ oportunidade_id: oportunidadeId, contexto, informado }),
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
        } else if (e.tipo === 'secao') {
          setAndamento(a => a && { ...a, fase: 'escrevendo', secao: e.secao });
        } else if (e.tipo === 'conferindo') {
          setAndamento(a => a && { ...a, fase: 'conferindo' });
        } else if (e.tipo === 'pronto') {
          final = { ok: true, proposta: e.proposta as PropostaDaIa, reunioes: Number(e.reunioes ?? 0) };
        } else if (e.tipo === 'erro') {
          final = { ok: false, erro: String(e.error ?? 'Não foi possível preencher a proposta.') };
        }
      });
      return final;
    } catch (err: any) {
      if (err?.name === 'AbortError') return { ok: false, cancelado: true };
      return { ok: false, erro: 'A conexão caiu no meio do preenchimento. Tente de novo.' };
    } finally {
      if (controle.current === c) controle.current = null;
      // A janela não some aqui: ela recebe o `fim` e sai com a animação dela,
      // e só então `encerrar` a desmonta.
      setAndamento(a => a && { ...a, fase: 'fim' });
    }
  }, [token, onSessaoExpirada]);

  const cancelar = useCallback(() => { controle.current?.abort(); }, []);
  const encerrar = useCallback(() => setAndamento(null), []);

  return { andamento, preencher, cancelar, encerrar };
}

/** Quanto já andou, de 0 a 100. É uma estimativa pelas etapas, e não um
 *  cronômetro: a barra anda quando algo de fato acontece. */
function percentual(a: AndamentoDaIa): number {
  if (a.fase === 'oportunidade') return 6;
  if (a.fase === 'reunioes') {
    const r = a.reunioes;
    return 10 + (r && r.total ? (r.lidas / r.total) * 15 : 15);
  }
  if (a.fase === 'pensando') return 28;
  if (a.fase === 'conferindo') return 96;
  if (a.fase === 'fim') return 100;
  const i = SECOES.findIndex(s => s.id === a.secao);
  return 32 + ((i + 1) / SECOES.length) * 60;
}

/** Uma etapa da lista: feita, em curso ou por vir. */
function Etapa({ estado, titulo, nota, children }: {
  estado: 'feita' | 'agora' | 'depois';
  titulo: string;
  nota?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <li className={`ia-etapa ${estado}`}>
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
 * A janela do preenchimento, no centro da tela.
 *
 * Clicar fora não fecha, de propósito: é uma ação de um minuto que custa
 * dinheiro, e um clique distraído no fundo jogaria tudo fora. O que cancela é
 * o botão - e o Escape, que é o gesto de quem quer sair.
 */
export function ProgressoDaIa({ andamento, onCancelar, onFechada }: {
  andamento: AndamentoDaIa;
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

  const ordem = ['oportunidade', 'reunioes', 'pensando', 'escrevendo', 'conferindo', 'fim'] as const;
  const aqui = ordem.indexOf(andamento.fase);
  const estadoDe = (fase: typeof ordem[number]) => {
    const i = ordem.indexOf(fase);
    return i < aqui ? 'feita' : i === aqui ? 'agora' : 'depois';
  };
  const r = andamento.reunioes;
  const iSecao = SECOES.findIndex(s => s.id === andamento.secao);
  // Escrever é uma etapa só na lista, com as partes da proposta dentro dela: a
  // parte em curso gira, as de antes ficam marcadas.
  const escrevendo = andamento.fase === 'escrevendo' || andamento.fase === 'pensando'
    ? 'agora' : aqui > ordem.indexOf('escrevendo') ? 'feita' : 'depois';

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10040, alignItems: 'center', justifyContent: 'center' }}>
      <div className="delete-confirm-modal ia-janela" role="dialog" aria-modal="true"
        aria-labelledby="ia-janela-titulo">
        <div className="ia-giro" aria-hidden="true">
          <span className="dux-spinner" />
          <span className="ia-giro-icone"><IconSparkles size={16} /></span>
        </div>
        <h3 id="ia-janela-titulo" className="ia-janela-titulo">Preenchendo a proposta</h3>
        <p className="ia-janela-sub">
          {andamento.empresa ? `${andamento.empresa} · ` : ''}leva cerca de um minuto
        </p>

        <div className="ia-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(percentual(andamento))}>
          <span style={{ width: `${percentual(andamento)}%` }} />
        </div>

        <ol className="ia-etapas">
          <Etapa estado={estadoDe('oportunidade')} titulo="Lendo o card da oportunidade"
            nota={andamento.empresa} />
          <Etapa estado={aqui <= 0 ? 'depois' : aqui === 1 ? 'agora' : 'feita'}
            titulo="Lendo as reuniões do Fireflies"
            nota={!r ? null : r.total === 0
              ? 'Nenhuma reunião presa a esta oportunidade'
              : `${r.lidas} de ${r.total}${r.assunto ? ` · ${r.assunto}` : ''}`} />
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

        <div className="ia-janela-acoes">
          <button type="button" className="btn btn-secondary" onClick={onCancelar}
            disabled={andamento.fase === 'fim'}>
            Cancelar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
