import pkg from './package.json' with {type: 'json'};

/**
 * The packaged window loads the deployed web app, whose URL is baked into the
 * main bundle at build time. Packaging without it would ship an app pointed at
 * localhost, so refuse.
 */
if (!process.env.VITE_WEB_APP_URL) {
    throw new Error(
        'VITE_WEB_APP_URL is not set. Set it to the deployed web app URL before running `compile`, ' +
        'e.g. VITE_WEB_APP_URL=https://app.example.com pnpm -F @ardhiflow/desktop compile',
    );
}

/**
 * Our own workspace packages (`@ardhiflow/desktop-main`, `-preload`) are linked
 * into node_modules by pnpm. electron-builder would copy each package whole
 * (src, vite.config.js, tsconfig...), so exclude them and add back only their
 * built output. Third-party production dependencies (electron-updater) are
 * collected by electron-builder's pnpm-aware dependency collector as usual.
 */
const workspacePackages = Object.keys(pkg.dependencies)
    .filter(name => pkg.dependencies[name].startsWith('workspace:'));

export default /** @type import('electron-builder').Configuration */
({
    appId: 'com.ardhiflow.desktop',
    directories: {
        output: 'dist',
        buildResources: 'buildResources',
    },
    generateUpdatesFilesForAllChannels: true,
    linux: {
        target: ['deb'],
    },
    /**
     * It is recommended to avoid using non-standard characters such as spaces in artifact names,
     * as they can unpredictably change during deployment, making them impossible to locate and download for update.
     */
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    files: [
        'LICENSE*',
        pkg.main,
        '!node_modules/@ardhiflow/**',
        ...workspacePackages.flatMap(name => [
            `node_modules/${name}/dist/**`,
            `node_modules/${name}/package.json`,
        ]),
    ],
});
