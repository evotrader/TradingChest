import {defineConfig} from 'vite'
import {drawingStoreMiddleware} from './http-server.mjs'
export default defineConfig({build:{target:'es2022',rollupOptions:{input:{main:'index.html',alerts:'alerts.html'}}},plugins:[{name:'isolated-drawing-cas',configureServer(server){const middleware=drawingStoreMiddleware();server.middlewares.use('/drawing-store',middleware.handle)}}]})
