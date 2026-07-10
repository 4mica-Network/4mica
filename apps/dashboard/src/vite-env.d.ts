/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_4MICA_MODE?: "sandbox" | "live";
  readonly VITE_4MICA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
