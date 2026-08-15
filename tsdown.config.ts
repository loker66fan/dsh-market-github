// tsdown config for the browser client bundle. Mirrors the harness's
// clientBundle() shape: emits lib/client.js in CJS format wrapped in the
// module-loader contract (window.__ModuleLoader__.load(...)) with `react`
// resolved as a platform-module external; every other specifier is inlined.
// clean stays off so the host half (lib/host.js, compiled by tsc in
// scripts/build.mjs) is not wiped.
import { defineConfig } from 'tsdown'

const ID = 'dsh-market-github'

/** Platform modules the loader table answers; everything else must inline. */
const EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

export default defineConfig({
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
