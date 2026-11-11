import { planSchema } from '@floorplandesigner/engine/schema'
import { z } from 'zod'

export const planNameSchema = z.string().trim().min(1).max(200)

const timestampSchema = z.iso.datetime()

/** A saved plan without its document, as returned by the plan list. */
export const planSummarySchema = z.object({
  id: z.uuid(),
  name: planNameSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

/** A saved plan, as stored by the backend. */
export const planRecordSchema = planSummarySchema.extend({
  document: planSchema,
})

export const planListResponseSchema = z.object({
  plans: z.array(planSummarySchema),
})

export const createPlanRequestSchema = z.object({
  name: planNameSchema,
  document: planSchema,
})

export const updatePlanRequestSchema = z
  .object({
    name: planNameSchema.optional(),
    document: planSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.document !== undefined, {
    message: 'Provide a name, a document, or both',
  })

export type PlanSummary = z.infer<typeof planSummarySchema>
export type PlanRecord = z.infer<typeof planRecordSchema>
export type PlanListResponse = z.infer<typeof planListResponseSchema>
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>
