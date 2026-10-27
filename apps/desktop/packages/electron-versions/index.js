import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

// Resolve the binary from this package's own `electron` dependency rather than
// `npx electron`, which relied on npm hoisting and is not reliable under pnpm.
const electronPath = createRequire(import.meta.url)('electron');

function getElectronEnv() {
  return JSON.parse(execFileSync(
    electronPath,
    ['-p', 'JSON.stringify(process.versions)'],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: 1,
      }
    }
  ));
}

function createElectronEnvLoader() {
  let inMemoryCache = null;

  return () => {
    if (inMemoryCache) {
      return inMemoryCache;
    }

    return inMemoryCache = getElectronEnv();
  }
}

const envLoader = createElectronEnvLoader();


export function getElectronVersions() {
  return envLoader();
}

export function getChromeVersion() {
  return getElectronVersions().chrome;
}

export function getChromeMajorVersion() {
  return getMajorVersion(getChromeVersion());
}

export function getNodeVersion() {
  return getElectronVersions().node;
}

export function getNodeMajorVersion() {
  return getMajorVersion(getNodeVersion());
}

function getMajorVersion(version) {
  return parseInt(version.split('.')[0]);
}
