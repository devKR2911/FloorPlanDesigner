import { describe, expect, it, vi } from 'vitest'
import { ZodError } from 'zod'
import { createEmptyPlan, planSchema, type Plan } from '../schema/plan.js'
import { Floorplan, FloorplanError, type FloorplanChange } from './floorplan.js'

/** A 4 m square room drawn counter-clockwise. */
function squarePlan(): Plan {
  return {
    version: 1,
    corners: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
      { id: 'c', x: 4, y: 4 },
      { id: 'd', x: 0, y: 4 },
    ],
    walls: [
      { id: 'ab', start: 'a', end: 'b', thickness: 0.2, height: 2.5 },
      { id: 'bc', start: 'b', end: 'c', thickness: 0.2, height: 2.5 },
      { id: 'cd', start: 'c', end: 'd', thickness: 0.2, height: 2.5 },
      { id: 'da', start: 'd', end: 'a', thickness: 0.2, height: 2.5 },
    ],
    items: [{ id: 'i1', catalogKey: 'sofa', position: { x: 1, y: 0, z: 1 }, rotation: 0 }],
  }
}

function loaded(plan: Plan = squarePlan()): Floorplan {
  const fp = new Floorplan()
  fp.load(plan)
  return fp
}

const pairs = (fp: Floorplan) =>
  fp.walls.map((wall) => [wall.start, wall.end].sort().join('-')).sort()

describe('Floorplan load and export', () => {
  it('starts empty', () => {
    const fp = new Floorplan()
    expect(fp.export()).toEqual(createEmptyPlan())
    expect(fp.rooms).toEqual([])
  })

  it('round-trips a plan and detects its room', () => {
    const fp = loaded()
    expect(fp.export()).toEqual(squarePlan())
    expect(fp.rooms).toHaveLength(1)
    expect(fp.rooms[0]!.area).toBe(16)
  })

  it('rejects an invalid plan and keeps the current one', () => {
    const fp = loaded()
    expect(() => fp.load({ version: 1 })).toThrow(ZodError)
    expect(fp.corners).toHaveLength(4)
  })

  it('exports copies, so callers cannot change the model', () => {
    const fp = loaded()
    const exported = fp.export()
    exported.corners[0]!.x = 99
    exported.items[0]!.rotation = 1
    expect(fp.getCorner('a')!.x).toBe(0)
    expect(fp.items[0]!.rotation).toBe(0)
  })

  it('applies the default options', () => {
    expect(new Floorplan().options).toEqual({
      cornerTolerance: 0.05,
      wallThickness: 0.15,
      wallHeight: 2.5,
    })
  })
})

describe('adding corners and walls', () => {
  it('generates ids and uses the default wall size', () => {
    const fp = new Floorplan({ wallThickness: 0.3, wallHeight: 3 })
    const a = fp.addCorner(0, 0)
    const b = fp.addCorner(5, 0)
    const wallId = fp.addWall(a, b)
    expect(a).not.toBe(b)
    expect(fp.getWall(wallId)).toEqual({ id: wallId, start: a, end: b, thickness: 0.3, height: 3 })
    expect(planSchema.safeParse(fp.export()).success).toBe(true)
  })

  it('returns the existing corner for a point within tolerance', () => {
    const fp = new Floorplan()
    const a = fp.addCorner(0, 0)
    expect(fp.addCorner(0.02, -0.03)).toBe(a)
    expect(fp.corners).toHaveLength(1)
  })

  it('refuses a wall from a corner to itself', () => {
    const fp = new Floorplan()
    const a = fp.addCorner(0, 0)
    expect(() => fp.addWall(a, a)).toThrow(FloorplanError)
  })

  it('refuses a second wall between the same corners, in either direction', () => {
    const fp = loaded()
    expect(() => fp.addWall('a', 'b')).toThrow(FloorplanError)
    expect(() => fp.addWall('b', 'a')).toThrow(FloorplanError)
  })

  it('refuses unknown corners and bad sizes', () => {
    const fp = loaded()
    expect(() => fp.addWall('a', 'nope')).toThrow(FloorplanError)
    expect(() => fp.addWall('a', 'c', { thickness: 0 })).toThrow(FloorplanError)
    expect(() => fp.updateWall('ab', { height: -1 })).toThrow(FloorplanError)
  })

  it('splits a wall when a corner is added on it', () => {
    const fp = loaded()
    const m = fp.addCorner(2, 0.01)
    expect(fp.getCorner(m)).toEqual({ id: m, x: 2, y: 0 })
    expect(fp.walls).toHaveLength(5)
    expect(pairs(fp)).toEqual(
      expectedPairs([
        ['a', m],
        [m, 'b'],
        ['b', 'c'],
        ['c', 'd'],
        ['d', 'a'],
      ]),
    )
    // The shortened wall keeps its id.
    expect(fp.getWall('ab')).toMatchObject({ start: 'a', end: m })
    const halves = fp.wallsAt(m)
    expect(halves.map((wall) => wall.thickness)).toEqual([0.2, 0.2])
    expect(fp.rooms[0]!.cornerIds).toHaveLength(5)
  })
})

describe('moving corners', () => {
  it('moves a corner and reshapes the room', () => {
    const fp = loaded()
    fp.moveCorner('c', 4, 6)
    expect(fp.getCorner('c')).toEqual({ id: 'c', x: 4, y: 6 })
    expect(fp.rooms[0]!.area).toBe(20)
    expect(fp.rooms[0]!.id).toBe('a-b-c-d')
  })

  it('merges a corner dropped onto another and re-points its walls', () => {
    const fp = loaded()
    fp.moveCorner('c', 0.02, 4.01)
    expect(fp.getCorner('c')).toBeUndefined()
    expect(fp.getCorner('d')).toEqual({ id: 'd', x: 0, y: 4 })
    // Wall c-d collapsed; b-c now runs b-d.
    expect(pairs(fp)).toEqual(['a-b', 'a-d', 'b-d'])
    expect(fp.rooms).toHaveLength(1)
    expect(fp.rooms[0]!.id).toBe('a-b-d')
    expect(planSchema.safeParse(fp.export()).success).toBe(true)
  })

  it('drops a duplicate wall created by a merge', () => {
    const fp = loaded()
    fp.addWall('a', 'c')
    // Dropping c onto b would turn a-c into a second a-b wall.
    fp.moveCorner('c', 4, 0)
    expect(pairs(fp)).toEqual(['a-b', 'a-d', 'b-d'])
    expect(planSchema.safeParse(fp.export()).success).toBe(true)
  })

  it('splits a wall when a corner is dropped onto it', () => {
    const fp = loaded()
    const x = fp.addCorner(2, 2)
    fp.addWall('a', x)
    fp.moveCorner(x, 4.03, 2)
    // Moved perpendicular onto the wall.
    expect(fp.getCorner(x)).toEqual({ id: x, x: 4, y: 2 })
    expect(fp.walls).toHaveLength(6)
    expect(fp.wallsAt(x)).toHaveLength(3)
    // The triangle a-b-x and the quadrilateral a-x-c-d.
    expect(fp.rooms.map((room) => room.area).sort()).toEqual([12, 4])
  })

  it('does not split the walls attached to the moving corner', () => {
    const fp = loaded()
    fp.moveCorner('b', 2, 0)
    expect(fp.walls).toHaveLength(4)
    expect(fp.getCorner('b')).toEqual({ id: 'b', x: 2, y: 0 })
  })

  it('refuses an unknown corner', () => {
    expect(() => loaded().moveCorner('nope', 0, 0)).toThrow(FloorplanError)
  })

  it('does not merge or split until resolved when asked not to', () => {
    const fp = loaded()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))

    // Carry c across d and leave it on top of d: no merge yet.
    fp.moveCorner('c', 0, 4, { resolve: false })
    expect(fp.corners).toHaveLength(4)
    expect(changes).toEqual([{ kind: 'corners', roomsChanged: false }])

    // Resolving merges into d and reports d as the corner at that position.
    expect(fp.resolveCorner('c')).toBe('d')
    expect(fp.getCorner('c')).toBeUndefined()
    expect(pairs(fp)).toEqual(['a-b', 'a-d', 'b-d'])
    expect(changes).toHaveLength(2)
    expect(changes[1]).toEqual({ kind: 'walls', roomsChanged: true })
  })

  it('resolving a corner that sits on nothing changes nothing and stays quiet', () => {
    const fp = loaded()
    const listener = vi.fn()
    fp.on('change', listener)
    expect(fp.resolveCorner('c')).toBe('c')
    expect(listener).not.toHaveBeenCalled()
  })

  it('moves several corners together as one change', () => {
    const fp = loaded()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))
    fp.moveCorners(['c', 'd'], 0, 2)
    expect(fp.getCorner('c')).toEqual({ id: 'c', x: 4, y: 6 })
    expect(fp.getCorner('d')).toEqual({ id: 'd', x: 0, y: 6 })
    expect(fp.rooms[0]!.area).toBe(24)
    expect(changes).toEqual([{ kind: 'corners', roomsChanged: false }])
  })

  it('resolves each corner after moving several', () => {
    const fp = loaded()
    // Move the top wall down onto the bottom one: c lands on b and d on a.
    fp.moveCorners(['c', 'd'], 0, -4)
    expect(fp.corners.map((corner) => corner.id).sort()).toEqual(['a', 'b'])
    expect(pairs(fp)).toEqual(['a-b'])
    expect(planSchema.safeParse(fp.export()).success).toBe(true)
  })
})

describe('removing', () => {
  it('removes a wall and keeps corners that other walls still use', () => {
    const fp = loaded()
    fp.removeWall('ab')
    expect(fp.walls).toHaveLength(3)
    expect(fp.corners).toHaveLength(4)
    expect(fp.rooms).toEqual([])
  })

  it('removes a corner stranded by removing its last wall', () => {
    const fp = new Floorplan()
    const a = fp.addCorner(0, 0)
    const b = fp.addCorner(4, 0)
    const c = fp.addCorner(8, 0)
    fp.addWall(a, b)
    const bc = fp.addWall(b, c)
    fp.removeWall(bc)
    expect(fp.corners.map((corner) => corner.id)).toEqual([a, b])
  })

  it('leaves a corner that never had walls alone', () => {
    const fp = new Floorplan()
    const lone = fp.addCorner(10, 10)
    const a = fp.addCorner(0, 0)
    const b = fp.addCorner(4, 0)
    fp.removeWall(fp.addWall(a, b))
    expect(fp.corners.map((corner) => corner.id)).toEqual([lone])
  })

  it('removes a corner with its walls and any corner they strand', () => {
    const fp = loaded()
    const x = fp.addCorner(6, 2)
    fp.addWall('b', x)
    fp.removeCorner('b')
    expect(fp.getCorner('b')).toBeUndefined()
    expect(fp.getCorner(x)).toBeUndefined()
    expect(pairs(fp)).toEqual(['a-d', 'c-d'])
    expect(fp.rooms).toEqual([])
  })

  it('refuses unknown ids', () => {
    expect(() => loaded().removeCorner('nope')).toThrow(FloorplanError)
    expect(() => loaded().removeWall('nope')).toThrow(FloorplanError)
  })
})

describe('rooms and wall sides', () => {
  it('gives each room its outline, interior, area and centroid', () => {
    const room = loaded().rooms[0]!
    expect(room.polygon).toHaveLength(4)
    expect(room.centroid).toEqual({ x: 2, y: 2 })
    // Walls are 0.2 m thick, so the interior is 0.1 m inside the centrelines.
    expect(room.interior.map((p) => [p.x, p.y])).toEqual([
      [0.1, 0.1],
      [3.9, 0.1],
      [3.9, 3.9],
      [0.1, 3.9],
    ])
  })

  it('reports the room on each side of a wall', () => {
    const fp = loaded()
    fp.moveCorner('c', 8, 4)
    fp.moveCorner('b', 8, 0)
    const top = fp.addCorner(4, 4)
    const bottom = fp.addCorner(4, 0)
    const divider = fp.addWall(bottom, top)
    expect(fp.rooms).toHaveLength(2)
    const { front, back } = fp.roomsOf(divider)
    expect(front?.cornerIds).toContain('a')
    expect(back?.cornerIds).toContain('b')
    // Wall ab was shortened to a-bottom by the split and borders only the left room.
    expect(fp.roomsOf('ab')).toEqual({ front, back: null })
    expect(fp.getRoom(front!.id)).toBe(front)
    // A dangling wall borders no room.
    const dangling = fp.addWall('b', fp.addCorner(10, 0))
    expect(fp.roomsOf(dangling)).toEqual({ front: null, back: null })
  })

  it('updates the interior when a wall gets thicker', () => {
    const fp = loaded()
    fp.updateWall('ab', { thickness: 1 })
    expect(fp.rooms[0]!.interior[0]).toEqual({ x: 0.1, y: 0.5 })
  })
})

describe('change events', () => {
  it('fires once per operation with the kind of change', () => {
    const fp = new Floorplan()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))

    const a = fp.addCorner(0, 0)
    const b = fp.addCorner(4, 0)
    const c = fp.addCorner(4, 4)
    fp.addWall(a, b)
    fp.addWall(b, c)
    fp.addWall(c, a)
    fp.moveCorner(c, 4, 5)
    fp.updateWall(fp.walls[0]!.id, { height: 3 })
    fp.load(createEmptyPlan())

    expect(changes).toEqual([
      { kind: 'corners', roomsChanged: false },
      { kind: 'corners', roomsChanged: false },
      { kind: 'corners', roomsChanged: false },
      { kind: 'walls', roomsChanged: false },
      { kind: 'walls', roomsChanged: false },
      { kind: 'walls', roomsChanged: true },
      { kind: 'corners', roomsChanged: false },
      { kind: 'walls', roomsChanged: false },
      { kind: 'load', roomsChanged: true },
    ])
  })

  it('does not fire when adding a corner that already exists', () => {
    const fp = new Floorplan()
    fp.addCorner(0, 0)
    const listener = vi.fn()
    fp.on('change', listener)
    fp.addCorner(0.01, 0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('stops after unsubscribing', () => {
    const fp = new Floorplan()
    const listener = vi.fn()
    fp.on('change', listener)()
    fp.addCorner(0, 0)
    expect(listener).not.toHaveBeenCalled()
  })
})

/** The same normal form as `pairs`, for a list of corner id pairs. */
function expectedPairs(list: [string, string][]): string[] {
  return list.map((pair) => [...pair].sort().join('-')).sort()
}
