import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import { env } from '../env.js'
import { schema, type Database } from './schema.js'

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL })

export const db: Database = drizzle(pool, { schema })
