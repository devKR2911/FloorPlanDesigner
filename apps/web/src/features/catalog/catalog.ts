import { catalogManifestSchema, type CatalogItem } from '@floorplandesigner/shared'
import manifest from '@/catalog/manifest.json'

/** The app's furniture catalogue, checked against the shared schema when the app starts. */
export const catalog = catalogManifestSchema.parse(manifest)

/** The catalogue grouped by category, in the order categories first appear in the manifest. */
export const catalogByCategory: { category: string; items: CatalogItem[] }[] = (() => {
  const groups = new Map<string, CatalogItem[]>()
  for (const item of catalog.items) {
    const group = groups.get(item.category)
    if (group) group.push(item)
    else groups.set(item.category, [item])
  }
  return [...groups].map(([category, items]) => ({ category, items }))
})()

const byKey = new Map(catalog.items.map((item) => [item.key, item]))

export function catalogItem(key: string): CatalogItem | undefined {
  return byKey.get(key)
}
