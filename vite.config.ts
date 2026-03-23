/// <reference types="vite/client" />

import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    cssTarget: 'chrome61',
    sourcemap: false,
    rollupOptions: {
      external: ['klinecharts'],
      output: {
        assetFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'style.css') {
            return 'trading-chest.css'
          }
        },
        globals: {
          klinecharts: 'klinecharts'
        },
      },
    },
    lib: {
      entry: './src/index.ts',
      name: 'tradingchest',
      fileName: (format) => {
        if (format === 'es') {
          return 'trading-chest.js'
        }
        if (format === 'umd') {
          return 'trading-chest.umd.js'
        }
      }
    }
  }
})
