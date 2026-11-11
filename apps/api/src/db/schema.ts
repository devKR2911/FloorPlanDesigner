import type { Plan } from '@floorplandesigner/engine/schema'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// There is no owner column yet. Login adds it later with one migration.
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  document: jsonb('document').$type<Plan>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const schema = { plans }

export type Database = NodePgDatabase<typeof schema>
