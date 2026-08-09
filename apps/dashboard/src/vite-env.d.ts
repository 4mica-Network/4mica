/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Injected by the Redux DevTools extension. Only read in development. */
  __REDUX_DEVTOOLS_EXTENSION_COMPOSE__?: typeof import("redux").compose;
}
