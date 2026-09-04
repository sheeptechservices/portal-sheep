// Símbolo (sol) da marca DEPS, recriado em SVG - coral #EE5B45. Centro vazado.
// Compartilhado entre o painel de análise (Oportunidades) e o card de integração
// (Configurações), para os dois não saírem do padrão da marca.
export function DepsMark({ size = 15, color = '#EE5B45' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <polygon key={i} transform={`rotate(${(360 / 24) * i})`}
          points="-1.4,-19 1.4,-19 2.9,-47 -2.9,-47" fill={color} />
      ))}
    </svg>
  );
}
