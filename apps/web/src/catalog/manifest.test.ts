// This test reads files from disk, so it alone in the web app uses Node's types.
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { catalogManifestSchema } from '@floorplandesigner/shared'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const manifest = catalogManifestSchema.parse(JSON.parse(read('./manifest.json')))
const sources = JSON.parse(read('./sources.json')) as { items: { key: string }[] }
const publicDir = new URL('../../public/', import.meta.url)

describe('catalogue manifest', () => {
  it('lists every source item, in order', () => {
    expect(manifest.items.map((item) => item.key)).toEqual(sources.items.map((item) => item.key))
  })

  it.each(manifest.items.map((item) => [item.key, item] as const))(
    '%s has its model and thumbnail',
    (_key, item) => {
      expect(existsSync(new URL(`.${item.model}`, publicDir))).toBe(true)
      expect(existsSync(new URL(`.${item.thumbnail}`, publicDir))).toBe(true)
    },
  )

  it('has realistic sizes', () => {
    for (const { key, size } of manifest.items) {
      expect([key, size.height > 0.3 && size.height < 2.5]).toEqual([key, true])
      expect([key, Math.max(size.width, size.depth) < 3]).toEqual([key, true])
    }
  })

  it('gives round and L-shaped items a footprint, and plain boxes none', () => {
    const footprints = new Map(manifest.items.map((item) => [item.key, item.footprint]))
    // Measured from the model: the round table is a hexagon.
    expect(footprints.get('table-round')).toHaveLength(1)
    expect(footprints.get('table-round')![0]).toHaveLength(6)
    // Written in the source list: an L is two overlapping rectangles.
    for (const key of ['lounge-sofa-corner', 'lounge-sofa-long', 'desk-corner']) {
      expect([key, footprints.get(key)?.length]).toEqual([key, 2])
    }
    for (const key of ['lounge-sofa', 'bed-double', 'table']) {
      expect([key, footprints.get(key)]).toEqual([key, undefined])
    }
  })

  it('ships the models with their licence', () => {
    expect(read('../../public/models/kenney-furniture-kit/License.txt')).toContain('CC0')
  })
})
