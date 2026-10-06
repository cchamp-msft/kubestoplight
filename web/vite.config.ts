import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mockBackend } from './mock/plugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // `vite --mode mock` swaps the Go backend for in-process fake data (see mock/).
  plugins: mode === 'mock' ? [react(), mockBackend()] : [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: mode === 'mock' ? undefined : {
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:8080',
      },
    },
  },
}))
