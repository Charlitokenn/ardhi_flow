import type {AppInitConfig} from './AppInitConfig.js';
import {createModuleRunner} from './ModuleRunner.js';
import {disallowMultipleAppInstance} from './modules/SingleInstanceApp.js';
import {createWindowManagerModule} from './modules/WindowManager.js';
import {terminateAppOnLastWindowClose} from './modules/ApplicationTerminatorOnLastWindowClose.js';
import {hardwareAccelerationMode} from './modules/HardwareAccelerationModule.js';
import {autoUpdater} from './modules/AutoUpdater.js';
import {allowInternalOrigins} from './modules/BlockNotAllowdOrigins.js';
import {allowExternalUrls} from './modules/ExternalUrls.js';

/**
 * The deployed ArdhiFlow web app the packaged window loads, baked in at build
 * time from VITE_WEB_APP_URL. Falls back to the local dev server so a plain
 * `pnpm build` still works; `pnpm -F @ardhiflow/desktop compile` refuses to
 * package without it (see electron-builder.mjs).
 */
export const webAppUrl = import.meta.env.VITE_WEB_APP_URL || 'http://localhost:5173/';

/** Extra origins the window may navigate to, e.g. Clerk's hosted pages for OAuth. */
const extraAllowedOrigins = (import.meta.env.VITE_EXTRA_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);


export async function initApp(initConfig: AppInitConfig) {
  const moduleRunner = createModuleRunner()
    .init(createWindowManagerModule({initConfig, openDevTools: import.meta.env.DEV}))
    .init(disallowMultipleAppInstance())
    .init(terminateAppOnLastWindowClose())
    .init(hardwareAccelerationMode({enable: false}))
    .init(autoUpdater())

    // Install DevTools extension if needed
    // .init(chromeDevToolsExtension({extension: 'VUEJS3_DEVTOOLS'}))

    // Security
    .init(allowInternalOrigins(
      new Set([
        ...(initConfig.renderer instanceof URL ? [initConfig.renderer.origin] : []),
        ...extraAllowedOrigins,
      ]),
    ))
    // No external origins are opened in the OS browser yet; add them here as
    // the web app gains outbound links.
    .init(allowExternalUrls(new Set()));

  await moduleRunner;
}
