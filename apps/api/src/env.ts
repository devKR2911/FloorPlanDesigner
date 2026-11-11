import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// The .env file lives at the repository root, three levels above src/ and dist/ alike.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'Copy .env.example to .env at the repository root'),
  PORT: z.coerce.number().int().positive().default(3000),
})

export const env = envSchema.parse(process.env)
