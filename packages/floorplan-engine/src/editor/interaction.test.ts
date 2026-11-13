import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Floorplan } from '../model/floorplan.js'
import { History } from '../model/history.js'
import type { Point } from '../model/geometry.js'
import { Interaction, type PointerInput } from './interaction.js'
import { defaultSnapSettings } from './snapping.js'
import { Viewport } from './viewport.js'

let floorplan: Floorplan
let viewport: Viewport
let interaction: Interaction

beforeEach(() => {
  floorplan = new Floorplan()
  viewport = new Viewport(1000, 1000)
  viewport.scale = 100 // 100 px per metre: 8 px tolerance is 0.08 m
  viewport.centreOn({ x: 5, y: 5 })
  interaction = new Interaction(floorplan, viewport, { ...defaultSnapSettings })
})

function at(x: number, y: number, extra: Partial<PointerInput> = {}): PointerInput {
  const world = { x, y }
  return { world, screen: viewport.toScreen(world), button: 0, ...extra }
}

function click(x: number, y: number, extra: Partial<PointerInput> = {}) {
  interaction.pointerDown(at(x, y, extra))
  interaction.pointerUp(at(x, y, extra))
}

function drag(from: Point, ...path: Point[]) {
  interaction.pointerDown(at(from.x, from.y))
  for (const p of path) interaction.pointerMove(at(p.x, p.y))
  const last = path[path.length - 1]!
  interaction.pointerUp(at(last.x, last.y))
}

function drawSquare() {
  interaction.mode = 'draw'
  click(0, 0)
  click(4, 0)
  click(4, 4)
  click(0, 4)
  click(0, 0)
  interaction.mode = 'move'
}

const cornerAt = (x: number, y: number) =>
  floorplan.corners.find((c) => Math.abs(c.x - x) < 1e-9 && Math.abs(c.y - y) < 1e-9)

describe('draw mode', () => {
  it('draws a room by clicking its corners and closing on the first', () => {
    drawSquare()
    expect(floorplan.corners).toHaveLength(4)
    expect(floorplan.walls).toHaveLength(4)
    expect(floorplan.rooms).toHaveLength(1)
    expect(floorplan.rooms[0]!.area).toBe(16)
    expect(interaction.drawing).toBe(false)
  })

  it('snaps clicks to the grid', () => {
    interaction.mode = 'draw'
    click(1.02, 2.07)
    expect(floorplan.corners[0]).toMatchObject({ x: 1, y: 2.1 })
  })

  it('does not snap while Alt is held', () => {
    interaction.mode = 'draw'
    click(1.02, 2.07, { altKey: true })
    expect(floorplan.corners[0]).toMatchObject({ x: 1.02, y: 2.07 })
  })

  it('shows a rubber band from the last corner and ends the chain with Escape', () => {
    interaction.mode = 'draw'
    click(0, 0)
    interaction.pointerMove(at(3.01, 0.02))
    const preview = interaction.preview!
    expect(preview.anchor).toEqual({ x: 0, y: 0 })
    expect(preview.cursor).toEqual({ x: 3, y: 0 })
    expect(preview.target).toEqual({ kind: 'axis', x: null, y: expect.any(String) })

    expect(interaction.key('Escape')).toBe(true)
    expect(interaction.drawing).toBe(false)
    expect(interaction.mode).toBe('draw')
    expect(interaction.preview!.anchor).toBeNull()
  })

  it('ends the chain when the last corner is clicked again or on double click', () => {
    interaction.mode = 'draw'
    click(0, 0)
    click(4, 0)
    click(4, 0)
    expect(interaction.drawing).toBe(false)
    expect(floorplan.walls).toHaveLength(1)

    click(4, 4)
    expect(interaction.drawing).toBe(true)
    interaction.doubleClick()
    expect(interaction.drawing).toBe(false)
  })

  it('joins onto an existing corner and splits an existing wall', () => {
    drawSquare()
    interaction.mode = 'draw'
    click(4.03, 4.02) // the existing corner at (4, 4)
    click(2, 0.03) // on the bottom wall
    expect(floorplan.corners).toHaveLength(5)
    expect(floorplan.walls).toHaveLength(6)
    expect(floorplan.rooms).toHaveLength(2)
  })

  it('carries on when a wall already exists between the two corners', () => {
    drawSquare()
    interaction.mode = 'draw'
    click(0, 0)
    click(4, 0)
    expect(floorplan.walls).toHaveLength(4)
    expect(interaction.drawing).toBe(true)
  })

  it('pans when dragging in draw mode', () => {
    interaction.mode = 'draw'
    const before = viewport.originX
    drag({ x: 1, y: 1 }, { x: 2, y: 1 })
    expect(viewport.originX).toBe(before + 100)
    expect(floorplan.corners).toHaveLength(0)
  })
})

describe('move mode', () => {
  it('selects what is clicked and clears on empty space', () => {
    drawSquare()
    const selections: unknown[] = []
    interaction.on('selection', (s) => selections.push(s))
    click(0.02, 0.01)
    expect(interaction.selection).toEqual({ kind: 'corner', id: cornerAt(0, 0)!.id })
    click(2, 0.05)
    expect(interaction.selection?.kind).toBe('wall')
    // Away from the room's label, which would select the room.
    click(0.8, 3.2)
    expect(interaction.selection).toBeNull()
    expect(selections).toHaveLength(3)
  })

  it('drags a corner with snapping and merges only on release', () => {
    drawSquare()
    const c = cornerAt(4, 4)!
    drag({ x: 4, y: 4 }, { x: 2, y: 4 }, { x: 0.02, y: 4.01 })
    // Merged into the corner at (0, 4): the room is now a triangle.
    expect(floorplan.getCorner(c.id)).toBeUndefined()
    expect(floorplan.corners).toHaveLength(3)
    expect(floorplan.rooms[0]!.area).toBe(8)
    expect(interaction.selection).toEqual({ kind: 'corner', id: cornerAt(0, 4)!.id })
  })

  it('does not merge a corner with one it is carried across', () => {
    drawSquare()
    drag({ x: 4, y: 4 }, { x: 0, y: 4 }, { x: -2, y: 4 })
    expect(floorplan.corners).toHaveLength(4)
    expect(cornerAt(-2, 4)).toBeDefined()
  })

  it('drags a wall by both corners on the grid', () => {
    drawSquare()
    drag({ x: 2, y: 4 }, { x: 2.02, y: 5.04 })
    expect(cornerAt(4, 5)).toBeDefined()
    expect(cornerAt(0, 5)).toBeDefined()
    expect(floorplan.rooms[0]!.area).toBe(20)
    expect(interaction.selection?.kind).toBe('wall')
  })

  it('pans when dragging empty space', () => {
    drawSquare()
    const before = { x: viewport.originX, y: viewport.originY }
    drag({ x: 2, y: 2 }, { x: 3, y: 1 })
    expect(viewport.originX).toBe(before.x + 100)
    expect(viewport.originY).toBe(before.y + 100)
  })

  it('deletes the selection with the Delete key', () => {
    drawSquare()
    click(2, 0.05)
    expect(interaction.key('Delete')).toBe(true)
    expect(floorplan.walls).toHaveLength(3)
    expect(floorplan.rooms).toEqual([])
    expect(interaction.selection).toBeNull()
    expect(interaction.key('Delete')).toBe(false)
  })

  it('reports hover changes once per change', () => {
    drawSquare()
    const hovers: unknown[] = []
    interaction.on('hover', (h) => hovers.push(h))
    interaction.pointerMove(at(2, 0.05))
    interaction.pointerMove(at(2.5, 0.05))
    interaction.pointerMove(at(2, 2))
    expect(hovers).toEqual([{ kind: 'wall', id: expect.any(String) }, null])
  })
})

describe('room labels', () => {
  it('selects the room when its label is clicked, and shows no hover for it', () => {
    drawSquare()
    const roomId = floorplan.rooms[0]!.id
    // The label sits at the room's centroid.
    click(2, 2)
    expect(interaction.selection).toEqual({ kind: 'room', id: roomId })
    expect(interaction.hover).toBeNull()
  })

  it('clears the selection on empty floor away from the label', () => {
    drawSquare()
    click(2, 2)
    click(0.8, 3.2)
    expect(interaction.selection).toBeNull()
  })

  it('lets a corner near the label win over the room', () => {
    drawSquare()
    // A second room drawn small enough that its corner sits by the first label's box.
    floorplan.moveCorner(cornerAt(4, 4)!.id, 2.05, 2.05)
    click(2.05, 2.05)
    expect(interaction.selection?.kind).toBe('corner')
  })

  it('does not delete a room with the Delete key, and keeps it selected', () => {
    drawSquare()
    click(2, 2)
    expect(interaction.key('Delete')).toBe(false)
    expect(interaction.selection?.kind).toBe('room')
    expect(floorplan.walls).toHaveLength(4)
  })

  it('does nothing to a label clicked in delete mode', () => {
    drawSquare()
    interaction.mode = 'delete'
    click(2, 2)
    expect(floorplan.walls).toHaveLength(4)
    expect(floorplan.rooms).toHaveLength(1)
  })
})

describe('delete mode', () => {
  it('removes what is clicked', () => {
    drawSquare()
    interaction.mode = 'delete'
    click(2, 0.05)
    expect(floorplan.walls).toHaveLength(3)
    // Removing the corner at (0, 4) takes its two walls and strands the corner at (0, 0).
    click(0.01, 4.02)
    expect(floorplan.corners).toHaveLength(2)
    expect(floorplan.walls).toHaveLength(1)
  })
})

describe('common behaviour', () => {
  it('zooms around the cursor with the wheel', () => {
    const screen = { x: 200, y: 300 }
    const before = viewport.toWorld(screen)
    const viewportEvents = vi.fn()
    interaction.on('viewport', viewportEvents)
    interaction.wheel(screen, -500)
    expect(viewport.scale).toBeGreaterThan(100)
    expect(viewport.toWorld(screen).x).toBeCloseTo(before.x)
    expect(viewportEvents).toHaveBeenCalledOnce()
  })

  it('pans with the middle button in any mode', () => {
    interaction.mode = 'draw'
    const before = viewport.originX
    interaction.pointerDown(at(1, 1, { button: 1 }))
    interaction.pointerMove(at(2, 1, { button: 1 }))
    interaction.pointerUp(at(2, 1, { button: 1 }))
    expect(viewport.originX).toBe(before + 100)
  })

  it('returns to move mode with Escape, then clears the selection', () => {
    drawSquare()
    click(2, 0.05)
    interaction.mode = 'delete'
    expect(interaction.selection).toBeNull()
    expect(interaction.key('Escape')).toBe(true)
    expect(interaction.mode).toBe('move')
    click(2, 0.05)
    expect(interaction.key('Escape')).toBe(true)
    expect(interaction.selection).toBeNull()
    expect(interaction.key('Escape')).toBe(false)
  })

  it('switching mode ends a chain and clears the selection', () => {
    interaction.mode = 'draw'
    click(0, 0)
    click(4, 0)
    const modes: string[] = []
    interaction.on('mode', (m) => modes.push(m))
    interaction.mode = 'move'
    expect(interaction.drawing).toBe(false)
    expect(modes).toEqual(['move'])
  })

  it('resolves a drag that the browser cancels', () => {
    drawSquare()
    interaction.pointerDown(at(4, 4))
    interaction.pointerMove(at(2, 4))
    interaction.pointerMove(at(0.02, 4.01))
    interaction.pointerCancel()
    expect(floorplan.corners).toHaveLength(3)
    expect(interaction.hover).toBeNull()
  })
})

describe('undo steps', () => {
  let history: History

  beforeEach(() => {
    history = new History(floorplan)
    interaction = new Interaction(floorplan, viewport, { ...defaultSnapSettings }, { history })
  })

  it('makes each wall drawn one step, with its corners', () => {
    interaction.mode = 'draw'
    click(0, 0)
    click(4, 0)
    click(4, 4)
    expect(floorplan.walls).toHaveLength(2)

    history.undo()
    expect(floorplan.walls).toHaveLength(1)
    expect(floorplan.corners).toHaveLength(2)
    history.undo()
    // The first click placed only a corner, which is a step of its own.
    expect(floorplan.walls).toHaveLength(0)
    expect(floorplan.corners).toHaveLength(1)
  })

  it('ends the chain being drawn when a step is undone', () => {
    interaction.mode = 'draw'
    click(0, 0)
    click(4, 0)
    expect(interaction.drawing).toBe(true)
    history.undo()
    expect(interaction.drawing).toBe(false)
    // The next click starts a new chain; it does not join to a corner that is gone.
    click(2, 2)
    expect(floorplan.walls).toHaveLength(0)
  })

  it('makes a whole corner drag one step, including the merge at its end', () => {
    drawSquare()
    while (history.canUndo && floorplan.walls.length < 4) history.redo()
    const before = floorplan.export()
    drag({ x: 4, y: 4 }, { x: 3, y: 3 }, { x: 2, y: 2 }, { x: 0, y: 4 })
    expect(floorplan.corners).toHaveLength(3)

    history.undo()
    expect(floorplan.export()).toEqual(before)
  })

  it('records nothing for a click that only selects, or a drag that only pans', () => {
    drawSquare()
    const position = history.position
    click(2, 0)
    drag({ x: 2, y: 2 }, { x: 3, y: 3 })
    expect(history.position).toBe(position)
  })
})
