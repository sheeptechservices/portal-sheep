// ─────────────────────────────────────────────────────────────────────────────
//  A logo de um cliente, pelo nome, no tamanho de chip.
//
//  A logo sai de `lib/marcas`, a fonte única das marcas da casa. Logo de uma
//  cor só vira máscara pintada na cor da marca (e no tom próprio do tema
//  escuro); a desenhada em branco é escurecida para aparecer sobre o claro.
//  Sem logo cadastrada para o nome, não sai nada: quem usa já mostra o nome ao
//  lado.
//
//  Serve à divisória da Planning e ao quadro de objetivos do cabeçalho.
// ─────────────────────────────────────────────────────────────────────────────
import { logoDoCliente } from '../lib/marcas';

export function LogoDoCliente({ cliente, altura = 16, larguraMaxima = 46 }: {
  cliente: string;
  altura?: number;
  larguraMaxima?: number;
}) {
  const marca = logoDoCliente(cliente);
  if (!marca) return null;
  if (marca.cor && marca.proporcao) {
    return (
      <span className="marca-tingida" role="img" aria-label={cliente}
        style={{
          height: altura,
          width: Math.min(larguraMaxima, Math.round(altura * marca.proporcao)),
          ['--marca' as string]: `url(${marca.src})`,
          ['--marca-cor' as string]: marca.cor,
          ['--marca-cor-escura' as string]: marca.corEscura,
        }} />
    );
  }
  return (
    <img className="pl-aba-logo" src={marca.src} alt={cliente}
      data-escurecer={marca.escurecer ? '' : undefined}
      style={{ height: altura, maxWidth: larguraMaxima }} />
  );
}
