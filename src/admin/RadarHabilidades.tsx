// ─────────────────────────────────────────────────────────────────────────────
//  As habilidades declaradas, por área, no mesmo desenho da avaliação da casa.
//
//  Os eixos são as oito áreas de `lib/habilidades`, sempre as mesmas e sempre na
//  mesma posição: é isso que faz duas fichas se compararem pelo formato. Área
//  sem nada declarado fica no centro, e a ausência conta tanto quanto a
//  presença.
//
//  O valor do eixo é o MAIOR nível declarado na área, e não a média. Média
//  castiga quem declara muita coisa: quem tem React 5 sozinho ficaria acima de
//  quem tem React 5, Angular 4 e Next 5. O eixo responde "até onde esta pessoa
//  foi nesta área"; quantas habilidades ela tem ali, a lista embaixo diz.
//
//  A lista embaixo mostra as oito áreas, sempre - inclusive as vazias, como a
//  régua da avaliação da casa mostra a competência que ninguém avaliou ainda.
//  Área vazia com barra no chão diz "aqui não há nada declarado", que é uma
//  resposta; área que some da lista faria a pessoa se perguntar se a área
//  existe.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Radar, type Habilidade } from './TalentoVisaoGeral';
import { FAMILIAS, OUTRAS, familiaDe } from '../lib/habilidades';

/** O topo da escala que a pessoa usou para se avaliar. */
const MAX = 5;

export function RadarHabilidades({ habilidades }: { habilidades: Habilidade[] }) {
  /** A área sob o ponteiro - o radar e a lista acendem juntos. */
  const [foco, setFoco] = useState<number | null>(null);

  const { eixos, notas, grupos } = useMemo(() => {
    const porArea = new Map<string, Habilidade[]>();
    for (const h of habilidades) {
      const chave = familiaDe(h.nome).chave;
      porArea.set(chave, [...(porArea.get(chave) ?? []), h]);
    }
    // O id do eixo é a posição na lista de áreas: fixo, e o mesmo em toda ficha.
    const eixos = FAMILIAS.map((f, i) => ({ id: i + 1, nome: f.curto, familia: f }));
    const notas = new Map(
      eixos.map(e => [
        e.id,
        Math.max(0, ...(porArea.get(e.familia.chave) ?? []).map(h => h.nivel ?? 0)),
      ]),
    );
    // Na lista, as oito áreas na ordem do mostrador - a mesma volta que o radar
    // dá, para o olho ir de um ao outro sem procurar. O que não casou com área
    // nenhuma entra no fim, e só quando existe.
    const grupos = FAMILIAS.map((f, i) => ({
      familia: f,
      id: i + 1,
      itens: (porArea.get(f.chave) ?? []).sort((a, b) => (b.nivel ?? 0) - (a.nivel ?? 0)),
    }));
    const soltas = porArea.get(OUTRAS.chave) ?? [];
    if (soltas.length) grupos.push({ familia: OUTRAS, id: 0, itens: soltas });
    return { eixos, notas, grupos };
  }, [habilidades]);

  return (
    <div className="habilidades">
      <Radar
        competencias={eixos.map(e => ({ id: e.id, nome: e.nome }))}
        notas={notas}
        max={MAX}
        tom="declarado"
        foco={foco}
        onFoco={setFoco}
      />

      {/* Mesma régua da avaliação da casa: nome, valor e barra. Aqui o valor é
          o pico da área, e as habilidades que o sustentam ficam logo abaixo. */}
      <ul className="talentos-lista-notas habilidades-areas">
        {grupos.map(g => {
          const pico = Math.max(0, ...g.itens.map(h => h.nivel ?? 0));
          return (
            <li
              key={g.familia.chave}
              className={`talentos-nota-linha${foco === g.id ? ' aceso' : ''}${g.itens.length ? '' : ' vazia'}`}
              onMouseEnter={() => setFoco(g.id)}
              onMouseLeave={() => setFoco(null)}
            >
              <div className="talentos-nota-topo">
                <span className="talentos-nota-nome">{g.familia.label}</span>
                <strong className="talentos-nota-valor">
                  {g.itens.length ? `${pico}/${MAX}` : '-'}
                </strong>
              </div>
              <span className="talentos-media-trilho">
                <span className="talentos-media-tinta" style={{ width: `${(pico / MAX) * 100}%` }} />
              </span>
              {g.itens.length > 0 && (
                <ul className="habilidades-itens">
                  {g.itens.map(h => (
                    <li key={h.nome}>
                      <span className="habilidades-item-nome">{h.nome}</span>
                      {h.tempo && <span className="habilidades-tempo">{h.tempo}</span>}
                      <span className="habilidades-nivel">{h.nivel != null ? `${h.nivel}/${MAX}` : '-'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
