import { z } from 'zod'

/** Where an item may be placed. Only floor items can be placed so far. */
export const placementTypeSchema = z.enum(['floor', 'wall', 'ceiling'])

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
})

export type PlacementType = z.infer<typeof placementTypeSchema>
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>
export type ItemSize = ItemDefinition['size']
