import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Vitest config for the Vonia web UI. jsdom env so React hook tests
// (useGenerator) and any component tests can run; pure-logic tests
// (i18n parity, mapParams, splitText) work the same.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
