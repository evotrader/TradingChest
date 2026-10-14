import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

// Subentries share the host's Solid runtime. Legacy root bundles remain unchanged.
export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    emptyOutDir: false,
    outDir: 'dist/entries',
    rollupOptions: {
      external: id => id === 'klinecharts' || id === 'react' || id.startsWith('react/') || id === 'solid-js' || id.startsWith('solid-js/'),
    },
    lib: {
      entry: { index: 'src/index.ts', chart: 'src/chart.ts', solid: 'src/solid.ts', react: 'src/react.ts' },
      formats: ['es', 'cjs'],
      fileName: (format, name) => `${name}.${format === 'es' ? 'js' : 'cjs'}`,
    },
  },
})
