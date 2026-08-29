/// <reference types="vite/client" />

// Variáveis de ambiente expostas ao navegador. Só entram aqui coisas públicas:
// tudo com prefixo VITE_ vai embutido no bundle, à vista de qualquer um.
interface ImportMetaEnv {
  /** Client ID OAuth do "Entrar com o Google". Vazio desliga o botão. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
