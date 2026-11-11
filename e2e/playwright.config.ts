import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// The suite runs the real backend and web app, but on its own ports and against its own
// database, so it can run beside `pnpm dev` and never touches the plans you are working on.
const root = fileURLToPath(new URL('..', import.meta.url))
const envFile = `${root}.env`
if (existsSync(envFile)) process.loadEnvFile(envFile)

const workingDatabase = process.env.DATABASE_URL
if (!workingDatabase) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.')
}
// The same Postgres server, with a database of its own named after the working one.
const database = new URL(workingDatabase)
database.pathname += '_e2e'

const API_PORT = 3100
const WEB_PORT = 5273

export default defineConfig({
  testDir: './tests',
  // One at a time: every test uses the one database.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    // The Chrome that is installed, so no browser has to be downloaded.
    channel: 'chrome',
    viewport: { width: 1400, height: 850 },
    // Lets the 3D view draw without a graphics card, as on a build server.
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Creates and migrates the database if needed, and empties it, before the backend starts.
      command:
        'pnpm --filter @floorplandesigner/api exec tsx scripts/prepare-e2e-db.ts && ' +
        'pnpm --filter @floorplandesigner/api exec tsx src/index.ts',
      cwd: root,
      env: { DATABASE_URL: database.href, PORT: String(API_PORT) },
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @floorplandesigner/web exec vite --port ${WEB_PORT} --strictPort`,
      cwd: root,
      // The web app's dev server sends /api to the port named here, and keeps its own cache so
      // that it does not disturb a dev server that is already running.
      env: { PORT: String(API_PORT), VITE_CACHE_DIR: 'node_modules/.vite-e2e' },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
    },
  ],
})
