/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EVE_CLIENT_ID?: string;
  readonly VITE_TOKEN_PROXY?: string;
  /** Where the cloud Worker lives; defaults to the deployed one. */
  readonly VITE_CLOUD_URL?: string;
  /** Local testing only, against `wrangler dev --var DEV_AUTH_CHAR:<id>`: stands in for an EVE login. */
  readonly VITE_CLOUD_DEV_TOKEN?: string;
  readonly VITE_CLOUD_DEV_CHAR?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
