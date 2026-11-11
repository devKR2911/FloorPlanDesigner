import {
  createPlanRequestSchema,
  updatePlanRequestSchema,
  type PlanRecord,
  type PlanSummary,
} from '@floorplandesigner/shared'
import { zValidator } from '@hono/zod-validator'
import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ValidationTargets } from 'hono'
import { z, type ZodType } from 'zod'
import { plans, type Database } from '../db/schema.js'

type PlanRow = typeof plans.$inferSelect

const toSummary = (row: Omit<PlanRow, 'document'>): PlanSummary => ({
  id: row.id,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const toRecord = (row: PlanRow): PlanRecord => ({ ...toSummary(row), document: row.document })

/** Validates one part of the request and answers 400 with the Zod issues if it is invalid. */
const validate = <Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: 'Invalid request', issues: result.error.issues }, 400)
    }
  })

const idParamSchema = z.object({ id: z.uuid() })

const notFound = { error: 'Plan not found' }

export function createPlansRoutes(db: Database) {
  return new Hono()
    .get('/', async (c) => {
      const rows = await db
        .select({
          id: plans.id,
          name: plans.name,
          createdAt: plans.createdAt,
          updatedAt: plans.updatedAt,
        })
        .from(plans)
        .orderBy(desc(plans.updatedAt))
      return c.json({ plans: rows.map(toSummary) }, 200)
    })
    .post('/', validate('json', createPlanRequestSchema), async (c) => {
      const body = c.req.valid('json')
      const [row] = await db.insert(plans).values(body).returning()
      if (!row) throw new Error('Insert returned no row')
      return c.json(toRecord(row), 201)
    })
    .get('/:id', validate('param', idParamSchema), async (c) => {
      const { id } = c.req.valid('param')
      const [row] = await db.select().from(plans).where(eq(plans.id, id))
      if (!row) return c.json(notFound, 404)
      return c.json(toRecord(row), 200)
    })
    .patch(
      '/:id',
      validate('param', idParamSchema),
      validate('json', updatePlanRequestSchema),
      async (c) => {
        const { id } = c.req.valid('param')
        const body = c.req.valid('json')
        const [row] = await db
          .update(plans)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(plans.id, id))
          .returning()
        if (!row) return c.json(notFound, 404)
        return c.json(toRecord(row), 200)
      },
    )
    .delete('/:id', validate('param', idParamSchema), async (c) => {
      const { id } = c.req.valid('param')
      const [row] = await db.delete(plans).where(eq(plans.id, id)).returning({ id: plans.id })
      if (!row) return c.json(notFound, 404)
      return c.body(null, 204)
    })
}
