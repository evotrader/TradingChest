import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'
const cjs = process.env.TC_ENTRY_FORMAT === 'cjs'
const engineRoot=dirname(createRequire(import.meta.url).resolve('klinecharts/package.json'))

// Subentries share the host's Solid runtime. Legacy root bundles remain unchanged.
export default defineConfig({
  plugins: [solidPlugin()],
  // v10's CJS entry loads an ESM-typed UMD file. Browser CJS entries bundle the real ESM engine.
  resolve: cjs ? {alias:[{find:/^klinecharts$/,replacement:join(engineRoot,'dist/index.esm.js')}]} : undefined,
  build: {
    emptyOutDir: false,
    outDir: 'dist/entries',
    rollupOptions: {
      external: id => (!cjs && id === 'klinecharts') || id === 'react' || id.startsWith('react/') || id === 'solid-js' || id.startsWith('solid-js/'),
    },
    lib: {
      entry: { index: 'src/index.ts', chart: 'src/chart.ts', solid: 'src/solid.ts', react: 'src/react.ts' },
      formats: [cjs ? 'cjs' : 'es'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
})
