import { describe, expect, it } from 'vitest'
import { Floorplan } from './floorplan.js'
import { moveWalker, wallBlocks } from './walk-collision.js'

/** A 4 m square room with 0.2 m walls. The inside faces are at 0.1 and 3.9. */
function room() {
  const fp = new Floorplan({ wallThickness: 0.2 })
  const ids = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ].map(([x, y]) => fp.addCorner(x!, y!))
  const [south, east] = ids.map((id, i) => fp.addWall(id, ids[(i + 1) % ids.length]!))
  return { fp, south: south!, east: east! }
}

function expectPoint(actual: { x: number; y: number }, x: number, y: number): void {
  expect(actual.x).toBeCloseTo(x)
  expect(actual.y).toBeCloseTo(y)
}

describe('wallBlocks', () => {
  it('gives one block per wall, and splits a wall at a door', () => {
    const { fp, south } = room()
    expect(wallBlocks(fp)).toHaveLength(4)
    fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    const blocks = wallBlocks(fp)
    expect(blocks).toHaveLength(5)
    const pieces = blocks.filter((b) => b.direction.x === 1 && b.start.y === 0)
    expect(pieces.map((b) => [b.start.x, b.length])).toEqual([
      [0, expect.closeTo(1.55)],
      [expect.closeTo(2.45), expect.closeTo(1.55)],
    ])
  })

  it('does not split a wall at a window or at a door that does not fit', () => {
    const { fp, south, east } = room()
    fp.addOpening({ wallId: south, kind: 'window', offset: 2 })
    fp.addOpening({ wallId: east, kind: 'door', offset: 2 })
    fp.updateWall(east, { height: 2 })
    expect(wallBlocks(fp)).toHaveLength(4)
  })
})

describe('moveWalker', () => {
  it('moves freely inside a room', () => {
    const { fp } = room()
    expectPoint(moveWalker({ x: 1, y: 1 }, { x: 3, y: 2.5 }, wallBlocks(fp)), 3, 2.5)
  })

  it('stops at a wall, a radius from its face', () => {
    const { fp } = room()
    expectPoint(moveWalker({ x: 2, y: 2 }, { x: 2, y: -1 }, wallBlocks(fp)), 2, 0.35)
  })

  it('does not jump through a wall in one long step', () => {
    const { fp } = room()
    const end = moveWalker({ x: 2, y: 2 }, { x: 2, y: -30 }, wallBlocks(fp))
    expect(end.y).toBeCloseTo(0.35)
  })

  it('slides along a wall', () => {
    const { fp } = room()
    expectPoint(moveWalker({ x: 2, y: 1 }, { x: 3, y: -1 }, wallBlocks(fp)), 3, 0.35)
  })

  it('settles in a corner', () => {
    const { fp } = room()
    expectPoint(moveWalker({ x: 3, y: 1 }, { x: 5, y: -1 }, wallBlocks(fp)), 3.65, 0.35)
  })

  it('walks out through a door', () => {
    const { fp, south } = room()
    fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    expectPoint(moveWalker({ x: 2, y: 1 }, { x: 2, y: -1 }, wallBlocks(fp)), 2, -1)
  })

  it('is steered into the doorway when a little off line', () => {
    const { fp, south } = room()
    fp.addOpening({ wallId: south, kind: 'door', offset: 2 })
    // The door runs from 1.55 to 2.45, so the walker's middle must stay right of 1.8.
    // Rounding the door's edge costs a few centimetres of the step.
    const end = moveWalker({ x: 1.7, y: 1 }, { x: 1.7, y: -1 }, wallBlocks(fp))
    expect(end.x).toBeCloseTo(1.8)
    expect(end.y).toBeLessThan(-0.9)
  })

  it('cannot pass a window', () => {
    const { fp, south } = room()
    fp.addOpening({ wallId: south, kind: 'window', offset: 2 })
    expect(moveWalker({ x: 2, y: 1 }, { x: 2, y: -1 }, wallBlocks(fp)).y).toBeCloseTo(0.35)
  })

  it('pushes a walker who starts inside a wall out of its nearer face', () => {
    const { fp } = room()
    const blocks = wallBlocks(fp)
    expectPoint(moveWalker({ x: 2, y: 0.03 }, { x: 2, y: 0.03 }, blocks), 2, 0.35)
    expectPoint(moveWalker({ x: 2, y: -0.03 }, { x: 2, y: -0.03 }, blocks), 2, -0.35)
  })
})
