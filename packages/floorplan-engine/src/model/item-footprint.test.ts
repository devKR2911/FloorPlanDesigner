import { describe, expect, it } from 'vitest'
import {
  footprintSchema,
  itemDefinitionSchema,
  type Footprint,
  type ItemShape,
} from '../schema/item-definition.js'
import { Floorplan } from './floorplan.js'
import { ItemCatalog } from './item-catalog.js'
import { findOverlaps, itemAt, itemFootprint, itemOutline } from './item-geometry.js'
import { findFreeSpot } from './placement.js'

const hexagon: Footprint = [
  [
    [-0.5, -0.25],
    [0, -0.5],
    [0.5, -0.25],
    [0.5, 0.25],
    [0, 0.5],
    [-0.5, 0.25],
  ],
]
/** A back strip and a right strip: the front left quarter is empty. */
const lShape: Footprint = [
  [
    [-0.5, 0],
    [0.5, 0],
    [0.5, 0.5],
    [-0.5, 0.5],
  ],
  [
    [0, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [0, 0.5],
  ],
]
const triangle: Footprint = [
  [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
  ],
]

const shapes: Record<string, ItemShape> = {
  table: { width: 2, depth: 2, height: 0.7, footprint: hexagon },
  sofa: { width: 2, depth: 2, height: 0.9, footprint: lShape },
  shelf: { width: 1, depth: 1, height: 1, footprint: triangle },
  chair: { width: 0.4, depth: 0.4, height: 0.9 },
}
const shapeOf = (key: string) => shapes[key]!

/** A plan with no walls and the given items, each `[key, x, y, rotation?]`. */
function planWith(...items: [string, number, number, number?][]): Floorplan {
  const fp = new Floorplan()
  fp.load({
    version: 1,
    corners: [],
    walls: [],
    items: items.map(([catalogKey, x, y, rotation = 0], index) => ({
      id: `i${index}`,
      catalogKey,
      position: { x, y },
      elevation: 0,
      rotation,
    })),
  })
  return fp
}

const overlapping = (fp: Floorplan) => [...findOverlaps(fp, shapeOf)].sort()

describe('footprintSchema', () => {
  it('accepts convex, counter-clockwise pieces inside the rectangle', () => {
    for (const footprint of [hexagon, lShape, triangle]) {
      expect(footprintSchema.safeParse(footprint).success).toBe(true)
    }
  })

  it('rejects a clockwise piece', () => {
    expect(footprintSchema.safeParse([[...triangle[0]!].reverse()]).success).toBe(false)
  })

  it('rejects a concave piece', () => {
    const arrow = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0, 0],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]
    expect(footprintSchema.safeParse([arrow]).success).toBe(false)
  })

  it('rejects points outside the rectangle, too few points and no pieces', () => {
    const wide = [
      [-0.6, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
    ]
    expect(footprintSchema.safeParse([wide]).success).toBe(false)
    expect(footprintSchema.safeParse([[triangle[0]![0], triangle[0]![1]]]).success).toBe(false)
    expect(footprintSchema.safeParse([]).success).toBe(false)
  })

  it('is optional in an item definition and kept by the catalogue', () => {
    const definition = {
      key: 'table',
      model: '/table.glb',
      size: { width: 2, height: 0.7, depth: 2 },
      placement: 'floor' as const,
    }
    expect(itemDefinitionSchema.parse(definition).footprint).toBeUndefined()

    const catalog = new ItemCatalog()
    catalog.set([definition, { ...definition, key: 'round', footprint: hexagon }])
    expect(catalog.shapeOf('table')).toEqual(definition.size)
    expect(catalog.shapeOf('round')).toEqual({ ...definition.size, footprint: hexagon })
    expect(catalog.shapeOf('unknown').footprint).toBeUndefined()
    expect(catalog.sizeOf('round')).toEqual(definition.size)
  })
})

describe('itemFootprint', () => {
  it('is the full rectangle for an item with no footprint', () => {
    const pose = { position: { x: 3, y: 1 }, rotation: 0.4 }
    expect(itemFootprint(pose, shapes.chair!)).toEqual([itemOutline(pose, shapes.chair!)])
  })

  it('scales the pieces to the size and turns them with the item', () => {
    const [piece] = itemFootprint(
      { position: { x: 10, y: 0 }, rotation: Math.PI / 2 },
      shapes.shelf!,
    )
    // The triangle's front left corner (-0.5, -0.5) ends up at the item's right front after a quarter turn.
    expect(piece!.map((p) => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100])).toEqual([
      [10.5, -0.5],
      [10.5, 0.5],
      [9.5, -0.5],
    ])
  })
})

describe('findOverlaps with footprints', () => {
  it('lets a chair stand in the empty corner of a round table rectangle', () => {
    // The chair's nearest corner is at (0.7, 0.7); the hexagon's edge there is further in.
    expect(overlapping(planWith(['table', 0, 0], ['chair', 0.9, 0.9]))).toEqual([])
  })

  it('flags a chair pushed into the round table', () => {
    expect(overlapping(planWith(['table', 0, 0], ['chair', 0.6, 0.6]))).toEqual(['i0', 'i1'])
  })

  it('lets an item stand in the gap of an L, and flags one on its seat', () => {
    expect(overlapping(planWith(['sofa', 0, 0], ['chair', -0.5, -0.5]))).toEqual([])
    expect(overlapping(planWith(['sofa', 0, 0], ['chair', -0.5, 0.5]))).toEqual(['i0', 'i1'])
    expect(overlapping(planWith(['sofa', 0, 0], ['chair', 0.5, -0.5]))).toEqual(['i0', 'i1'])
  })

  it('follows the L when the item is turned', () => {
    // Half a turn moves the gap to the back right.
    expect(overlapping(planWith(['sofa', 0, 0, Math.PI], ['chair', 0.5, 0.5]))).toEqual([])
    expect(overlapping(planWith(['sofa', 0, 0, Math.PI], ['chair', -0.5, -0.5]))).toEqual([
      'i0',
      'i1',
    ])
  })

  it('lets two triangles sit back to back along their long sides', () => {
    // The second is the first turned half way round, filling the other half of the square.
    expect(overlapping(planWith(['shelf', 0, 0], ['shelf', 0, 0, Math.PI]))).toEqual([])
    expect(overlapping(planWith(['shelf', 0, 0], ['shelf', -0.2, -0.2, Math.PI]))).toEqual([
      'i0',
      'i1',
    ])
  })

  it('treats items without a footprint as rectangles, as before', () => {
    expect(overlapping(planWith(['chair', 0, 0], ['chair', 0.3, 0.3]))).toEqual(['i0', 'i1'])
    expect(overlapping(planWith(['chair', 0, 0], ['chair', 0.4, 0]))).toEqual([])
  })

  it('checks footprints against walls', () => {
    const fp = new Floorplan()
    fp.load({
      version: 1,
      corners: [
        { id: 'a', x: -2, y: -0.9 },
        { id: 'b', x: 2, y: -0.9 },
      ],
      walls: [{ id: 'w', start: 'a', end: 'b', thickness: 0.2, height: 2.5 }],
      // The sofa's gap side faces the wall: its rectangle reaches y = -1, into the wall, but
      // only the right strip really does.
      items: [
        {
          id: 'in-gap',
          catalogKey: 'chair',
          position: { x: -1.5, y: -0.5 },
          elevation: 0,
          rotation: 0,
        },
        { id: 'sofa', catalogKey: 'sofa', position: { x: 0, y: 0 }, elevation: 0, rotation: 0 },
        {
          id: 'table',
          catalogKey: 'table',
          position: { x: 5, y: -0.1 },
          elevation: 0,
          rotation: 0,
        },
      ],
    })
    expect(overlapping(fp)).toEqual(['sofa'])
  })
})

describe('itemAt with footprints', () => {
  it('does not hit an item in the empty part of its rectangle', () => {
    const fp = planWith(['chair', -0.5, -0.5], ['sofa', 0, 0])
    // The sofa is drawn last, but its gap lets the chair under it be picked.
    expect(itemAt({ x: -0.5, y: -0.5 }, fp, shapeOf)).toBe('i0')
    expect(itemAt({ x: -0.9, y: -0.1 }, fp, shapeOf)).toBeNull()
    expect(itemAt({ x: 0.5, y: 0.5 }, fp, shapeOf)).toBe('i1')
  })
})

describe('findFreeSpot with footprints', () => {
  it('leaves a new item in the gap of an L when it fits there', () => {
    const fp = planWith(['sofa', 0, 0])
    const placed = findFreeSpot(
      { position: { x: -0.5, y: -0.5 }, rotation: 0 },
      shapes.chair!,
      fp,
      shapeOf,
    )
    expect(placed.position).toEqual({ x: -0.5, y: -0.5 })
  })

  it('moves a new item off the seat of an L', () => {
    const fp = planWith(['sofa', 0, 0])
    const placed = findFreeSpot(
      { position: { x: 0.5, y: 0.5 }, rotation: 0 },
      shapes.chair!,
      fp,
      shapeOf,
    )
    expect(placed.position).not.toEqual({ x: 0.5, y: 0.5 })
    fp.addItem({ catalogKey: 'chair', position: placed.position, rotation: placed.rotation })
    expect(overlapping(fp)).toEqual([])
  })
})
