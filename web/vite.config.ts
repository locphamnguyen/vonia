import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server proxies API calls to the OmniVoice FastAPI server so the UI runs
// same-origin in production (mounted at '/') and proxied in dev.
const API = process.env.VONIA_API || 'http://localhost:8002'

// In dev the API (8002) may require login. If VONIA_AUTH_USER/PASS are present in
// the shell env, the proxy injects HTTP Basic auth so dev API calls aren't 401.
// Creds come from the environment only — never hardcoded/committed here.
const AUTH = process.env.VONIA_AUTH_USER && process.env.VONIA_AUTH_PASS
  ? `${process.env.VONIA_AUTH_USER}:${process.env.VONIA_AUTH_PASS}`
  : undefined
const target = { target: API, changeOrigin: true, ...(AUTH ? { auth: AUTH } : {}) }

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/tts': target,
      '/health': target,
      '/v1': target,
      '/login': target,
      '/logout': target,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
