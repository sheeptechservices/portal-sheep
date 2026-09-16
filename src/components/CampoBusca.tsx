// ─────────────────────────────────────────────────────────────────────────────
//  O campo de busca da casa.
//
//  Cada tela tinha o seu: a lupa dentro do campo aqui, ao lado ali, com altura,
//  raio e cor escolhidos de novo a cada vez. É sempre a mesma peça - lupa,
//  campo e um X para desistir -, e é esta.
//
//  O material é o cristal das superfícies da casa: o mesmo fio de luz no alto e
//  a mesma borda leve do topo e dos painéis, para o campo pousar sobre a página
//  em vez de recortar um buraco branco nela.
// ─────────────────────────────────────────────────────────────────────────────
import { IconSearch, IconX } from './icons';

export function CampoBusca({ valor, onMudar, placeholder, rotulo, largura, className }: {
  valor: string;
  onMudar: (v: string) => void;
  /** O que se procura ali, em palavras de quem usa: "Buscar por título,
   *  descritivo ou entrega". Vira o rótulo do leitor de tela quando não há
   *  `rotulo` próprio. */
  placeholder: string;
  rotulo?: string;
  /** Largura de repouso. O campo cede quando a barra aperta. */
  largura?: number;
  className?: string;
}) {
  return (
    <label className={`campo-busca${className ? ` ${className}` : ''}`}
      style={largura ? { flexBasis: largura } : undefined}>
      <IconSearch size={13} />
      <input
        className="campo-busca-campo"
        value={valor}
        placeholder={placeholder}
        aria-label={rotulo ?? placeholder}
        onChange={e => onMudar(e.target.value)}
        // Escape limpa o que foi digitado, e não fecha nada: é o gesto de
        // desistir da busca sem tirar a mão do teclado.
        onKeyDown={e => { if (e.key === 'Escape' && valor) { e.preventDefault(); onMudar(''); } }}
      />
      {valor && (
        <button type="button" className="campo-busca-limpar" title="Limpar a busca"
          aria-label="Limpar a busca" onClick={() => onMudar('')}>
          <IconX size={11} />
        </button>
      )}
    </label>
  );
}
