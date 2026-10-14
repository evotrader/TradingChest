import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const solidRoot = dirname(createRequire(import.meta.url).resolve('solid-js/package.json'))
const klineRoot = dirname(createRequire(import.meta.url).resolve('klinecharts/package.json'))

export default defineConfig({
  plugins: [solidPlugin()],
  // Component tests and their hoisted testing-library share the browser runtime.
  resolve: { conditions: ['browser', 'development'], alias: [
    // Exercise the browser entry instead of the 9.x CommonJS-to-UMD loader.
    { find: /^klinecharts$/, replacement: join(klineRoot, 'dist/index.esm.js') },
    { find: /^solid-js\/web$/, replacement: join(solidRoot, 'web/dist/dev.js') },
    { find: /^solid-js$/, replacement: join(solidRoot, 'dist/dev.js') },
  ] },
  server: {
    fs: {
      strict: false
    }
  },
  test: {
    server: { deps: { inline: [/solid-js/, /@solidjs\/testing-library/] } },
    // Default to 'node' for pure-logic tests.
    // Use `// @vitest-environment jsdom` per-file for Solid component tests.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/**/*.d.ts']
    }
  }
})
