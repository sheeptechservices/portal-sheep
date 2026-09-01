// ─────────────────────────────────────────────────────────────────────────────
//  Rosca.
//
//  Um anel de composição, para quando a pergunta é "de que isto é feito" e não
//  "quanto deu". O buraco do meio não é enfeite: é onde mora o total, que numa
//  pizza cheia teria de virar mais um rótulo solto.
//
//  Desenhada com `stroke-dasharray` num círculo só por fatia, e não com
//  caminhos calculados: o arco fica exato sem trigonometria, e a espessura, o
//  arredondamento das pontas e o realce do hover saem de graça do traço.
// ─────────────────────────────────────────────────────────────────────────────
import { useId, useState, type CSSProperties } from 'react';

export interface FatiaDonut {
  chave: string;
  rotulo: string;
  valor: number;
  cor: string;
}

/** Raio e circunferência do anel dentro do `viewBox` de 100. O traço cresce
 *  para os dois lados do raio, então ele precisa caber na sobra até a borda. */
const RAIO = 38;
const VOLTA = 2 * Math.PI * RAIO;

export function Donut({ fatias, unidade = 'itens', vazio, tamanho = 132, esticar, onEscolher }: {
  fatias: FatiaDonut[];
  /** Palavra do total no centro, no plural. */
  unidade?: string;
  /** Texto de quando não há nada a mostrar. */
  vazio?: string;
  tamanho?: number;
  /** Ocupa a faixa inteira, com a legenda em colunas no espaço que sobra. Para
   *  quando o anel divide a linha com nada - encolhido à esquerda, ele deixa
   *  metade do bloco vazia. */
  esticar?: boolean;
  /** Torna as fatias clicáveis. Sem isto elas continuam realçando no hover, mas
   *  não prometem um clique que não leva a lugar nenhum. */
  onEscolher?: (chave: string) => void;
}) {
  const id = useId();
  const [ativa, setAtiva] = useState<string | null>(null);
  const [dica, setDica] = useState<{ x: number; y: number } | null>(null);

  const usadas = fatias.filter(f => f.valor > 0);
  const total = usadas.reduce((s, f) => s + f.valor, 0);

  if (total === 0) {
    return (
      <div className="donut-vazio" style={{ minHeight: tamanho }}>
        <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} aria-hidden="true">
          <circle cx="50" cy="50" r={RAIO} fill="none" stroke="var(--gray3)" strokeWidth="14" />
        </svg>
        <p>{vazio ?? `Nenhum ${unidade} no período.`}</p>
      </div>
    );
  }

  // Cada fatia é um arco: o comprimento sai da fração, e o deslocamento
  // acumula o que veio antes. O -90 no giro põe o começo no topo.
  let percorrido = 0;
  const arcos = usadas.map(f => {
    const fracao = f.valor / total;
    const arco = { ...f, fracao, comprimento: fracao * VOLTA, deslocamento: -percorrido * VOLTA };
    percorrido += fracao;
    return arco;
  });

  const emFoco = arcos.find(a => a.chave === ativa);

  return (
    <div
      className={`donut${esticar ? ' donut-largo' : ''}`}
      onMouseLeave={() => { setAtiva(null); setDica(null); }}
      onMouseMove={e => {
        const r = e.currentTarget.getBoundingClientRect();
        setDica({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
    >
      <div className="donut-anel" style={{ width: tamanho, height: tamanho }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%" role="img"
          aria-label={`Composição: ${usadas.map(f => `${f.valor} ${f.rotulo}`).join(', ')}`}>
          <circle cx="50" cy="50" r={RAIO} fill="none" stroke="var(--gray4)" strokeWidth="14" />
          {arcos.map(a => {
            const destacada = ativa === a.chave;
            return (
              <circle
                key={a.chave}
                cx="50" cy="50" r={RAIO}
                fill="none"
                stroke={a.cor}
                strokeWidth={destacada ? 17 : 14}
                strokeDasharray={`${a.comprimento} ${VOLTA - a.comprimento}`}
                strokeDashoffset={a.deslocamento}
                // Ponta reta: arredondada, a fatia invade a vizinha e a soma
                // deixa de bater com o desenho.
                strokeLinecap="butt"
                transform="rotate(-90 50 50)"
                opacity={ativa && !destacada ? 0.35 : 1}
                style={{ cursor: onEscolher ? 'pointer' : 'default' }}
                onMouseEnter={() => setAtiva(a.chave)}
                onClick={() => onEscolher?.(a.chave)}
              />
            );
          })}
        </svg>

        <div className="donut-centro" aria-hidden="true">
          <strong>{emFoco ? emFoco.valor : total}</strong>
          <span>{emFoco ? emFoco.rotulo : unidade}</span>
        </div>
      </div>

      <ul className="donut-legenda">
        {usadas.map(f => (
          <li key={f.chave}>
            <button
              type="button"
              className={`donut-legenda-item${ativa === f.chave ? ' ativa' : ''}`}
              onMouseEnter={() => setAtiva(f.chave)}
              onFocus={() => setAtiva(f.chave)}
              onBlur={() => setAtiva(null)}
              onClick={() => onEscolher?.(f.chave)}
              style={{ cursor: onEscolher ? 'pointer' : 'default' }}
            >
              <span className="donut-ponto" style={{ background: f.cor }} />
              <span className="donut-legenda-rotulo">{f.rotulo}</span>
              <span className="donut-legenda-valor">{f.valor}</span>
            </button>
          </li>
        ))}
      </ul>

      {emFoco && dica && (
        <span
          className="donut-dica"
          role="tooltip"
          id={id}
          style={{ left: dica.x, top: dica.y } as CSSProperties}
        >
          <span className="donut-ponto" style={{ background: emFoco.cor }} />
          {emFoco.rotulo}: <strong>{emFoco.valor}</strong>
          <span className="donut-dica-pct">{Math.round(emFoco.fracao * 100)}%</span>
        </span>
      )}
    </div>
  );
}
