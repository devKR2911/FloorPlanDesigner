import { itemDefinitionSchema, placementTypeSchema } from '@floorplandesigner/engine/schema'
import { z } from 'zod'

export { placementTypeSchema }

/** An item in the app's catalogue: what the engine needs, plus what the catalogue panel shows. */
export const catalogItemSchema = itemDefinitionSchema.extend({
  name: z.string().min(1),
  category: z.string().min(1),
  /** URL or path of the thumbnail image. */
  thumbnail: z.string().min(1),
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
