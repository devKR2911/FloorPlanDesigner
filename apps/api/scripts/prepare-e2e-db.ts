// Gets the database for the end-to-end tests ready: creates it if it does not exist, applies
// the migrations, and removes every plan. It is run with DATABASE_URL pointing at that database.
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import { plans } from '../src/db/schema.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')
const name = new URL(url).pathname.slice(1)
// This script deletes every plan, so it refuses any database that is not made for tests.
if (!name.endsWith('_e2e')) {
  throw new Error(`Refusing to empty "${name}": the test database's name must end in "_e2e"`)
}

// A database cannot create itself, so connect to the server's default one to do it.
const server = new URL(url)
server.pathname = '/postgres'
const admin = new pg.Client({ connectionString: server.href })
await admin.connect()
const existing = await admin.query('select 1 from pg_database where datname = $1', [name])
if (existing.rowCount === 0) {
  await admin.query(`create database ${pg.escapeIdentifier(name)}`)
  console.log(`Created database ${name}`)
}
await admin.end()

const pool = new pg.Pool({ connectionString: url })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
await db.delete(plans)
await pool.end()
console.log(`Database ${name} is migrated and empty`)
