import { z } from 'zod'

/** Version of the plan save format. Raise it when the shape changes in a breaking way. */
export const PLAN_FORMAT_VERSION = 1

const idSchema = z.string().min(1)

/** A point where walls meet. Coordinates are in metres on the floor plane. */
export const cornerSchema = z.object({
  id: idSchema,
  x: z.number(),
  y: z.number(),
})

/** A straight wall between two corners. Lengths are in metres. */
export const wallSchema = z.object({
  id: idSchema,
  start: idSchema,
  end: idSchema,
  thickness: z.number().positive(),
  height: z.number().positive(),
})

/** A placed catalogue item, such as a piece of furniture. */
export const itemSchema = z.object({
  id: idSchema,
  /** Key of the item in the app's catalogue. The engine never stores model URLs in a plan. */
  catalogKey: z.string().min(1),
  /** Position in metres. `y` is height above the floor. */
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  /** Rotation around the vertical axis, in radians. */
  rotation: z.number(),
})

export const planSchema = z
  .object({
    version: z.literal(PLAN_FORMAT_VERSION),
    corners: z.array(cornerSchema),
    walls: z.array(wallSchema),
    items: z.array(itemSchema),
  })
  .superRefine((plan, ctx) => {
    const reportDuplicates = (key: 'corners' | 'walls' | 'items') => {
      const seen = new Set<string>()
      plan[key].forEach((entry, index) => {
        if (seen.has(entry.id)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate id "${entry.id}"`,
            path: [key, index, 'id'],
          })
        }
        seen.add(entry.id)
      })
    }
    reportDuplicates('corners')
    reportDuplicates('walls')
    reportDuplicates('items')

    const cornerIds = new Set(plan.corners.map((corner) => corner.id))
    const joinedPairs = new Set<string>()
    plan.walls.forEach((wall, index) => {
      const pair = [wall.start, wall.end].sort().join('\u0000')
      if (joinedPairs.has(pair)) {
        ctx.addIssue({
          code: 'custom',
          message: 'These corners are already joined by another wall',
          path: ['walls', index],
        })
      }
      joinedPairs.add(pair)
      for (const end of ['start', 'end'] as const) {
        if (!cornerIds.has(wall[end])) {
          ctx.addIssue({
            code: 'custom',
            message: `Unknown corner "${wall[end]}"`,
            path: ['walls', index, end],
          })
        }
      }
      if (wall.start === wall.end) {
        ctx.addIssue({
          code: 'custom',
          message: 'A wall must join two different corners',
          path: ['walls', index, 'end'],
        })
      }
    })
  })

export type Corner = z.infer<typeof cornerSchema>
export type Wall = z.infer<typeof wallSchema>
export type Item = z.infer<typeof itemSchema>
export type Plan = z.infer<typeof planSchema>

export function createEmptyPlan(): Plan {
  return { version: PLAN_FORMAT_VERSION, corners: [], walls: [], items: [] }
}
