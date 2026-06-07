import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies API calls to the OmniVoice FastAPI server so the UI runs
// same-origin in production (mounted at '/') and proxied in dev.
const API = process.env.VONIA_API || 'http://localhost:8002'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/tts': API,
      '/health': API,
      '/v1': API,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
