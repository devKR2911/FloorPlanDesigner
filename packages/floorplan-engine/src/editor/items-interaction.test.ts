import { beforeEach, describe, expect, it } from 'vitest'
import { SelectionStore, type Selection } from '../core/selection.js'
import { Floorplan } from '../model/floorplan.js'
import { ItemCatalog } from '../model/item-catalog.js'
import type { Point } from '../model/geometry.js'
import { rotateHandlePosition } from './hit-testing.js'
import { Interaction, ROTATION_STEP, type PointerInput } from './interaction.js'
import { defaultSnapSettings } from './snapping.js'
import { Viewport } from './viewport.js'

let floorplan: Floorplan
let viewport: Viewport
let catalog: ItemCatalog
let selection: SelectionStore
let interaction: Interaction

const chair = { width: 0.4, height: 0.9, depth: 0.4 }

beforeEach(() => {
  floorplan = new Floorplan({ wallThickness: 0.2 })
  viewport = new Viewport(1000, 1000)
  viewport.scale = 100
  viewport.centreOn({ x: 2, y: 2 })
  catalog = new ItemCatalog()
  catalog.set([{ key: 'chair', model: '/chair.glb', size: chair, placement: 'floor' }])
  selection = new SelectionStore()
  interaction = new Interaction(
    floorplan,
    viewport,
    { ...defaultSnapSettings },
    {
      catalog,
      selection,
    },
  )
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

/** A 4 m square room with 0.2 m walls; its inside faces are at 0.1 and 3.9. */
function squareRoom() {
  const ids = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ].map(([x, y]) => floorplan.addCorner(x!, y!))
  ids.forEach((id, i) => floorplan.addWall(id, ids[(i + 1) % ids.length]!))
}

const addChair = (x: number, y: number) =>
  floorplan.addItem({ catalogKey: 'chair', position: { x, y } })

describe('items in move mode', () => {
  it('selects an item by clicking it, and clears the selection on empty space', () => {
    const id = addChair(2, 2)
    click({ x: 2.1, y: 1.9 })
    expect(interaction.selection).toEqual({ kind: 'item', id })
    expect(selection.current).toEqual({ kind: 'item', id })
    click({ x: 3, y: 3 })
    expect(interaction.selection).toBeNull()
  })

  it('picks an item over the wall it stands against', () => {
    squareRoom()
    const id = addChair(2, 0.3)
    // 0.05 m from the wall's face, inside the chair's outline.
    click({ x: 2, y: 0.15 })
    expect(interaction.selection).toEqual({ kind: 'item', id })
  })

  it('drags an item by where it was grabbed, onto the grid', () => {
    const id = addChair(2, 2)
    drag({ x: 2.1, y: 2.1 }, { x: 2.83, y: 1.6 })
    // Grabbed 0.1 m off centre, so the centre goes to (2.73, 1.5), then to the grid.
    expect(floorplan.getItem(id)!.position).toEqual({ x: 2.7, y: 1.5 })
    expect(interaction.selection).toEqual({ kind: 'item', id })
  })

  it('snaps an item against a wall while dragging, and lets go of it further away', () => {
    squareRoom()
    const id = addChair(2, 2)
    drag({ x: 2, y: 2 }, { x: 2, y: 3.6 })
    expect(floorplan.getItem(id)!.position.y).toBeCloseTo(3.7)
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(0)

    drag({ x: 2, y: 3.7 }, { x: 3.55, y: 2 })
    expect(floorplan.getItem(id)!.position.x).toBeCloseTo(3.7)
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(-Math.PI / 2)

    // Away from every wall, the item keeps the rotation it had when the drag started.
    drag({ x: 3.7, y: 2 }, { x: 2, y: 2 })
    expect(floorplan.getItem(id)!.position).toEqual({ x: 2, y: 2 })
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('does not snap while Alt is held', () => {
    const id = addChair(2, 2)
    drag({ x: 2, y: 2 }, { x: 2.33, y: 2.47 }, { altKey: true })
    expect(floorplan.getItem(id)!.position).toEqual({ x: 2.33, y: 2.47 })
  })

  it('turns the selected item with its handle, in 15° steps', () => {
    const id = addChair(2, 2)
    click({ x: 2, y: 2 })
    const item = floorplan.getItem(id)!
    const handle = rotateHandlePosition(item, chair, viewport.metresPerPixel)
    // The handle starts in front of the chair, below its centre on the plan.
    expect(handle.y).toBeLessThan(2)
    expect(interaction.overRotateHandle).toBe(false)
    interaction.pointerMove(at(handle))
    expect(interaction.overRotateHandle).toBe(true)

    // Pull the handle round to the right of the chair, a little past a quarter turn.
    drag(handle, { x: 3, y: 2.08 })
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(Math.PI / 2)
    expect(floorplan.getItem(id)!.position).toEqual({ x: 2, y: 2 })

    drag(rotateHandlePosition(floorplan.getItem(id)!, chair, viewport.metresPerPixel), {
      x: 3,
      y: 2.6,
    })
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(Math.PI / 2 + 2 * ROTATION_STEP)
  })

  it('turns the selected item a quarter with R, and deletes it with Delete', () => {
    const id = addChair(2, 2)
    click({ x: 2, y: 2 })
    expect(interaction.key('r')).toBe(true)
    expect(floorplan.getItem(id)!.rotation).toBeCloseTo(Math.PI / 2)
    expect(interaction.key('Delete')).toBe(true)
    expect(floorplan.items).toEqual([])
    expect(interaction.selection).toBeNull()
  })

  it('ignores R when no item is selected', () => {
    expect(interaction.key('r')).toBe(false)
  })
})

describe('items in delete mode', () => {
  it('removes the item clicked, and clears it from the selection', () => {
    const id = addChair(2, 2)
    selection.set({ kind: 'item', id })
    interaction.mode = 'delete'
    // Switching mode clears the selection; select again from outside, as the 3D view would.
    selection.set({ kind: 'item', id })
    click({ x: 2, y: 2 })
    expect(floorplan.items).toEqual([])
    expect(selection.current).toBeNull()
  })
})

describe('shared selection', () => {
  it('reports a selection made elsewhere', () => {
    const id = addChair(2, 2)
    const seen: Selection[] = []
    interaction.on('selection', (s) => seen.push(s))
    selection.set({ kind: 'item', id })
    expect(interaction.selection).toEqual({ kind: 'item', id })
    expect(seen).toEqual([{ kind: 'item', id }])
  })

  it('stops reporting after dispose', () => {
    const seen: Selection[] = []
    interaction.on('selection', (s) => seen.push(s))
    interaction.dispose()
    selection.set({ kind: 'item', id: 'x' })
    expect(seen).toEqual([])
  })
})
