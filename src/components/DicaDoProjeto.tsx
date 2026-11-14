import { DicaComposicao, DicaTopo } from './DicaRica';
import { COR_ENTREGA } from '../lib/etapasEntrega';
import type { Projeto } from '../admin/ProjetosPage';

/**
 * A cor de cada projeto, sempre a mesma: sai do id, e nao da posicao na lista.
 * Assim o projeto tem a mesma cara no menu, no painel e na tela de Projetos,
 * por mais que a ordem mude entre elas. Sao seis tons (`.cor-projeto-0..5`).
 */
export function corDoProjeto(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 6;
}

const FECHADA = ['Entregue', 'Validada', 'Cancelada'];

function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(ate.slice(0, 10)).getTime() - new Date(de.slice(0, 10)).getTime()) / 86400000);
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * O que a dica de um projeto mostra: as entregas divididas por etapa, a lista
 * delas com o quanto cada uma andou (a da vez em destaque), as tarefas feitas e
 * quanto falta para o prazo. A mesma no painel e na tela de Projetos.
 */
export function ConteudoDaDicaDoProjeto({ p, fecha }: {
  p: Projeto;
  /** Se a etapa da tarefa conta como feita. */
  fecha: (status: string) => boolean;
}) {
  const hoje = hojeIso();
  const entregas = [...(p.entregas ?? [])].sort((a, b) => a.ordem - b.ordem);
  const atual = entregas.find(e => !FECHADA.includes(e.status));
  const tarefas = p.tarefas ?? [];
  const feitas = tarefas.filter(t => fecha(t.status)).length;
  const porStatus = Object.entries(entregas.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1; return acc;
  }, {})).map(([rotulo, valor]) => ({ rotulo, valor, cor: COR_ENTREGA[rotulo] ?? 'var(--gray2)' }));
  const prazo = p.previsao_entrega ? diasEntre(hoje, p.previsao_entrega) : null;
  return (
    <>
      <DicaTopo rotulo={p.cliente_nome ?? 'Sem cliente'} valor={p.nome} />
      {entregas.length > 0 ? (
        <>
          <DicaComposicao fatias={porStatus} />
          <p className="dica-secao">Entregas</p>
          <ul className="dica-lista">
            {entregas.slice(0, 5).map((e, k) => {
              const pct = e.status === 'Validada' ? 100 : Math.round(e.progresso ?? 0);
              return (
                <li key={e.id} className={e === atual ? 'destaque' : undefined} style={{ animationDelay: `${120 + k * 40}ms` }}>
                  <span className="dica-legenda-ponto" style={{ background: COR_ENTREGA[e.status] ?? 'var(--gray2)' }} />
                  <span className="dica-lista-nome">{e.titulo}<em>{e.status}</em></span>
                  <span className="dica-mini-barra">
                    <span style={{ width: `${pct}%`, background: COR_ENTREGA[e.status], animationDelay: `${180 + k * 40}ms` }} />
                  </span>
                  <strong>{pct}%</strong>
                </li>
              );
            })}
          </ul>
          {entregas.length > 5 && <p className="dica-rodape">e mais {entregas.length - 5}</p>}
        </>
      ) : <p className="dica-rodape">Ainda sem entregas cadastradas.</p>}
      <div className="dica-pilulas">
        <span><strong>{feitas}/{tarefas.length}</strong> tarefas feitas</span>
        {prazo != null && (
          <span className={prazo < 0 ? 'ruim' : ''}>
            <strong>{prazo < 0 ? `${-prazo}d` : prazo === 0 ? 'hoje' : `${prazo}d`}</strong>
            {prazo < 0 ? ' de atraso' : prazo === 0 ? '' : ' para o prazo'}
          </span>
        )}
      </div>
    </>
  );
}
