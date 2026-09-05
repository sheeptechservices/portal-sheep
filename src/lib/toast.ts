// ─────────────────────────────────────────────────────────────────────────────
//  O canal de confirmação do sistema: o balão que aparece no canto e some.
//
//  Mora aqui, e não dentro do `AdminApp`, porque quem avisa não é só página: a
//  fila de chamados é um componente de `src/components`, e o `AdminApp` já
//  importa esse caminho - pedir o gancho de volta a ele fecharia um ciclo entre
//  os dois arquivos. Num módulo à parte não há ciclo nenhum, e qualquer peça
//  pode confirmar o que acabou de fazer.
//
//  O `AdminApp` continua sendo quem monta o provedor e desenha os balões; daqui
//  saem só o contrato e o gancho.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

export interface ToastCtx {
  toast: (type: ToastItem['type'], title: string, message?: string) => void;
}

/** O padrão não faz nada: componente montado fora do provedor - numa bancada,
 *  num teste - continua funcionando, só não avisa ninguém. */
export const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() { return useContext(ToastContext); }
