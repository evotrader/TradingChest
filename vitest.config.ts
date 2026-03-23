import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    fs: {
      strict: false
    }
  },
  test: {
    // Default to 'node' for pure-logic tests.
    // Use `// @vitest-environment jsdom` per-file for component tests.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/**/*.d.ts']
    }
  }
})
