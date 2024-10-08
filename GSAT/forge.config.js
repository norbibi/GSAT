const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const copyNodeModules = require('copy-node-modules');
const path = require('node:path');
const fs = require('fs');
const asar = require('@electron/asar');

module.exports =  {
  packagerConfig: {
    asar: true,
    extraResource: [
      './src/scripts',
      './src/img'
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32', 'linux', 'darwin'],
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/index.html',
              js: './src/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/preload.js',
              },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      //[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  hooks: {
    postPackage: async (forgeConfig, options) => {
      const filter = path => {
        return path.indexOf('asar-node') !== -1;
      }

      const dest = path.join(options.outputPaths[0], 'resources');
      await asar.createPackage(path.join(__dirname, 'node_modules'), path.join(dest, 'node_modules.asar'));

      await new Promise(async (resolve) => copyNodeModules(__dirname, dest, { devDependencies: false, filter }, (err, results) => {
        if(err) {
          console.error(err);
          return;
        }
        resolve();
      }));

      let modules_directory = path.join(dest, 'node_modules');
      let files = fs.readdirSync(modules_directory);
      for(file of files) {
        if(file != 'asar-node')
          fs.rmdirSync(path.join(modules_directory, file), {recursive: true});
      }
    }
  }
};
