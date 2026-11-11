import { z } from 'zod'

/** Where an item may be placed. */
export const placementTypeSchema = z.enum(['floor', 'wall', 'ceiling'])

export const catalogItemSchema = z.object({
  /** Stable identifier, stored in plans as `catalogKey`. */
  key: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  /** URL or path of the GLB model file. */
  model: z.string().min(1),
  /** URL or path of the thumbnail image. */
  thumbnail: z.string().min(1),
  /** Bounding size in metres. */
  size: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    depth: z.number().positive(),
  }),
  placement: placementTypeSchema,
})

export const catalogManifestSchema = z
  .object({
    items: z.array(catalogItemSchema),
  })
  .refine(
    (manifest) => new Set(manifest.items.map((item) => item.key)).size === manifest.items.length,
    { message: 'Catalogue item keys must be unique', path: ['items'] },
  )

export type PlacementType = z.infer<typeof placementTypeSchema>
export type CatalogItem = z.infer<typeof catalogItemSchema>
export type CatalogManifest = z.infer<typeof catalogManifestSchema>
