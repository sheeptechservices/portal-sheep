import { useEffect, useState } from 'react';

/**
 * Abre e fecha um bloco com altura, mesmo quando o conteúdo dele não pode ficar
 * montado o tempo todo.
 *
 * O `.revelar` sozinho pede conteúdo montado antes da abertura - é dele que a
 * animação tira a altura de destino. Isso vale para o que é barato manter na
 * árvore, mas não para um formulário inteiro que só existe enquanto está aberto
 * e guarda rascunho próprio.
 *
 * Aqui o conteúdo entra um quadro antes da classe: montado no primeiro quadro,
 * aberto no seguinte, a animação tem de onde sair. Na saída é o contrário - a
 * classe cai primeiro e o conteúdo fica mais um instante, senão o React o
 * desmonta e não há o que animar.
 *
 * ```tsx
 * const editor = useRevelar(abrindo);
 * {editor.montado && (
 *   <div className={`revelar${editor.aberto ? ' aberto' : ''}`}>
 *     <div><Formulario /></div>
 *   </div>
 * )}
 * ```
 */
export function useRevelar(mostrar: boolean, ms = 200) {
  const [montado, setMontado] = useState(mostrar);
  const [aberto, setAberto] = useState(mostrar);

  useEffect(() => {
    if (mostrar) {
      setMontado(true);
      // Dois quadros: um para o conteúdo existir, outro para o navegador ter o
      // que interpolar. Com um só, o estilo final já valeria na primeira pintura
      // e o bloco apareceria inteiro de uma vez.
      let dentro = 0;
      const fora = requestAnimationFrame(() => {
        dentro = requestAnimationFrame(() => setAberto(true));
      });
      return () => { cancelAnimationFrame(fora); if (dentro) cancelAnimationFrame(dentro); };
    }
    setAberto(false);
    const t = setTimeout(() => setMontado(false), ms);
    return () => clearTimeout(t);
  }, [mostrar, ms]);

  return { montado, aberto };
}
