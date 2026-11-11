import { describe, expect, it } from 'vitest'
import { catalogManifestSchema, type CatalogItem } from './catalog.js'
import {
  MAX_THUMBNAIL_LENGTH,
  createPlanRequestSchema,
  planSummarySchema,
  updatePlanRequestSchema,
} from './plans.js'

/** A one-pixel PNG. */
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

// As saved before doors and windows existed: with no `openings` list.
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
      document: { ...emptyDocument, openings: [] },
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

  it('accepts a thumbnail on its own, or null to remove it', () => {
    expect(updatePlanRequestSchema.parse({ thumbnail: png })).toEqual({ thumbnail: png })
    expect(updatePlanRequestSchema.parse({ thumbnail: null })).toEqual({ thumbnail: null })
  })
})

describe('plan thumbnails', () => {
  it('are optional when creating a plan', () => {
    const body = { name: 'Flat', document: emptyDocument }
    expect(createPlanRequestSchema.parse(body).thumbnail).toBeUndefined()
    expect(createPlanRequestSchema.parse({ ...body, thumbnail: png }).thumbnail).toBe(png)
  })

  it('must be PNG data URLs', () => {
    for (const thumbnail of [
      'https://example.com/plan.png',
      'data:image/jpeg;base64,AAAA',
      'data:image/png;base64,not base64!',
      '',
    ]) {
      expect(updatePlanRequestSchema.safeParse({ thumbnail }).success).toBe(false)
    }
  })

  it('must not be too large', () => {
    const prefix = 'data:image/png;base64,'
    const largest = prefix + 'A'.repeat(MAX_THUMBNAIL_LENGTH - prefix.length)
    expect(updatePlanRequestSchema.safeParse({ thumbnail: largest }).success).toBe(true)
    expect(updatePlanRequestSchema.safeParse({ thumbnail: largest + 'A' }).success).toBe(false)
  })

  it('are part of a plan summary, as a picture or null', () => {
    const summary = {
      id: '2b0f6c1e-7a57-4f0b-9c39-0d3a0f6a1c11',
      name: 'Flat',
      createdAt: '2026-11-11T10:00:00.000Z',
      updatedAt: '2026-11-11T10:00:00.000Z',
    }
    expect(planSummarySchema.safeParse({ ...summary, thumbnail: null }).success).toBe(true)
    expect(planSummarySchema.safeParse({ ...summary, thumbnail: png }).success).toBe(true)
    expect(planSummarySchema.safeParse(summary).success).toBe(false)
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
