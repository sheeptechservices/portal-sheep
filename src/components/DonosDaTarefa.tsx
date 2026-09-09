// ─────────────────────────────────────────────────────────────────────────────
//  Os rostos de quem cuida de uma tarefa.
//
//  A tarefa passou a aceitar mais de um responsável, e os lugares onde ela
//  aparece são muitos - o card do quadro, a linha da lista, o cartão da semana,
//  o quadro dentro da entrega. Todos precisam da mesma leitura de relance, e em
//  quatro cópias a pilha começaria igual e terminaria com quatro tamanhos.
//
//  Empilhados e sem nome: numa coluna estreita o rosto reconhece mais rápido, e
//  o nome fica no `title` para quem entrou ontem e ainda não sabe de quem é a
//  cara. É a mesma regra que o card de tarefa já seguia com um dono só.
// ─────────────────────────────────────────────────────────────────────────────
import { Avatar } from '../admin/FormularioTarefa';

export interface PessoaConhecida {
  id: string;
  nome: string;
  foto_url?: string | null;
}

/** Quantos rostos cabem antes de a pilha virar sopa. O que passar disso vira
 *  "+2", que ocupa o lugar de um e diz quantos ficaram de fora. */
const TETO = 3;

export function DonosDaTarefa({ ids, pessoas, size = 20 }: {
  ids: string[] | null | undefined;
  pessoas: PessoaConhecida[];
  size?: number;
}) {
  const lista = (ids ?? []).map(id => ({ id, p: pessoas.find(x => x.id === id) }));
  if (lista.length === 0) return null;

  const mostrados = lista.slice(0, TETO);
  const sobra = lista.length - mostrados.length;
  // O balão traz todo mundo, inclusive quem não coube: a pilha resume, e a dica
  // é onde a resposta inteira está.
  const todos = lista.map(x => x.p?.nome ?? 'Usuário removido').join(', ');

  return (
    <span className="tarefa-donos" title={todos}>
      {mostrados.map(({ id, p }) => (
        <span key={id}>
          <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={size} />
        </span>
      ))}
      {sobra > 0 && (
        <span className="tarefa-donos-mais" style={{ width: size, height: size }}>+{sobra}</span>
      )}
    </span>
  );
}
