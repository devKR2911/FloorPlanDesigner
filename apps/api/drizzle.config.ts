import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// The db scripts run from apps/api; the .env file lives at the repository root.
const envFile = '../../.env'
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env.DATABASE_URL
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repository root.')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url },
})
