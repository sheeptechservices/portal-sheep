import { useEffect, useRef, useState } from 'react';

/**
 * O numero que conta ate o valor, em vez de aparecer pronto.
 *
 * Ao montar, sobe do zero; quando o valor muda depois, anda do antigo ao novo.
 * Aceita numero ou texto com numero dentro - `44%`, `R$ 447 mil`, `1.248` -: so
 * o primeiro numero do texto anda, e o resto (moeda, unidade, sufixo) fica
 * parado em volta dele, com as mesmas casas decimais e o mesmo separador de
 * milhar do original. Texto sem numero passa direto.
 *
 * Com movimento reduzido, o valor aparece pronto.
 */
const DURACAO = 900;
/** Comeca rapido e assenta devagar: o olho ve o numero chegando, nao correndo. */
const assentar = (t: number) => 1 - Math.pow(1 - t, 4);
const NUMERO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/;

function decompor(valor: string | number) {
  const texto = typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor;
  const m = texto.match(NUMERO);
  if (!m || m.index == null) return null;
  const bruto = m[0];
  const casas = bruto.includes(',') ? bruto.split(',')[1].length : 0;
  return {
    antes: texto.slice(0, m.index),
    depois: texto.slice(m.index + bruto.length),
    alvo: Number(bruto.replace(/\./g, '').replace(',', '.')),
    casas,
    // "2026" sem ponto fica sem ponto; "1.248" continua com.
    agrupar: bruto.includes('.') || Number(bruto.replace(/\./g, '').replace(',', '.')) < 1000,
  };
}

export function ContaAnimada({ valor }: { valor: string | number }) {
  const partes = decompor(valor);
  const [atual, setAtual] = useState(0);
  // O valor que esta na tela agora, e nao o ultimo pedido: a conta seguinte
  // parte dele. Guardar o alvo aqui falhava no modo estrito do React, que roda
  // o efeito duas vezes - na segunda o "anterior" ja era o alvo, e o numero
  // aparecia pronto, sem contar.
  const naTela = useRef(0);

  useEffect(() => {
    if (!partes) return;
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const de = naTela.current;
    const ate = partes.alvo;
    if (calmo || de === ate) { naTela.current = ate; setAtual(ate); return; }
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      // O carimbo do quadro pode vir de antes do `inicio`: sem o piso em zero,
      // o primeiro quadro dava um numero negativo.
      const t = Math.max(0, Math.min(1, (agora - inicio) / DURACAO));
      naTela.current = de + (ate - de) * assentar(t);
      setAtual(naTela.current);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [partes?.alvo]);

  if (!partes) return <>{valor}</>;
  const numero = atual.toLocaleString('pt-BR', {
    minimumFractionDigits: partes.casas,
    maximumFractionDigits: partes.casas,
    useGrouping: partes.agrupar,
  });
  return (
    <span className="conta-animada">
      {partes.antes}{numero}{partes.depois}
    </span>
  );
}
