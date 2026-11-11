import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig(({ mode }) => {
  // Read the backend port from the root .env file, so the proxy follows it.
  const env = loadEnv(mode, repoRoot, '')
  const apiPort = env.PORT || '3000'

  return {
    plugins: [react(), tailwindcss()],
    // The end-to-end tests run a second dev server, which keeps a cache of its own.
    ...(env.VITE_CACHE_DIR && { cacheDir: env.VITE_CACHE_DIR }),
    test: {
      // Component tests ask for a simulated browser with `@vitest-environment jsdom`.
      setupFiles: ['./src/test/setup.ts'],
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      strictPort: true,
      // The browser only ever talks to this server, so the backend needs no CORS setup.
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
