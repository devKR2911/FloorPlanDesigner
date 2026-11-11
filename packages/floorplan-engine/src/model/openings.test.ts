import { describe, expect, it } from 'vitest'
import { Floorplan, FloorplanError, type FloorplanChange } from './floorplan.js'
import {
  fitOffset,
  nearestWall,
  nextDoorSwing,
  openingAt,
  openingOutline,
  snapOpeningOffset,
  unfitOpenings,
  wallClearSpans,
} from './wall-openings.js'

/**
 * A 4 m × 3 m room with 0.2 m walls, its corner at the origin. The walls run counter-clockwise:
 * `south` from (0,0) to (4,0), then `east`, `north` and `west`.
 */
function room() {
  const fp = new Floorplan({ wallThickness: 0.2 })
  const a = fp.addCorner(0, 0)
  const b = fp.addCorner(4, 0)
  const c = fp.addCorner(4, 3)
  const d = fp.addCorner(0, 3)
  return {
    fp,
    corners: { a, b, c, d },
    south: fp.addWall(a, b),
    east: fp.addWall(b, c),
    north: fp.addWall(c, d),
    west: fp.addWall(d, a),
  }
}

/** A single 4 m wall along the x axis, from the origin. */
function loneWall() {
  const fp = new Floorplan({ wallThickness: 0.2 })
  const start = fp.addCorner(0, 0)
  const end = fp.addCorner(4, 0)
  return { fp, start, end, wall: fp.addWall(start, end) }
}

describe('wallClearSpans', () => {
  it('leaves a margin at the free ends of a wall', () => {
    const { fp, wall } = loneWall()
    const span = wallClearSpans(fp.corners, fp.walls).get(wall)!
    expect(span.min).toBeCloseTo(0.05)
    expect(span.max).toBeCloseTo(3.95)
  })

  it('stops at the inside face of a joining wall', () => {
    const { fp, south } = room()
    // The neighbours are 0.2 m thick, so the inside face starts 0.1 m from each corner.
    const span = wallClearSpans(fp.corners, fp.walls).get(south)!
    expect(span.min).toBeCloseTo(0.15)
    expect(span.max).toBeCloseTo(3.85)
  })
})

describe('fitOffset', () => {
  const span = { min: 0, max: 4 }

  it('keeps an offset that already fits', () => {
    expect(fitOffset(2, 1, span, [])).toBe(2)
  })

  it('moves an opening in from the ends', () => {
    expect(fitOffset(0, 1, span, [])).toBe(0.5)
    expect(fitOffset(9, 1, span, [])).toBe(3.5)
  })

  it('moves an opening to the nearer side of another, keeping the gap', () => {
    const other = [{ offset: 2, width: 1 }]
    expect(fitOffset(1.9, 1, span, other)).toBeCloseTo(0.95)
    expect(fitOffset(2.2, 1, span, other)).toBeCloseTo(3.05)
  })

  it('skips a gap that is too narrow', () => {
    const others = [
      { offset: 0.5, width: 1 },
      { offset: 2, width: 1 },
    ]
    // The 0.5 m between the two is too small for 0.9 m, so it goes to the far side.
    expect(fitOffset(1.2, 0.9, span, others)).toBeCloseTo(3)
  })

  it('reports when there is no room at all', () => {
    expect(fitOffset(2, 5, span, [])).toBeNull()
    expect(fitOffset(2, 1, span, [{ offset: 2, width: 3 }])).toBeNull()
  })
})

describe('Floorplan openings', () => {
  it('adds a door with default size, fitted to its wall, with one change', () => {
    const { fp, south } = room()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))

    const id = fp.addOpening({ wallId: south, kind: 'door', offset: 0 })
    expect(fp.getOpening(id)).toEqual({
      id,
      wallId: south,
      kind: 'door',
      offset: 0.6,
      width: 0.9,
      height: 2.1,
      sill: 0,
      hinge: 'start',
      swing: 'front',
    })
    expect(changes).toEqual([{ kind: 'openings', roomsChanged: false }])
    expect(unfitOpenings(fp).size).toBe(0)
  })

  it('gives a window a sill', () => {
    const { fp, south } = room()
    const id = fp.addOpening({ wallId: south, kind: 'window', offset: 2 })
    expect(fp.getOpening(id)).toMatchObject({ width: 1.2, height: 1.2, sill: 0.9, offset: 2 })
  })

  it('puts a second opening beside the first', () => {
    const { fp, south } = room()
    fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    const second = fp.addOpening({ wallId: south, kind: 'door', offset: 2.1 })
    // The first occupies 1.55 to 2.45; the second sits 0.05 m clear of it.
    expect(fp.getOpening(second)!.offset).toBeCloseTo(2.95)
    expect(fp.openingsOf(south).map((opening) => opening.offset)).toEqual([2, 2.95])
  })

  it('refuses an opening that cannot fit, and bad values', () => {
    const { fp, south } = room()
    const add = (changes: object) => () =>
      fp.addOpening({ wallId: south, kind: 'door', offset: 2, ...changes })
    expect(add({ width: 3.8 })).toThrow('no room')
    expect(add({ height: 2.45 })).toThrow('too tall')
    expect(add({ wallId: 'nope' })).toThrow(FloorplanError)
    expect(add({ width: 0 })).toThrow(FloorplanError)
    expect(add({ sill: -1 })).toThrow(FloorplanError)
    expect(fp.openings).toEqual([])
  })

  it('moves, resizes and flips an opening', () => {
    const { fp, south, east } = room()
    const id = fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    fp.updateOpening(id, { offset: 3.9, width: 1, hinge: 'end', swing: 'back' })
    expect(fp.getOpening(id)).toMatchObject({ offset: 3.35, width: 1, hinge: 'end', swing: 'back' })
    fp.updateOpening(id, { wallId: east, offset: 1.5 })
    expect(fp.getOpening(id)).toMatchObject({ wallId: east, offset: 1.5 })
  })

  it('changes nothing when an update cannot fit', () => {
    const { fp, south } = room()
    const id = fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    const before = { ...fp.getOpening(id)! }
    expect(() => fp.updateOpening(id, { width: 5 })).toThrow(FloorplanError)
    expect(() => fp.updateOpening(id, { height: 3 })).toThrow(FloorplanError)
    expect(() => fp.updateOpening('nope', { width: 1 })).toThrow(FloorplanError)
    expect(fp.getOpening(id)).toEqual(before)
  })

  it('removes an opening', () => {
    const { fp, south } = room()
    const id = fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    fp.removeOpening(id)
    expect(fp.openings).toEqual([])
    expect(() => fp.removeOpening(id)).toThrow(FloorplanError)
  })

  it('saves and loads openings', () => {
    const { fp, south } = room()
    fp.addOpening({ wallId: south, kind: 'door', offset: 1 })
    fp.addOpening({ wallId: south, kind: 'window', offset: 3 })
    const copy = new Floorplan()
    copy.load(fp.export())
    expect(copy.openings).toEqual(fp.openings)
  })
})

describe('openings following their wall', () => {
  it('removes the openings of a removed wall, in the same change', () => {
    const { fp, south, east } = room()
    fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    const kept = fp.addOpening({ wallId: east, kind: 'window', offset: 1.5 })
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))
    fp.removeWall(south)
    expect(fp.openings.map((opening) => opening.id)).toEqual([kept])
    expect(changes).toHaveLength(1)
  })

  it('keeps each opening on its half when the wall is split', () => {
    const { fp, wall } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 1 })
    const window = fp.addOpening({ wallId: wall, kind: 'window', offset: 3 })
    fp.addCorner(2, 0)

    expect(fp.walls).toHaveLength(2)
    const secondHalf = fp.walls.find((w) => w.id !== wall)!
    expect(fp.getOpening(door)).toMatchObject({ wallId: wall, offset: 1 })
    // The second half starts at the new corner, so the window is now 1 m along it.
    expect(fp.getOpening(window)!.wallId).toBe(secondHalf.id)
    expect(fp.getOpening(window)!.offset).toBeCloseTo(1)
    expect(unfitOpenings(fp).size).toBe(0)
  })

  it('moves an opening aside when a corner lands inside it', () => {
    const { fp, wall } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 2 })
    fp.addCorner(2.2, 0)
    // Its centre is on the first half, which now ends at 2.2 m.
    expect(fp.getOpening(door)!.wallId).toBe(wall)
    expect(fp.getOpening(door)!.offset).toBeCloseTo(2.2 - 0.05 - 0.45)
  })

  it('keeps an opening where it is on the plan when a corner slides along the wall', () => {
    const { fp, wall, start } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 3 })
    fp.moveCorner(start, -1, 0, { resolve: false })
    // The wall now starts a metre further back, so the same spot is 4 m along it.
    expect(fp.getOpening(door)!.offset).toBeCloseTo(4)
  })

  it('pushes an opening along a shrinking wall, and restores it when the wall grows back', () => {
    const { fp, wall, end } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 3 })

    fp.moveCorner(end, 2, 0, { resolve: false })
    expect(fp.getOpening(door)!.offset).toBeCloseTo(2 - 0.05 - 0.45)
    expect(unfitOpenings(fp).size).toBe(0)

    // Too short for the door at all: it is kept and reported, not removed.
    fp.moveCorner(end, 0.5, 0, { resolve: false })
    expect(fp.getOpening(door)).toBeDefined()
    expect(unfitOpenings(fp)).toEqual(new Set([door]))

    fp.moveCorner(end, 4, 0, { resolve: false })
    expect(fp.getOpening(door)!.offset).toBeCloseTo(3)
    expect(unfitOpenings(fp).size).toBe(0)
  })

  it('carries its openings when a wall is moved as a whole', () => {
    const { fp, wall, start, end } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 3 })
    fp.moveCorners([start, end], 1.5, 2, { resolve: false })
    expect(fp.getOpening(door)!.offset).toBeCloseTo(3)
    fp.moveCorners([start, end], -1.5, -2)
    expect(fp.getOpening(door)!.offset).toBeCloseTo(3)
  })

  it('follows a wall that turns', () => {
    const { fp, wall, end } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 2 })
    fp.moveCorner(end, 0, 4, { resolve: false })
    // The anchor (2, 0) projects onto the turned wall at its start, so the door waits there.
    expect(fp.getOpening(door)!.offset).toBeCloseTo(0.05 + 0.45)
    fp.moveCorner(end, 4, 0, { resolve: false })
    expect(fp.getOpening(door)!.offset).toBeCloseTo(2)
  })

  it('reports an opening made too tall by lowering its wall', () => {
    const { fp, wall } = loneWall()
    const door = fp.addOpening({ wallId: wall, kind: 'door', offset: 2 })
    fp.updateWall(wall, { height: 2 })
    expect(unfitOpenings(fp)).toEqual(new Set([door]))
    fp.updateWall(wall, { height: 2.5 })
    expect(unfitOpenings(fp).size).toBe(0)
  })
})

describe('opening geometry', () => {
  it('outlines an opening across the thickness of its wall', () => {
    const outline = openingOutline({ offset: 2, width: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 }, 0.2)
    expect(outline.map((p) => [p.x, p.y])).toEqual([
      [1.5, -0.1],
      [2.5, -0.1],
      [2.5, 0.1],
      [1.5, 0.1],
    ])
  })

  it('finds the opening under a point', () => {
    const { fp, south } = room()
    const door = fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    expect(openingAt({ x: 2.3, y: 0.05 }, fp, 0.05)).toBe(door)
    expect(openingAt({ x: 2.3, y: 0.14 }, fp, 0.05)).toBe(door)
    expect(openingAt({ x: 2.3, y: 0.2 }, fp, 0.05)).toBeNull()
    expect(openingAt({ x: 2.6, y: 0 }, fp, 0.05)).toBeNull()
  })

  it('finds the nearest wall and where along it a point falls', () => {
    const { fp, south, east } = room()
    expect(nearestWall({ x: 1, y: 0.4 }, fp)).toMatchObject({ wallId: south, along: 1 })
    const nearEast = nearestWall({ x: 3.8, y: 2 }, fp)!
    expect(nearEast.wallId).toBe(east)
    expect(nearEast.along).toBeCloseTo(2)
    expect(nearEast.distance).toBeCloseTo(0.2)
    expect(nearestWall({ x: 0, y: 0 }, new Floorplan())).toBeNull()
  })

  it('snaps a dragged offset to the middle of the wall, or to 5 cm', () => {
    expect(snapOpeningOffset(1.97, 4)).toBe(2)
    expect(snapOpeningOffset(1.23, 4)).toBe(1.25)
    expect(snapOpeningOffset(1.23, 4, { enabled: false, step: 0.05, centre: 0.08 })).toBe(1.23)
  })

  it('steps a door through its four ways to hang', () => {
    const seen: string[] = []
    let door: { hinge: 'start' | 'end'; swing: 'front' | 'back' } = {
      hinge: 'start',
      swing: 'front',
    }
    for (let i = 0; i < 4; i++) {
      seen.push(`${door.hinge}/${door.swing}`)
      door = nextDoorSwing(door)
    }
    expect(seen).toEqual(['start/front', 'end/front', 'start/back', 'end/back'])
    expect(door).toEqual({ hinge: 'start', swing: 'front' })
  })
})
