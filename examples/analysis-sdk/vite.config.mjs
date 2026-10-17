import {defineConfig} from 'vite'
import {fileURLToPath} from 'node:url'

export default defineConfig({build:{target:'esnext',rollupOptions:{input:{
  analysis:fileURLToPath(new URL('./index.html',import.meta.url)),
  dataWorkspace:fileURLToPath(new URL('./data-workspace.html',import.meta.url)),
}}}})
