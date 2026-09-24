/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVE_CLIENT_ID?: string;
  readonly VITE_TOKEN_PROXY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
