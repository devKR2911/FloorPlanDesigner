import { planSchema } from '@floorplandesigner/engine/schema'
import { z } from 'zod'

export const planNameSchema = z.string().trim().min(1).max(200)

const timestampSchema = z.iso.datetime()

/** The longest thumbnail accepted, in characters. A data URL this long holds about 100 kB. */
export const MAX_THUMBNAIL_LENGTH = 140_000

/** A small picture of a plan for the plan list: a PNG or JPEG as a base64 data URL. */
export const planThumbnailSchema = z
  .string()
  .max(MAX_THUMBNAIL_LENGTH)
  .regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/, 'Must be a PNG or JPEG data URL')

/** A saved plan without its document, as returned by the plan list. */
export const planSummarySchema = z.object({
  id: z.uuid(),
  name: planNameSchema,
  /** `null` for a plan that has no picture yet. */
  thumbnail: planThumbnailSchema.nullable(),
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
  thumbnail: planThumbnailSchema.nullable().optional(),
})

export const updatePlanRequestSchema = z
  .object({
    name: planNameSchema.optional(),
    document: planSchema.optional(),
    /** `null` removes the picture. */
    thumbnail: planThumbnailSchema.nullable().optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined || body.document !== undefined || body.thumbnail !== undefined,
    { message: 'Provide a name, a document or a thumbnail' },
  )

export type PlanSummary = z.infer<typeof planSummarySchema>
export type PlanRecord = z.infer<typeof planRecordSchema>
export type PlanListResponse = z.infer<typeof planListResponseSchema>
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>
