// ─────────────────────────────────────────────────────────────────────────────
//  Painel lateral.
//
//  A gaveta que abre pela direita, com a borda esquerda arrastável e o modo
//  tela cheia. Usada pelo painel de projeto e pelo card de tarefa - o mesmo
//  gesto, o mesmo desenho e a mesma memória de largura.
//
//  Mora na lib, e não numa das telas, porque o formulário de tarefa é
//  compartilhado: importá-lo de ProjetosPage fecharia um ciclo de módulos.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import type React from 'react';

/** O mínimo é a largura que o painel sempre teve; o máximo evita que ele engula
 *  a listagem atrás, que é a referência de onde a pessoa está. */
export const PAINEL_MIN = 560;
export const PAINEL_MAX = 1100;

/** Cada painel guarda a própria largura: alargar o de projeto não devia mexer
 *  no de tarefa. O de projeto fica com a chave antiga, sem sufixo, para quem já
 *  ajustou a dele não perder o ajuste. */
const chaveDaLargura = (nome: string) =>
  nome === 'projeto' ? 'portal-sheep:largura-painel' : `portal-sheep:largura-painel:${nome}`;

function larguraGuardada(chave: string): number {
  try {
    const n = Number(localStorage.getItem(chave));
    return Number.isFinite(n) && n >= PAINEL_MIN ? Math.min(n, PAINEL_MAX) : PAINEL_MIN;
  } catch {
    // Navegador com armazenamento bloqueado: vale o padrão.
    return PAINEL_MIN;
  }
}

/** Largura do painel, ajustável arrastando a borda esquerda. Fica guardada no
 *  navegador: quem alargou uma vez não quer refazer isso a cada abertura. */
export function useLarguraPainel(nome: string) {
  const chaveLargura = chaveDaLargura(nome);
  const [largura, setLargura] = useState(() => larguraGuardada(chaveLargura));
  const [arrastando, setArrastando] = useState(false);
  useEffect(() => {
    if (!arrastando) return;

    // O painel é ancorado à direita, então a largura é o que sobra da borda
    // direita da janela até o ponteiro.
    const mover = (e: MouseEvent) =>
      setLargura(Math.round(Math.min(
        Math.max(window.innerWidth - e.clientX, PAINEL_MIN),
        Math.min(PAINEL_MAX, window.innerWidth - 40),
      )));

    const soltar = () => setArrastando(false);
    document.body.classList.add('arrastando-painel');
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => {
      document.body.classList.remove('arrastando-painel');
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    };
  }, [arrastando]);

  // Guarda ao largar, e não a cada pixel: escrever no armazenamento a cada
  // quadro do arrasto é trabalho jogado fora.
  useEffect(() => {
    if (arrastando) return;
    try { localStorage.setItem(chaveLargura, String(largura)); } catch { /* sem armazenamento */ }
  }, [arrastando, chaveLargura, largura]);

  /** Teclado também ajusta: seta move 40px, e o painel não pode depender do
   *  arrasto para ser usável. */
  const porTecla = (e: React.KeyboardEvent) => {
    const passo = e.key === 'ArrowLeft' ? 40 : e.key === 'ArrowRight' ? -40 : 0;
    if (!passo) return;
    e.preventDefault();
    setLargura(l => Math.min(Math.max(l + passo, PAINEL_MIN), PAINEL_MAX));
  };

  return { largura, arrastando, setArrastando, porTecla };
}
