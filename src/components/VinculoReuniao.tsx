// ─────────────────────────────────────────────────────────────────────────────
//  O vínculo entre a reunião e o que ela tratou.
//
//  Vive aqui, e não numa das telas, porque os três lados usam as mesmas duas
//  peças: o chip da reunião liga entregas, o detalhe da entrega liga reuniões e
//  o formulário de tarefa liga reuniões. A diferença entre eles é o que está na
//  lista, não como se escolhe.
// ─────────────────────────────────────────────────────────────────────────────
import { IconComentario, IconLink, IconX } from './icons';
import { SeletorMarcavel, type OpcaoMarcavel } from './SeletorMarcavel';

/** O seletor de vínculo: a lista marcável da casa, com a marca de elo no
 *  gatilho e a busca que ela traz de série.
 *
 *  O que era desenhado aqui virou `SeletorMarcavel`, em componente próprio: a
 *  lista com quadradinhos e busca não é do vínculo, é do sistema - e vincular
 *  reunião passou a ser um uso dela, com o rótulo e o ícone deste lado. */
export function SeletorVinculo({ rotulo, acao, opcoes, escolhidos, vazio, onAlternar }: {
  rotulo: string;
  /** O que o botão diz. Sem texto, o gatilho vira um ícone que ninguém acha. */
  acao: string;
  opcoes: OpcaoMarcavel[];
  escolhidos: number[];
  /** O que dizer quando não há o que escolher. */
  vazio: string;
  onAlternar: (id: number, ligar: boolean) => void;
}) {
  return (
    <SeletorMarcavel
      rotulo={rotulo}
      acao={acao}
      icone={<IconLink size={12} />}
      opcoes={opcoes}
      escolhidos={escolhidos}
      vazio={vazio}
      onAlternar={onAlternar}
      placeholderBusca="Buscar pelo nome"
    />
  );
}

/** O vínculo já feito, como chip. Clicar leva ao outro lado - da entrega para a
 *  aba de reuniões, e de lá para a entrega. */
/** O chip de vínculo: um só desenho para tudo que uma coisa aponta.
 *
 *  A reunião dentro da entrega, a entrega dentro da reunião e a reunião dentro
 *  da tarefa são o mesmo gesto - "isto aqui tem a ver com aquilo" -, e por isso
 *  são a mesma peça: marca do que é, nome em negrito e uma nota curta que
 *  situa (a data da conversa, a etapa da entrega). O X de desvincular aparece
 *  só onde desvincular é possível.
 *
 *  O ícone vem de fora porque quem chama é quem sabe o que a peça é: a etapa da
 *  entrega tem ícone e cor próprios, e trazê-los para cá amarraria este arquivo
 *  à tela de Projetos. */
export function Chip({ icone, nome, nota, cor, titulo, onAbrir, onSoltar }: {
  icone: React.ReactNode;
  nome: string;
  /** A linha curta ao lado do nome. Sem ela o chip é só o nome. */
  nota?: string | null;
  /** Cor da marca, quando ela quer dizer alguma coisa (a etapa da entrega). */
  cor?: string;
  titulo: string;
  /** Ausente onde não há para onde levar - o chip vira só a informação. */
  onAbrir?: () => void;
  onSoltar?: () => void;
}) {
  return (
    <span className={`vinculo-chip${onAbrir ? '' : ' parado'}`}
      style={cor ? ({ ['--chip-cor' as string]: cor }) : undefined}>
      <button type="button" className="vinculo-chip-alvo" title={titulo}
        onClick={onAbrir} disabled={!onAbrir}>
        <span className="vinculo-chip-ico">{icone}</span>
        <strong>{nome}</strong>
        {nota && <span>{nota}</span>}
      </button>
      {onSoltar && (
        <button type="button" className="vinculo-soltar" onClick={onSoltar}
          aria-label={`Desvincular ${nome}`} title="Desvincular">
          <IconX size={10} />
        </button>
      )}
    </span>
  );
}

/** A reunião como chip: a marca de onde ela veio, o assunto e a data - o mesmo
 *  trio da linha de reunião no painel de projeto, encolhido para caber numa
 *  faixa de chips. */
export function ChipReuniao({ assunto, data, fireflies, titulo, onAbrir, onSoltar }: {
  assunto: string;
  /** Já formatada por quem chama: a data crua não é para ser lida. */
  data?: string | null;
  /** Veio do Fireflies: a marca diz de onde, como na aba de reuniões. */
  fireflies?: boolean;
  titulo: string;
  onAbrir?: () => void;
  onSoltar?: () => void;
}) {
  return (
    <Chip
      icone={fireflies
        ? <img src="/marcas/fireflies.webp" alt="" width={12} height={12} />
        : <IconComentario size={12} />}
      nome={assunto}
      nota={data}
      titulo={titulo}
      onAbrir={onAbrir}
      onSoltar={onSoltar}
    />
  );
}
