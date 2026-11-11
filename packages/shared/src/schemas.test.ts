import { describe, expect, it } from 'vitest'
import { catalogManifestSchema, type CatalogItem } from './catalog.js'
import { createPlanRequestSchema, updatePlanRequestSchema } from './plans.js'

const emptyDocument = { version: 1, corners: [], walls: [], items: [] }

const sofa: CatalogItem = {
  key: 'sofa',
  name: 'Sofa',
  category: 'Living room',
  model: '/models/sofa.glb',
  thumbnail: '/models/sofa.png',
  size: { width: 2, height: 0.8, depth: 0.9 },
  placement: 'floor',
}

describe('createPlanRequestSchema', () => {
  it('trims the name and keeps the document', () => {
    expect(createPlanRequestSchema.parse({ name: '  Flat  ', document: emptyDocument })).toEqual({
      name: 'Flat',
      document: emptyDocument,
    })
  })

  it('rejects a blank name', () => {
    const result = createPlanRequestSchema.safeParse({ name: '   ', document: emptyDocument })
    expect(result.success).toBe(false)
  })

  it('rejects a document that is not a valid plan', () => {
    const result = createPlanRequestSchema.safeParse({ name: 'Flat', document: { version: 1 } })
    expect(result.success).toBe(false)
  })
})

describe('updatePlanRequestSchema', () => {
  it('accepts a name on its own', () => {
    expect(updatePlanRequestSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' })
  })

  it('rejects an empty body', () => {
    expect(updatePlanRequestSchema.safeParse({}).success).toBe(false)
  })
})

describe('catalogManifestSchema', () => {
  it('accepts an empty catalogue', () => {
    expect(catalogManifestSchema.parse({ items: [] })).toEqual({ items: [] })
  })

  it('rejects two items with the same key', () => {
    expect(catalogManifestSchema.safeParse({ items: [sofa, sofa] }).success).toBe(false)
  })

  it('rejects an unknown placement type', () => {
    const result = catalogManifestSchema.safeParse({
      items: [{ ...sofa, placement: 'underwater' }],
    })
    expect(result.success).toBe(false)
  })
})
