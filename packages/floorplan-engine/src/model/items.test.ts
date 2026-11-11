import { describe, expect, it } from 'vitest'
import { Floorplan, FloorplanError, type FloorplanChange } from './floorplan.js'
import { ItemCatalog, FALLBACK_ITEM_SIZE } from './item-catalog.js'
import {
  convexPolygonsOverlap,
  findOverlaps,
  itemAt,
  itemOutline,
  normalizeAngle,
} from './item-geometry.js'
import { findFreeSpot, placeItem } from './placement.js'

const sofa = { width: 2, height: 0.9, depth: 0.8 }
const chair = { width: 0.4, height: 0.9, depth: 0.4 }
const sizes: Record<string, typeof sofa> = { sofa, chair }
const sizeOf = (key: string) => sizes[key] ?? FALLBACK_ITEM_SIZE

/** A 4 m × 3 m room with 0.2 m walls, its corner at the origin. Inside faces at 0.1 and 3.9 / 2.9. */
function room(): Floorplan {
  const fp = new Floorplan({ wallThickness: 0.2 })
  const corners = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ].map(([x, y]) => fp.addCorner(x!, y!))
  corners.forEach((id, i) => fp.addWall(id, corners[(i + 1) % corners.length]!))
  return fp
}

function expectPoint(actual: { x: number; y: number }, x: number, y: number): void {
  expect(actual.x).toBeCloseTo(x)
  expect(actual.y).toBeCloseTo(y)
}

describe('Floorplan items', () => {
  it('adds, updates and removes items, with one change each', () => {
    const fp = new Floorplan()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))

    const id = fp.addItem({ catalogKey: 'sofa', position: { x: 1, y: 2 } })
    expect(fp.getItem(id)).toEqual({
      id,
      catalogKey: 'sofa',
      position: { x: 1, y: 2 },
      elevation: 0,
      rotation: 0,
    })
    fp.updateItem(id, { position: { x: 3, y: 1 }, rotation: Math.PI / 2 })
    expect(fp.getItem(id)!.position).toEqual({ x: 3, y: 1 })
    expect(fp.getItem(id)!.rotation).toBeCloseTo(Math.PI / 2)
    fp.removeItem(id)
    expect(fp.items).toEqual([])
    // The update names the item it edited, so that undo can join a run of edits to it.
    expect(changes).toEqual([
      { kind: 'items', roomsChanged: false },
      { kind: 'items', roomsChanged: false, target: id },
      { kind: 'items', roomsChanged: false },
    ])
  })

  it('keeps rotations within one turn', () => {
    const fp = new Floorplan()
    const id = fp.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 }, rotation: 2 * Math.PI })
    expect(fp.getItem(id)!.rotation).toBe(0)
    fp.updateItem(id, { rotation: (5 * Math.PI) / 2 })
    expect(fp.getItem(id)!.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('refuses unknown ids and bad values', () => {
    const fp = new Floorplan()
    expect(() => fp.updateItem('nope', { rotation: 1 })).toThrow(FloorplanError)
    expect(() => fp.removeItem('nope')).toThrow(FloorplanError)
    expect(() => fp.addItem({ catalogKey: '', position: { x: 0, y: 0 } })).toThrow(FloorplanError)
    expect(() => fp.addItem({ catalogKey: 'sofa', position: { x: NaN, y: 0 } })).toThrow(
      FloorplanError,
    )
    expect(() =>
      fp.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 }, elevation: -1 }),
    ).toThrow(FloorplanError)
  })

  it('exports items so they pass the plan schema and load back', () => {
    const fp = room()
    fp.addItem({ catalogKey: 'sofa', position: { x: 2, y: 1 }, rotation: 1 })
    const copy = new Floorplan()
    copy.load(fp.export())
    expect(copy.items).toEqual(fp.items)
    expect(copy.rooms).toHaveLength(1)
  })

  it('does not touch the rooms when items change', () => {
    const fp = room()
    const roomsBefore = fp.rooms
    fp.addItem({ catalogKey: 'sofa', position: { x: 2, y: 1 } })
    expect(fp.rooms).toBe(roomsBefore)
  })
})

describe('ItemCatalog', () => {
  it('looks up sizes, with a fallback for unknown keys', () => {
    const catalog = new ItemCatalog()
    let changes = 0
    catalog.on('change', () => changes++)
    catalog.set([{ key: 'sofa', model: '/sofa.glb', size: sofa, placement: 'floor' }])
    expect(catalog.sizeOf('sofa')).toEqual(sofa)
    expect(catalog.sizeOf('missing')).toEqual(FALLBACK_ITEM_SIZE)
    expect(catalog.get('sofa')!.model).toBe('/sofa.glb')
    expect(changes).toBe(1)
  })

  it('refuses an invalid definition', () => {
    const catalog = new ItemCatalog()
    expect(() =>
      catalog.set([
        { key: 'sofa', model: '/sofa.glb', size: { ...sofa, width: 0 }, placement: 'floor' },
      ]),
    ).toThrow()
  })
})

describe('item geometry', () => {
  it('normalises angles into (-π, π]', () => {
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(Object.is(normalizeAngle(-2 * Math.PI), 0)).toBe(true)
  })

  it('outlines an item with its back up the page at rotation 0', () => {
    const outline = itemOutline({ position: { x: 1, y: 1 }, rotation: 0 }, sofa)
    expectPoint(outline[0]!, 0, 0.6)
    expectPoint(outline[1]!, 2, 0.6)
    expectPoint(outline[2]!, 2, 1.4)
    expectPoint(outline[3]!, 0, 1.4)
  })

  it('turns the outline counter-clockwise', () => {
    const outline = itemOutline({ position: { x: 0, y: 0 }, rotation: Math.PI / 2 }, sofa)
    // Turned a quarter, the width runs up the page and the back faces -x.
    expectPoint(outline[0]!, 0.4, -1)
    expectPoint(outline[2]!, -0.4, 1)
  })

  it('counts shapes that overlap, but not shapes that only touch', () => {
    const a = itemOutline({ position: { x: 0, y: 0 }, rotation: 0 }, chair)
    const touching = itemOutline({ position: { x: 0.4, y: 0 }, rotation: 0 }, chair)
    const overlapping = itemOutline({ position: { x: 0.3, y: 0 }, rotation: 0 }, chair)
    const turned = itemOutline({ position: { x: 0.45, y: 0 }, rotation: Math.PI / 4 }, chair)
    expect(convexPolygonsOverlap(a, touching)).toBe(false)
    expect(convexPolygonsOverlap(a, overlapping)).toBe(true)
    // Turned 45°, the chair's corner reaches 0.28 m towards the first chair.
    expect(convexPolygonsOverlap(a, turned)).toBe(true)
  })

  it('finds items that overlap walls or each other', () => {
    const fp = room()
    const free = fp.addItem({ catalogKey: 'chair', position: { x: 2, y: 1.5 } })
    const inWall = fp.addItem({ catalogKey: 'sofa', position: { x: 2, y: 0.3 } })
    const a = fp.addItem({ catalogKey: 'chair', position: { x: 1, y: 2.5 } })
    const b = fp.addItem({ catalogKey: 'chair', position: { x: 1.2, y: 2.5 } })
    const flush = fp.addItem({ catalogKey: 'sofa', position: { x: 2.8, y: 2.5 } })
    const overlaps = findOverlaps(fp, sizeOf)
    expect(overlaps).toEqual(new Set([inWall, a, b]))
    expect(overlaps.has(free)).toBe(false)
    expect(overlaps.has(flush)).toBe(false)
  })

  it('finds the item under a point, the last added first', () => {
    const fp = new Floorplan()
    const under = fp.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 } })
    const over = fp.addItem({ catalogKey: 'chair', position: { x: 0.5, y: 0 } })
    expect(itemAt({ x: 0.5, y: 0 }, fp, sizeOf)).toBe(over)
    expect(itemAt({ x: -0.5, y: 0 }, fp, sizeOf)).toBe(under)
    expect(itemAt({ x: 5, y: 0 }, fp, sizeOf)).toBeNull()
  })
})

describe('placeItem', () => {
  it('rounds to the grid away from walls and keeps the rotation', () => {
    const result = placeItem({ position: { x: 2.03, y: 1.46 }, rotation: 0.3 }, chair, room())
    expect(result).toEqual({ position: { x: 2, y: 1.5 }, rotation: 0.3, walls: [] })
  })

  it('puts an item flush against a wall, facing into the room', () => {
    const fp = room()
    // The north wall's inside face is at y = 2.9. The sofa's back is 0.15 m short of it.
    const result = placeItem({ position: { x: 2.03, y: 2.35 }, rotation: 0.4 }, sofa, fp)
    expectPoint(result.position, 2.03, 2.5)
    expect(result.rotation).toBeCloseTo(0)
    expect(result.walls).toHaveLength(1)
  })

  it('turns the item to face away from the wall it snaps to', () => {
    const fp = room()
    // The south wall's inside face is at y = 0.1, so the back must face -y: half a turn.
    const south = placeItem({ position: { x: 2, y: 0.6 }, rotation: 0 }, sofa, fp)
    expectPoint(south.position, 2, 0.5)
    expect(Math.abs(south.rotation)).toBeCloseTo(Math.PI)
    // The east wall's inside face is at x = 3.9, so the back faces +x: a quarter turn clockwise.
    const east = placeItem({ position: { x: 3.55, y: 1.5 }, rotation: 0 }, chair, fp)
    expectPoint(east.position, 3.7, 1.5)
    expect(east.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('pulls an item pushed into a wall back out', () => {
    const result = placeItem({ position: { x: 2, y: 2.65 }, rotation: 0 }, sofa, room())
    expectPoint(result.position, 2, 2.5)
  })

  it('sits an item in a corner, flush against both walls', () => {
    const fp = room()
    // Near the north-east corner: back to the north wall, right side towards the east wall.
    const result = placeItem({ position: { x: 2.8, y: 2.45 }, rotation: 0 }, sofa, fp)
    expectPoint(result.position, 2.9, 2.5)
    expect(result.walls).toHaveLength(2)
  })

  it('snaps to the outside face of a wall from outside the room', () => {
    // The north wall's outside face is at y = 3.1; from there the back faces -y.
    const result = placeItem({ position: { x: 2, y: 3.6 }, rotation: 0 }, sofa, room())
    expectPoint(result.position, 2, 3.5)
    expect(Math.abs(result.rotation)).toBeCloseTo(Math.PI)
  })

  it('ignores a wall the item is beyond the end of', () => {
    const fp = new Floorplan({ wallThickness: 0.2 })
    fp.addWall(fp.addCorner(0, 0), fp.addCorner(2, 0))
    const result = placeItem({ position: { x: 3, y: 0.5 }, rotation: 0 }, chair, fp)
    expect(result.walls).toEqual([])
  })

  it('uses the request as it is when snapping is off', () => {
    const result = placeItem({ position: { x: 2.03, y: 2.35 }, rotation: 0.4 }, sofa, room(), {
      enabled: false,
      wallDistance: 0.2,
      grid: 0.1,
    })
    expect(result).toEqual({ position: { x: 2.03, y: 2.35 }, rotation: 0.4, walls: [] })
  })
})

describe('findFreeSpot', () => {
  const free = (fp: Floorplan, id: string) => !findOverlaps(fp, sizeOf).has(id)

  it('uses the requested place when it is free', () => {
    const spot = findFreeSpot({ position: { x: 2, y: 1.5 }, rotation: 0 }, chair, room(), sizeOf)
    expect(spot.position).toEqual({ x: 2, y: 1.5 })
  })

  it('moves a new item off an item that is already there', () => {
    const fp = room()
    fp.addItem({ catalogKey: 'chair', position: { x: 2, y: 1.5 } })
    const spot = findFreeSpot({ position: { x: 2, y: 1.5 }, rotation: 0 }, chair, fp, sizeOf)
    const second = fp.addItem({ catalogKey: 'chair', ...spot })
    expect(free(fp, second)).toBe(true)
    // The nearest ring that clears a 0.4 m chair is 0.6 m out.
    expect(Math.hypot(spot.position.x - 2, spot.position.y - 1.5)).toBeLessThan(0.7)
  })

  it('finds room for several of the same item in turn', () => {
    const fp = room()
    for (let i = 0; i < 6; i++) {
      const spot = findFreeSpot({ position: { x: 2, y: 1.5 }, rotation: 0 }, chair, fp, sizeOf)
      fp.addItem({ catalogKey: 'chair', ...spot })
    }
    expect(findOverlaps(fp, sizeOf).size).toBe(0)
  })

  it('keeps a new item out of the walls', () => {
    const fp = room()
    // Asked for on top of the south wall.
    const spot = findFreeSpot({ position: { x: 2, y: 0 }, rotation: 0 }, sofa, fp, sizeOf)
    const id = fp.addItem({ catalogKey: 'sofa', ...spot })
    expect(free(fp, id)).toBe(true)
  })

  it('falls back to the requested place when nothing is free within reach', () => {
    const fp = new Floorplan()
    // One item far larger than the area searched.
    fp.addItem({ catalogKey: 'huge', position: { x: 0, y: 0 } })
    const huge = { width: 40, height: 1, depth: 40 }
    const spot = findFreeSpot({ position: { x: 0, y: 0 }, rotation: 0 }, chair, fp, () => huge)
    expect(spot.position).toEqual({ x: 0, y: 0 })
  })
})
