import {initApp, webAppUrl} from '@ardhiflow/desktop-main';
import {fileURLToPath} from 'node:url';

if (process.env.NODE_ENV === 'development' || process.env.PLAYWRIGHT_TEST === 'true' || !!process.env.CI) {
  function showAndExit(...args) {
    console.error(...args);
    process.exit(1);
  }

  process.on('uncaughtException', showAndExit);
  process.on('unhandledRejection', showAndExit);
}

// noinspection JSIgnoredPromiseFromCall
/**
 * The renderer is the ArdhiFlow web app, loaded by URL rather than from a
 * bundled package: the SPA calls `/api/*` on its own origin and Clerk needs a
 * real http(s) origin, neither of which works from `file://`.
 * In development that is the web app's Vite dev server (see dev-mode.js);
 * in a packaged build it is the deployed URL baked in at build time.
 */
initApp(
  {
    renderer: new URL(
      process.env.MODE === 'development' && process.env.VITE_DEV_SERVER_URL
        ? process.env.VITE_DEV_SERVER_URL
        : webAppUrl,
    ),

    preload: {
      path: fileURLToPath(import.meta.resolve('@ardhiflow/desktop-preload/exposed.mjs')),
    },
  },
);
