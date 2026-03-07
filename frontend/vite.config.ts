import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:3000', changeOrigin: true },
      '/channels': { target: 'http://localhost:3000', changeOrigin: true },
      '/messages': { target: 'http://localhost:3000', changeOrigin: true },
      '/search': { target: 'http://localhost:3000', changeOrigin: true },
      '/files': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Skip proxy for HTML page navigations so the /files SPA route works on refresh
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) {
            return req.url;
          }
        },
      },
      '/users': { target: 'http://localhost:3000', changeOrigin: true },
      '/dms': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        // Skip proxy for HTML page navigations so the /admin SPA route works on refresh
        bypass(req) {
          if (req.headers.accept?.includes('text/html')) {
            return req.url;
          }
        },
      },
      '/bookmarks': { target: 'http://localhost:3000', changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
})
