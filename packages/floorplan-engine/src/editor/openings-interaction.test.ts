import { beforeEach, describe, expect, it } from 'vitest'
import { SelectionStore } from '../core/selection.js'
import { Floorplan } from '../model/floorplan.js'
import type { Point } from '../model/geometry.js'
import { hitTest } from './hit-testing.js'
import { Interaction, type PointerInput } from './interaction.js'
import { unitGrid } from '../model/units.js'
import { defaultSnapSettings } from './snapping.js'
import { Viewport } from './viewport.js'

let floorplan: Floorplan
let viewport: Viewport
let selection: SelectionStore
let interaction: Interaction
/** The walls of a 4 m square room with 0.2 m walls: `south` runs from (0,0) to (4,0). */
let walls: { south: string; east: string; north: string; west: string }

beforeEach(() => {
  floorplan = new Floorplan({ wallThickness: 0.2 })
  const ids = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ].map(([x, y]) => floorplan.addCorner(x!, y!))
  const [south, east, north, west] = ids.map((id, i) =>
    floorplan.addWall(id, ids[(i + 1) % ids.length]!),
  )
  walls = { south: south!, east: east!, north: north!, west: west! }
  viewport = new Viewport(1000, 1000)
  viewport.scale = 100
  viewport.centreOn({ x: 2, y: 2 })
  selection = new SelectionStore()
  interaction = new Interaction(floorplan, viewport, { ...defaultSnapSettings }, { selection })
})

function at(p: Point, extra: Partial<PointerInput> = {}): PointerInput {
  return { world: p, screen: viewport.toScreen(p), button: 0, ...extra }
}

function click(p: Point) {
  interaction.pointerDown(at(p))
  interaction.pointerUp(at(p))
}

function drag(from: Point, to: Point, extra: Partial<PointerInput> = {}) {
  interaction.pointerDown(at(from, extra))
  interaction.pointerMove(at({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, extra))
  interaction.pointerMove(at(to, extra))
  interaction.pointerUp(at(to, extra))
}

const addDoor = (offset: number, wallId = walls.south) =>
  floorplan.addOpening({ wallId, kind: 'door', offset })
const offsetOf = (id: string) => floorplan.getOpening(id)!.offset

describe('hit testing openings', () => {
  it('finds a door before the wall it is in, and a corner before either', () => {
    const door = addDoor(0.6)
    expect(hitTest({ x: 0.6, y: 0.05 }, floorplan, 0.08)).toEqual({ kind: 'opening', id: door })
    expect(hitTest({ x: 1.5, y: 0.05 }, floorplan, 0.08)).toEqual({
      kind: 'wall',
      id: walls.south,
    })
    expect(hitTest({ x: 0.02, y: 0.02 }, floorplan, 0.08)?.kind).toBe('corner')
  })
})

describe('openings in move mode', () => {
  it('selects a door by clicking it', () => {
    const door = addDoor(2)
    click({ x: 2.2, y: 0 })
    expect(interaction.selection).toEqual({ kind: 'opening', id: door })
  })

  it('slides a door along its wall by where it was grabbed, in 5 cm steps', () => {
    const door = addDoor(1)
    interaction.pointerDown(at({ x: 1.2, y: 0 }))
    interaction.pointerMove(at({ x: 2, y: 0.03 }))
    expect(interaction.draggedOpening).toBe(door)
    interaction.pointerMove(at({ x: 3.03, y: 0.05 }))
    interaction.pointerUp(at({ x: 3.03, y: 0.05 }))
    // Grabbed 0.2 m past its middle, so the middle goes to 2.83, then to the step.
    expect(offsetOf(door)).toBeCloseTo(2.85)
    expect(interaction.draggedOpening).toBeNull()
    expect(interaction.selection).toEqual({ kind: 'opening', id: door })
  })

  it('snaps to the middle of the wall', () => {
    const door = addDoor(1)
    drag({ x: 1, y: 0 }, { x: 2.04, y: 0 })
    expect(offsetOf(door)).toBe(2)
  })

  it('does not snap while Alt is held', () => {
    const door = addDoor(1)
    drag({ x: 1, y: 0 }, { x: 2.83, y: 0 }, { altKey: true })
    expect(offsetOf(door)).toBeCloseTo(2.83)
  })

  it('stops at the end of the wall', () => {
    const door = addDoor(2)
    drag({ x: 2, y: 0 }, { x: 5, y: -0.5 })
    // The inside face ends 0.1 m before the corner, and 0.05 m is kept clear.
    expect(offsetOf(door)).toBeCloseTo(4 - 0.1 - 0.05 - 0.45)
  })

  it('stops at another opening', () => {
    const door = addDoor(1)
    floorplan.addOpening({ wallId: walls.south, kind: 'window', offset: 3.2 })
    drag({ x: 1, y: 0 }, { x: 2.5, y: 0 })
    // The window starts at 2.6.
    expect(offsetOf(door)).toBeCloseTo(2.6 - 0.05 - 0.45)
  })

  it('jumps to another wall when the pointer comes nearer to it', () => {
    const door = addDoor(2)
    drag({ x: 2, y: 0 }, { x: 3.9, y: 2 })
    expect(floorplan.getOpening(door)).toMatchObject({ wallId: walls.east, offset: 2 })
  })

  it('stays on its wall when the other wall has no room', () => {
    const door = addDoor(2)
    floorplan.addOpening({ wallId: walls.east, kind: 'window', offset: 2, width: 3.6 })
    drag({ x: 2, y: 0 }, { x: 3.9, y: 2 })
    expect(floorplan.getOpening(door)!.wallId).toBe(walls.south)
  })

  it('steps a door through its hinge and swing with F, and ignores F for a window', () => {
    const door = addDoor(1)
    const window = floorplan.addOpening({ wallId: walls.south, kind: 'window', offset: 3 })
    click({ x: 1, y: 0 })
    expect(interaction.key('f')).toBe(true)
    expect(floorplan.getOpening(door)).toMatchObject({ hinge: 'end', swing: 'front' })
    expect(interaction.key('F')).toBe(true)
    expect(floorplan.getOpening(door)).toMatchObject({ hinge: 'start', swing: 'back' })

    click({ x: 3, y: 0 })
    expect(interaction.selection).toEqual({ kind: 'opening', id: window })
    expect(interaction.key('f')).toBe(false)
  })

  it('deletes the selected opening with Delete', () => {
    addDoor(1)
    click({ x: 1, y: 0 })
    expect(interaction.key('Delete')).toBe(true)
    expect(floorplan.openings).toEqual([])
    expect(interaction.selection).toBeNull()
    expect(floorplan.walls).toHaveLength(4)
  })
})

describe('openings in delete mode', () => {
  it('removes the opening clicked and keeps its wall', () => {
    addDoor(1)
    interaction.mode = 'delete'
    click({ x: 1, y: 0 })
    expect(floorplan.openings).toEqual([])
    expect(floorplan.walls).toHaveLength(4)
  })
})

describe('a plan in feet', () => {
  const INCH = 0.0254
  const wholeInches = (metres: number) => {
    const count = metres / INCH
    expect(count).toBeCloseTo(Math.round(count), 6)
    return Math.round(count)
  }

  beforeEach(() => {
    // What the engine does when a plan's unit becomes feet.
    const grid = unitGrid('imperial')
    interaction.snapping.grid = grid.snap
    interaction.openingSnap.step = grid.openingStep
  })

  it('slides a door to a whole inch along its wall', () => {
    const door = addDoor(1)
    drag({ x: 1, y: 0 }, { x: 2.713, y: 0.02 })
    expect(wholeInches(offsetOf(door))).toBe(107)
  })

  it('drags a corner to whole inches', () => {
    const corner = floorplan.corners.find((c) => c.x === 4 && c.y === 4)!
    drag({ x: 4, y: 4 }, { x: 5.013, y: 4.507 })
    const moved = floorplan.getCorner(corner.id)!
    expect(wholeInches(moved.x)).toBe(197)
    expect(wholeInches(moved.y)).toBe(177)
  })
})
