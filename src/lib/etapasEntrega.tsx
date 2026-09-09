// ─────────────────────────────────────────────────────────────────────────────
//  A marca e a cor de cada etapa de entrega.
//
//  Moravam na tela de Projetos e saíram de lá quando a seção de reuniões virou
//  peça compartilhada: o chip da entrega usa as duas, e importá-las da tela
//  fecharia um ciclo entre a tela e o componente que ela mesma usa.
// ─────────────────────────────────────────────────────────────────────────────
import {
  IconMarcoAndamento, IconMarcoBloqueado, IconMarcoCancelado, IconMarcoConcluido,
  IconMarcoPlanejado, IconMarcoTriagem, IconMarcoValidado,
} from '../components/icons';

/** Um certo para entregue, dois para validada: a leitura de mensageiro, que
 *  todo mundo já conhece. */
export const ICONE_ENTREGA: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Triagem': IconMarcoTriagem,
  'Planejada': IconMarcoPlanejado,
  'Em andamento': IconMarcoAndamento,
  'Bloqueada': IconMarcoBloqueado,
  'Entregue': IconMarcoConcluido,
  'Validada': IconMarcoValidado,
  'Cancelada': IconMarcoCancelado,
};

// Na ordem do fluxo, como a lista de etapas. Os dois vermelhos do fim são de
// propósito: bloqueada e cancelada são as duas paradas, e é isso que a cor tem
// de dizer de longe. O tom mais fechado separa a que acabou da que ainda pode
// voltar a andar - e, para quem não distingue os dois, o desenho do marco
// continua sendo a diferença.
export const COR_ENTREGA: Record<string, string> = {
  'Triagem': '#D9730D',
  'Planejada': '#6E6F69',
  'Em andamento': '#B58300',
  'Bloqueada': '#D93025',
  'Entregue': '#7C3AED',
  'Validada': '#23A455',
  'Cancelada': '#B42318',
};
