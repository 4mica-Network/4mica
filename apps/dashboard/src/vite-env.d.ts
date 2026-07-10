/// <reference types="vite/client" />

/** Injected by Vite from package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_4MICA_MODE?: "sandbox" | "live";
  readonly VITE_4MICA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
