import { z } from 'zod'

/** Where an item may be placed. Only floor items can be placed so far. */
export const placementTypeSchema = z.enum(['floor', 'wall', 'ceiling'])

/** How far a footprint may stray from exact, to allow for rounding in the catalogue file. */
const FOOTPRINT_SLACK = 1e-6

/**
 * An item's outline on the floor, when it is not its full rectangle: one or more convex
 * polygons that together cover it. Points are `[x, y]` in the item's own frame, as fractions of
 * its size: `x` from -0.5 (left) to 0.5 (right) across the width, `y` from -0.5 (front) to 0.5
 * (back) across the depth. Each polygon runs counter-clockwise. Pieces may overlap each other.
 */
export const footprintSchema = z
  .array(z.array(z.tuple([z.number(), z.number()])).min(3))
  .min(1)
  .superRefine((pieces, ctx) => {
    pieces.forEach((piece, index) => {
      const problem = footprintPieceProblem(piece)
      if (problem) ctx.addIssue({ code: 'custom', message: problem, path: [index] })
    })
  })

/** Why a footprint piece is not usable, or `null` if it is. */
export function footprintPieceProblem(
  piece: readonly (readonly [number, number])[],
): string | null {
  const limit = 0.5 + FOOTPRINT_SLACK
  if (piece.some(([x, y]) => Math.abs(x) > limit || Math.abs(y) > limit)) {
    return 'Footprint points must lie between -0.5 and 0.5'
  }
  let area = 0
  for (let i = 0; i < piece.length; i++) {
    const [ax, ay] = piece[i]!
    const [bx, by] = piece[(i + 1) % piece.length]!
    const [cx, cy] = piece[(i + 2) % piece.length]!
    area += ax * by - bx * ay
    // A right turn anywhere means the piece is concave, or runs clockwise.
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) < -FOOTPRINT_SLACK) {
      return 'Footprint pieces must be convex and counter-clockwise'
    }
  }
  return area > FOOTPRINT_SLACK ? null : 'Footprint pieces must enclose an area'
}

/**
 * What the engine needs to know about a kind of item. The app keeps the catalogue and passes
 * these in with `engine.setCatalog()`; the shared package's catalogue schema builds on this one.
 */
export const itemDefinitionSchema = z.object({
  /** Stable identifier, stored in plans as `catalogKey`. */
  key: z.string().min(1),
  /** URL or path of the GLB model file. */
  model: z.string().min(1),
  /** The item's real size in metres. The engine scales the model to it. */
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
  }),
  placement: placementTypeSchema,
  /** The item's outline on the floor. Without one, the item is its full width by depth. */
  footprint: footprintSchema.optional(),
})

export type PlacementType = z.infer<typeof placementTypeSchema>
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>
export type ItemSize = ItemDefinition['size']
export type Footprint = z.infer<typeof footprintSchema>
/** An item's size together with its outline on the floor. Usable wherever a size is. */
export type ItemShape = ItemSize & { footprint?: Footprint }
