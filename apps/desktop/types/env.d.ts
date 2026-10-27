/// <reference types="vite/client" />

/**
 * Describes all existing environment variables and their types.
 * Required for Code completion/intellisense and type checking.
 *
 * Note: To prevent accidentally leaking env variables to the client, only variables prefixed with `VITE_` are exposed to your Vite-processed code.
 *
 * @see https://github.com/vitejs/vite/blob/0a699856b248116632c1ac18515c0a5c7cf3d1db/packages/vite/types/importMeta.d.ts#L7-L14 Base Interface.
 * @see https://vitejs.dev/guide/env-and-mode.html#env-files Vite Env Variables Doc.
 */
interface ImportMetaEnv {
  /**
   * URL where `renderer` web page is running.
   * This variable is initialized in scripts/watch.ts
   */
  readonly VITE_DEV_SERVER_URL: undefined | string;

  /** Current app version */
  readonly VITE_APP_VERSION: string;

  /** Deployed web app URL the packaged window loads. Required by `compile`. */
  readonly VITE_WEB_APP_URL: undefined | string;

  /** Comma-separated extra origins the window may navigate to. */
  readonly VITE_EXTRA_ALLOWED_ORIGINS: undefined | string;

  /** Auto-update channel (used by AutoUpdater). */
  readonly VITE_DISTRIBUTION_CHANNEL: undefined | string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
