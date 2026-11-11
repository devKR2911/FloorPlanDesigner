import type { Plan } from '@floorplandesigner/engine/schema'
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type PgDatabase,
  type PgQueryResultHKT,
} from 'drizzle-orm/pg-core'

// There is no owner column yet. Login adds it later with one migration.
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  document: jsonb('document').$type<Plan>().notNull(),
  /** A small picture of the plan for the plan list, as a PNG data URL. */
  thumbnail: text('thumbnail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = { plans }

/**
 * Any Postgres database Drizzle can talk to: the `pg` driver when the backend runs, and an
 * in-process Postgres in the tests.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>
