import { describe, expect, it } from 'vitest'
import { Floorplan } from '../model/floorplan.js'
import { hitTest } from './hit-testing.js'
import { defaultSnapSettings, snapPoint, toGrid, type SnapContext } from './snapping.js'

/** A 4 m square: a(0,0) b(4,0) c(4,4) d(0,4), walls 0.2 m thick. */
function square(): Floorplan {
  const fp = new Floorplan()
  fp.load({
    version: 1,
    corners: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
      { id: 'c', x: 4, y: 4 },
      { id: 'd', x: 0, y: 4 },
    ],
    walls: ['ab', 'bc', 'cd', 'da'].map((id) => ({
      id,
      start: id[0]!,
      end: id[1]!,
      thickness: 0.2,
      height: 2.5,
    })),
    items: [],
  })
  return fp
}

// At 100 px/m the 8 px corner tolerance is 0.08 m and the 6 px axis tolerance is 0.06 m.
const context: SnapContext = { settings: defaultSnapSettings, metresPerPixel: 0.01 }

describe('snapPoint', () => {
  it('snaps to a corner within tolerance', () => {
    const result = snapPoint({ x: 4.05, y: -0.05 }, square(), context)
    expect(result).toEqual({ point: { x: 4, y: 0 }, target: { kind: 'corner', id: 'b' } })
  })

  it('snaps onto a wall within tolerance', () => {
    const result = snapPoint({ x: 2.33, y: 0.05 }, square(), context)
    expect(result.target).toEqual({ kind: 'wall', id: 'ab' })
    expect(result.point.x).toBeCloseTo(2.33)
    expect(result.point.y).toBe(0)
  })

  it('aligns with a corner on one axis and grids the other', () => {
    const result = snapPoint({ x: 4.03, y: 6.27 }, square(), context)
    expect(result).toEqual({ point: { x: 4, y: 6.3 }, target: { kind: 'axis', x: 'b', y: null } })
  })

  it('prefers the anchor when two corners align equally', () => {
    const fp = square()
    // Off to the right of the square, level with both c and d.
    const result = snapPoint({ x: 6, y: 4.03 }, fp, { ...context, anchorId: 'c' })
    expect(result).toEqual({ point: { x: 6, y: 4 }, target: { kind: 'axis', x: null, y: 'c' } })
  })

  it('falls back to the grid', () => {
    const result = snapPoint({ x: 2.26, y: 2.74 }, square(), context)
    expect(result).toEqual({ point: { x: 2.3, y: 2.7 }, target: { kind: 'grid' } })
  })

  it('ignores excluded corners and their walls', () => {
    const exclude = new Set(['b'])
    const result = snapPoint({ x: 4.02, y: 0.02 }, square(), { ...context, exclude })
    // Neither corner b nor walls ab and bc catch the point; it aligns with c and a instead.
    expect(result.target).toEqual({ kind: 'axis', x: 'c', y: 'a' })
    expect(result.point).toEqual({ x: 4, y: 0 })
  })

  it('does nothing when disabled', () => {
    const settings = { ...defaultSnapSettings, enabled: false }
    const point = { x: 4.01, y: 0.01 }
    expect(snapPoint(point, square(), { ...context, settings })).toEqual({
      point,
      target: { kind: 'none' },
    })
  })

  it('scales the tolerances with the zoom', () => {
    // At 10 px/m, 8 px is 0.8 m, so a point 0.5 m away still snaps to the corner.
    const result = snapPoint({ x: 4.5, y: 0 }, square(), { ...context, metresPerPixel: 0.1 })
    expect(result.target).toEqual({ kind: 'corner', id: 'b' })
  })

  it('rounds to the grid without floating point noise', () => {
    expect(toGrid(0.30000000000000004, 0.1)).toBe(0.3)
    expect(toGrid(2.26, 0.1)).toBe(2.3)
    expect(toGrid(2.26, 0)).toBe(2.26)
  })
})

describe('hitTest', () => {
  it('finds a corner before a wall', () => {
    expect(hitTest({ x: 0.03, y: 0.03 }, square(), 0.08)).toEqual({ kind: 'corner', id: 'a' })
  })

  it('finds a wall by its band, including its thickness', () => {
    expect(hitTest({ x: 2, y: 0.15 }, square(), 0.08)).toEqual({ kind: 'wall', id: 'ab' })
    expect(hitTest({ x: 2, y: 0.2 }, square(), 0.08)).toBeNull()
  })

  it('finds nothing in open space', () => {
    expect(hitTest({ x: 2, y: 2 }, square(), 0.08)).toBeNull()
  })
})
