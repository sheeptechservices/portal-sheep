// ─────────────────────────────────────────────────────────────────────────────
//  O diálogo da casa: uma pergunta, e duas saídas.
//
//  Existia um por tela, escrito à mão - vinte e dois deles, com z-index
//  diferente, rótulo diferente e, principalmente, jeitos diferentes de fechar:
//  a maioria sumia de corte, porque o clique no fundo chamava o `setEstado(null)`
//  direto e a animação de saída nunca chegava a rodar.
//
//  Aqui todo caminho de fechar - o fundo, o Cancelar, o Escape - passa pelo
//  mesmo `fechar`, que é o do `useSaidaSuave`.
//
//  Não é só de exclusão: a mesma caixa pergunta "mover para fechado?" e
//  "registrar a leitura de saúde?". Por isso o texto e o rótulo vêm de fora, e
//  o vermelho é escolha (`perigo`), não regra.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

export function Dialogo({
  titulo, descricao, rotuloOk = 'Confirmar', rotuloCancelar = 'Cancelar',
  rotuloMeio, onMeio,
  perigo = true, corOk, corTextoOk, ocupado, ocupadoRotulo, zIndex = 10001, largura,
  onFechar, onConfirmar, children,
}: {
  titulo: string;
  /** O corpo da pergunta. Nó, e não texto, porque metade delas destaca o nome
   *  do que vai sumir em negrito. */
  descricao?: ReactNode;
  rotuloOk?: string;
  rotuloCancelar?: string;
  /** Uma terceira resposta, entre sair e confirmar - "mudar sem avisar", ao
   *  lado de "avisar" e "deixar como está". Só aparece com o `onMeio`. */
  rotuloMeio?: string;
  onMeio?: () => void;
  /** Vermelho no botão de confirmar. Verdadeiro por padrão: a caixa nasceu para
   *  perguntas sem volta, e é para elas que ela é usada na maior parte. */
  perigo?: boolean;
  /** Cor própria no botão de confirmar, quando ela quer dizer alguma coisa: o
   *  estado da saúde do projeto, a etapa que a entrega vai assumir. Vence o
   *  `perigo`. */
  corOk?: string;
  corTextoOk?: string;
  /** Gravando: o botão trava e, se houver, troca de rótulo. */
  ocupado?: boolean;
  ocupadoRotulo?: string;
  /** Acima de outra coisa que já esteja aberta - uma gaveta, um modal. O padrão
   *  cobre o painel de tarefa, que é o mais alto do sistema. */
  zIndex?: number;
  largura?: number;
  onFechar: () => void;
  onConfirmar: () => void;
  /** O que a pergunta precisa além do texto: um campo de motivo, uma lista de
   *  pendências. Entra entre a descrição e os botões. */
  children?: ReactNode;
}) {
  // Confirmar e cancelar saem pela mesma animação: o gancho avisa quem monta só
  // depois que ela termina, e este alvo diz qual dos dois foi. Sem isso,
  // confirmar desmontava a caixa no clique e ela sumia de corte - justo no
  // gesto que a pessoa mais quer ver acontecer.
  const aoTerminar = useRef(onFechar);
  const { saindo, fechar } = useSaidaSuave(() => aoTerminar.current());
  const sair = () => { aoTerminar.current = onFechar; fechar(); };
  const confirmar = () => { aoTerminar.current = onConfirmar; fechar(); };
  const meio = () => { aoTerminar.current = onMeio ?? onFechar; fechar(); };
  const fundo = useFecharNoFundo(sair);

  // Escape fecha, como em toda caixa da casa. No `document` porque o foco pode
  // estar num campo lá dentro, e o `keydown` do diálogo não o alcançaria.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') sair(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="delete-confirm-modal" style={largura ? { width: largura } : undefined}
        onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">{titulo}</p>
        {descricao && <p className="delete-confirm-desc">{descricao}</p>}
        {children}
        <div className="delete-confirm-actions">
          <button type="button" className="delete-confirm-cancel delete-confirm-sair" onClick={sair}>
            {rotuloCancelar}
          </button>
          {/* A terceira saída, quando a pergunta tem três respostas de verdade.
              Fica no meio porque é uma ação, como a de confirmar, e não o jeito
              de sair - esse é o primeiro botão, e por isso o único sem moldura:
              três botões com o mesmo peso obrigam a ler os três para achar a
              porta. */}
          {onMeio && rotuloMeio && (
            <button type="button" className="delete-confirm-cancel" onClick={meio}>
              {rotuloMeio}
            </button>
          )}
          <button type="button" className="delete-confirm-ok" disabled={ocupado}
            style={corOk
              ? { background: corOk, color: corTextoOk ?? '#fff' }
              : perigo ? undefined : { background: 'var(--yellow)', color: 'var(--on-yellow)' }}
            onClick={confirmar}>
            {ocupado && ocupadoRotulo ? ocupadoRotulo : rotuloOk}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** O caso mais curto do diálogo: apagar uma coisa com nome. */
export function ConfirmarExclusao({ titulo, oQue = 'tarefa', zIndex, onCancelar, onConfirmar }: {
  /** O nome do que vai sumir, para a pessoa reconhecer o que confirmou. */
  titulo: string;
  /** A palavra que descreve: "tarefa", "reunião". Entra no título e na frase. */
  oQue?: string;
  zIndex?: number;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Dialogo
      titulo={`Excluir ${oQue}`}
      descricao={<>Tem certeza que deseja excluir "<strong>{titulo}</strong>"? Esta ação não pode ser desfeita.</>}
      rotuloOk="Excluir"
      zIndex={zIndex}
      onFechar={onCancelar}
      onConfirmar={onConfirmar}
    />
  );
}
