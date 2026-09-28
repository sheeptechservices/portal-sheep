// ─────────────────────────────────────────────────────────────────────────────
//  A pílula de status da casa.
//
//  Era a mesma peça escrita três vezes - a etapa da tarefa, a etapa da
//  oportunidade e o status do projeto -, e as três já tinham divergido: uma
//  tinha anel colorido em volta e as outras não, uma media a posição na mão e
//  perdia a lista ao rolar a página, duas desenhavam a seta e o "escolhido" com
//  SVG solto em vez de usar os ícones da casa.
//
//  A referência é a da tarefa, que é a mais usada: pílula na cor do status, sem
//  contorno (o fundo e o ponto já dizem qual é), seta que só aparece quando dá
//  para trocar, e a lista num portal - dentro do painel ela seria recortada
//  pelo `overflow` dele.
//
//  A chave de cada opção é de quem chama: o funil identifica a etapa por id, o
//  quadro de tarefas pelo nome. Aqui ela só serve para saber qual está
//  escolhida e para devolver a opção inteira em `onEscolher`.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown } from './icons';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';

export interface OpcaoDeStatus {
  /** Como esta opção é identificada: o id no funil, o nome no quadro. */
  chave: string | number;
  nome: string;
  cor: string;
  /** O critério de quando usar esta etapa, escrito em Configurações. Vira a
   *  dica da linha: o nome cabe em duas palavras, o critério nem sempre. */
  descricao?: string | null;
}

/** O cinza de quem não tem cor: etapa que saiu da configuração continua sendo o
 *  estado da coisa, e cai aqui em vez de sumir do gatilho. */
const SEM_COR = '#6E6F69';

export function PilulaDeStatus({
  valor, opcoes, onEscolher, rotulo = 'Etapa', vazio = 'Sem etapa',
  desabilitado, compacta, largura = 200,
}: {
  /** A chave da opção escolhida. */
  valor: string | number | null | undefined;
  opcoes: OpcaoDeStatus[];
  onEscolher: (opcao: OpcaoDeStatus) => void;
  /** O que a pílula é, para quem lê pelo leitor de tela: "Etapa", "Status". */
  rotulo?: string;
  /** O que dizer quando nada está escolhido. */
  vazio?: string;
  desabilitado?: boolean;
  /** Dentro de linha de tabela, onde o status não é o dado principal. */
  compacta?: boolean;
  /** Largura mínima da lista. */
  largura?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  const atual = opcoes.find(o => String(o.chave) === String(valor ?? ''));
  const cor = atual?.cor ?? SEM_COR;

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className={`status-select-trigger sem-contorno${compacta ? ' compacta' : ''}`}
        style={{ ['--sc' as string]: cor, cursor: desabilitado ? 'default' : 'pointer' }}
        disabled={desabilitado}
        title={atual?.descricao ?? undefined}
        aria-label={`${rotulo}: ${atual?.nome ?? vazio}`}
        aria-expanded={aberto}
        onClick={() => {
          if (desabilitado || !gatilho.current) return;
          setPos(ancorar(gatilho.current, opcoes.length, largura));
          // Alterna: clicar de novo no gatilho fecha, como em todo dropdown da
          // casa.
          setAberto(a => !a);
        }}>
        <span className="status-select-dot" style={{ background: cor }} />
        <span>{atual?.nome ?? vazio}</span>
        {!desabilitado && <IconChevronDown size={10} />}
      </button>

      {aberto && createPortal(
        <div ref={lista} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {opcoes.map(o => {
            const ativo = String(o.chave) === String(valor ?? '');
            return (
              <div key={o.chave} className={`status-select-option${ativo ? ' active' : ''}`}
                title={o.descricao ?? undefined}
                onClick={() => { onEscolher(o); setAberto(false); }}>
                <span className="status-select-dot" style={{ background: o.cor }} />
                <span>{o.nome}</span>
                {ativo && (
                  <span style={{ marginLeft: 'auto', color: o.cor, display: 'inline-flex' }}>
                    <IconCheck size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
