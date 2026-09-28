// ─────────────────────────────────────────────────────────────────────────────
//  A equipe com que todo projeto novo nasce.
//
//  Os mesmos três papéis se repetem em todo projeto da casa, e digitá-los de
//  novo a cada cadastro é trabalho que a tela pode poupar. É um ponto de
//  partida, não uma regra: a seção de Equipe continua aberta para trocar a
//  pessoa ou o papel antes de gravar.
//
//  Por e-mail, e não por id: id é do banco e muda de ambiente para ambiente;
//  e-mail é como essas pessoas são chamadas aqui dentro. Quem não estiver
//  cadastrado, ou estiver inativo, simplesmente não entra - a lista é um
//  atalho, e não uma promessa de que aquelas três contas existem.
// ─────────────────────────────────────────────────────────────────────────────
import type { PapelEquipe } from './papeisDeEquipe';

export const EQUIPE_DE_PARTIDA: { email: string; papel: PapelEquipe }[] = [
  { email: 'thales.carneiro@sheeptechnology.com.br', papel: 'Comercial' },
  { email: 'guilherme.zaidan@sheeptechnology.com.br', papel: 'Gestor' },
  { email: 'rafaelbreder@gmail.com', papel: 'QA' },
];

export interface MembroDePartida { usuario_id: string; papel: string }

/**
 * A equipe do projeto novo: os três de sempre, mais quem está criando.
 *
 * Quem criou entra quando não é nenhum dos três, porque membro fora da equipe
 * não enxerga o projeto - sem isso, a pessoa fecharia o painel e perderia de
 * vista o que acabou de cadastrar. Ela entra como Gestor só quando a lista não
 * trouxe um: dois gestores no mesmo projeto é a mesma pergunta respondida duas
 * vezes.
 */
export function equipeDePartida(
  pessoas: { id: string; email: string }[],
  usuarioId?: string,
): MembroDePartida[] {
  const porEmail = new Map(pessoas.map(p => [p.email.trim().toLowerCase(), p]));
  const equipe: MembroDePartida[] = [];
  for (const { email, papel } of EQUIPE_DE_PARTIDA) {
    const pessoa = porEmail.get(email);
    if (pessoa && !equipe.some(m => m.usuario_id === pessoa.id)) {
      equipe.push({ usuario_id: pessoa.id, papel });
    }
  }
  if (usuarioId && !equipe.some(m => m.usuario_id === usuarioId)) {
    equipe.push({
      usuario_id: usuarioId,
      papel: equipe.some(m => m.papel === 'Gestor') ? 'Dev' : 'Gestor',
    });
  }
  return equipe;
}
