// ─────────────────────────────────────────────────────────────────────────────
//  Esqueleto de carregamento.
//
//  Padrão da casa no lugar do giro: o esqueleto ocupa o formato do conteúdo que
//  está vindo, então a página não salta quando os dados chegam e quem olha já
//  entende o que vai aparecer ali. O brilho vem do CSS (`.skeleton`), com um
//  bloco de movimento reduzido que o desliga.
// ─────────────────────────────────────────────────────────────────────────────

/** Bloco cru. Serve para montar formatos que os prontos abaixo não cobrem. */
export function Skeleton({ w = '100%', h = 12, radius }: {
  w?: number | string;
  h?: number | string;
  radius?: string;
}) {
  return <span className="skeleton" style={{ display: 'block', width: w, height: h, borderRadius: radius }} />;
}

/** Largura variável entre as linhas: bloco de larguras idênticas parece uma
 *  grade quebrada, não texto carregando. */
const LARGURAS = ['92%', '78%', '85%', '70%', '88%', '74%'];

/** Linhas de uma tabela. `colunas` são as frações de largura de cada célula. */
export function SkeletonTabela({ linhas = 6, colunas = [3, 2, 1, 2, 1, 1] }: {
  linhas?: number;
  colunas?: number[];
}) {
  const total = colunas.reduce((a, b) => a + b, 0);
  return (
    <div className="admin-table-wrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando</span>
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '15px 16px',
          borderBottom: i === linhas - 1 ? 'none' : '1px solid var(--gray3)',
        }}>
          {colunas.map((peso, c) => (
            <span key={c} style={{ flex: `${peso} 1 0`, minWidth: 0 }}>
              <Skeleton h={11} w={c === 0 ? LARGURAS[i % LARGURAS.length] : '70%'} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Cartões em grade, para as telas que mostram quadro em vez de tabela. */
export function SkeletonCards({ cards = 6, altura = 108 }: { cards?: number; altura?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12,
    }}>
      <span className="sr-only">Carregando</span>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} style={{
          border: '1px solid var(--gray3)', borderRadius: 'var(--radius-md)',
          padding: 14, display: 'flex', flexDirection: 'column', gap: 10, height: altura,
        }}>
          <Skeleton h={12} w={LARGURAS[i % LARGURAS.length]} />
          <Skeleton h={10} w="55%" />
          <span style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Skeleton h={20} w={20} radius="50%" />
            <Skeleton h={10} w="40%" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Página inteira, enquanto o código dela ainda está sendo baixado. É o que
 *  aparece na troca de página, antes de a tela saber o que vai desenhar. */
export function SkeletonPagina() {
  return (
    <div className="admin-content-wrap" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando a página</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton h={22} w={220} />
        <Skeleton h={12} w={300} />
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '20px 0 16px' }}>
        {[76, 84, 80, 68].map((w, i) => <Skeleton key={i} h={32} w={w} radius="var(--radius-md)" />)}
      </div>
      <SkeletonTabela />
    </div>
  );
}
