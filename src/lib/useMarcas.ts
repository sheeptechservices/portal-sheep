// As marcas para desenhar: as da casa e as gravadas pelo portal, com uma nova
// pintura quando as gravadas chegam. Fica fora de `marcas.ts` porque aquele
// arquivo também roda no servidor, que não tem React.
import { useEffect, useState } from 'react';
import { carregarMarcasGravadas, ouvirMarcas, todasAsMarcas, type Marca } from './marcas';

export function useMarcas(): Marca[] {
  const [marcas, setMarcas] = useState<Marca[]>(todasAsMarcas);
  useEffect(() => {
    const atualizar = () => setMarcas(todasAsMarcas());
    const parar = ouvirMarcas(atualizar);
    // Se chegaram entre a primeira pintura e este efeito, já entram agora.
    void carregarMarcasGravadas().then(atualizar);
    return parar;
  }, []);
  return marcas;
}
