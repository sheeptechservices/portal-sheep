// ─────────────────────────────────────────────────────────────────────────────
//  Biblioteca do "Entrar com o Google" (GIS), compartilhada entre a tela de
//  entrada e o Perfil.
//
//  São dois fluxos diferentes, de propósito:
//
//  - `accounts.id` (ID token) é a ENTRADA. Devolve um JWT assinado com a
//    identidade e mais nada. Conta já autorizada entra na hora: o Google não
//    tem autorização nova para confirmar, então não aparece a tela de
//    "Você está fazendo login novamente em Portal DUX".
//
//  - `accounts.oauth2` (código de autorização) é a FOTO, no Perfil. Esse fluxo
//    entrega ao servidor um access token do escopo `profile`, que é o que a
//    People API exige - o Workspace daqui não manda a claim `picture` no ID
//    token. Em troca, o Google sempre mostra a tela de confirmação, porque cada
//    código é uma autorização nova. É por isso que ele saiu do login e virou
//    uma ação pontual: uma confirmação na vida, e não uma por dia.
//
//  O client_id é público por natureza (vai no HTML de qualquer app OAuth); quem
//  autentica de fato é o backend, que confere a assinatura do ID token, a
//  audiência e o domínio do e-mail.
// ─────────────────────────────────────────────────────────────────────────────

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
/** Só para o texto da tela; quem barra o domínio de verdade é o servidor. */
export const GOOGLE_DOMINIO = (import.meta.env.VITE_GOOGLE_ALLOWED_DOMAIN as string | undefined) ?? 'sheeptechnology.com';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleGis {
  accounts: {
    /** Entrada: ID token puro, sem tela de consentimento para quem já autorizou. */
    id: {
      initialize(cfg: {
        client_id: string;
        callback: (r: { credential?: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        use_fedcm_for_prompt?: boolean;
        /** Pré-seleciona contas do Workspace; o servidor é quem barra de fato. */
        hd?: string;
      }): void;
      /** Desenha o botão oficial dentro do elemento. */
      renderButton(el: HTMLElement, cfg: {
        type?: 'standard' | 'icon';
        theme?: 'outline' | 'filled_blue' | 'filled_black';
        size?: 'small' | 'medium' | 'large';
        text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
        shape?: 'rectangular' | 'pill' | 'circle' | 'square';
        logo_alignment?: 'left' | 'center';
        width?: number;
        locale?: string;
      }): void;
      /** Esquece a conta escolhida, para a saída não ser desfeita sozinha. */
      disableAutoSelect(): void;
    };
    /** Entrada e foto do perfil: código de autorização, trocado por access token
     *  no servidor. É o único fluxo que devolve access token, e sem ele a People
     *  API não entrega a foto. */
    oauth2: {
      initCodeClient(cfg: {
        client_id: string;
        scope: string;
        ux_mode?: 'popup' | 'redirect';
        /** `''` pede confirmação só quando ela é necessária - na prática, no
         *  primeiro acesso. O padrão do Google (`select_account consent`)
         *  reapresentaria a tela a cada entrada. */
        prompt?: '' | 'none' | 'consent' | 'select_account';
        callback: (r: { code?: string; error?: string }) => void;
        error_callback?: (e: { type?: string }) => void;
      }): { requestCode(): void };
    };
  };
}

declare global {
  interface Window { google?: GoogleGis }
}

/** Carrega o script do Google uma vez só, mesmo com o StrictMode montando duas vezes. */
let gisPromessa: Promise<void> | null = null;
export function carregarGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromessa) return gisPromessa;
  gisPromessa = new Promise<void>((ok, falha) => {
    const existente = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const el = existente ?? Object.assign(document.createElement('script'), { src: GIS_SRC, async: true, defer: true });
    el.addEventListener('load', () => ok());
    el.addEventListener('error', () => { gisPromessa = null; falha(new Error('script do Google não carregou')); });
    if (!existente) document.head.appendChild(el);
  });
  return gisPromessa;
}
