import {build} from 'vite';
import path from 'path';

/**
 * Runs the desktop shell in development mode against the web app's dev server.
 * Start the web app first (`pnpm dev:web`), then run this (`pnpm dev:desktop`).
 */


/**
 * 1. We create a few flags to let everyone know that we are in development mode.
 */
const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;


/**
 * 2. Point the window at the web app's dev server. There is no renderer
 * package to serve: the renderer is apps/web, which runs its own dev server.
 * Override with ARDHIFLOW_WEB_DEV_URL if it is not on Vite's default port.
 */
process.env.VITE_DEV_SERVER_URL = process.env.ARDHIFLOW_WEB_DEV_URL || 'http://localhost:5173/';


/**
 * 3. Build preload, then main, in watch mode. Main's build spawns (and on
 * every rebuild, restarts) the Electron process; see main's vite.config.js.
 */

/** @type {string[]} */
const packagesToStart = [
  'packages/preload',
  'packages/main',
];

for (const pkg of packagesToStart) {
  await build({
    mode,
    root: path.resolve(pkg),
  });
}
