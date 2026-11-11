import { describe, expect, it } from 'vitest'
import { MAX_SCALE, MIN_SCALE, Viewport } from './viewport.js'

describe('Viewport', () => {
  it('starts centred on the origin showing about 10 m across', () => {
    const vp = new Viewport(800, 600)
    expect(vp.scale).toBe(80)
    expect(vp.toScreen({ x: 0, y: 0 })).toEqual({ x: 400, y: 300 })
  })

  it('flips y so world y points up the page', () => {
    const vp = new Viewport(800, 600)
    expect(vp.toScreen({ x: 1, y: 1 })).toEqual({ x: 480, y: 220 })
    expect(vp.toWorld({ x: 480, y: 220 })).toEqual({ x: 1, y: 1 })
  })

  it('zooms around the point under the cursor', () => {
    const vp = new Viewport(800, 600)
    const cursor = { x: 600, y: 100 }
    const before = vp.toWorld(cursor)
    vp.zoomAt(cursor, 2)
    expect(vp.scale).toBe(160)
    expect(vp.toWorld(cursor).x).toBeCloseTo(before.x)
    expect(vp.toWorld(cursor).y).toBeCloseTo(before.y)
  })

  it('clamps the scale', () => {
    const vp = new Viewport(800, 600)
    vp.zoomAt({ x: 0, y: 0 }, 1000)
    expect(vp.scale).toBe(MAX_SCALE)
    vp.zoomAt({ x: 0, y: 0 }, 0.0001)
    expect(vp.scale).toBe(MIN_SCALE)
  })

  it('pans in pixels', () => {
    const vp = new Viewport(800, 600)
    vp.panBy(10, -20)
    expect(vp.toScreen({ x: 0, y: 0 })).toEqual({ x: 410, y: 280 })
  })

  it('keeps the centre still when resized', () => {
    const vp = new Viewport(800, 600)
    vp.centreOn({ x: 3, y: 2 })
    vp.setSize(400, 400)
    expect(vp.toWorld({ x: 200, y: 200 })).toEqual({ x: 3, y: 2 })
  })

  it('fits a rectangle with padding', () => {
    const vp = new Viewport(800, 600)
    vp.fit({ min: { x: 0, y: 0 }, max: { x: 10, y: 5 } }, 40)
    // 720 px for 10 m across, 520 px for 5 m down: the width is the tighter fit.
    expect(vp.scale).toBe(72)
    expect(vp.toScreen({ x: 5, y: 2.5 })).toEqual({ x: 400, y: 300 })
    expect(vp.toScreen({ x: 0, y: 0 }).x).toBe(40)
  })

  it('reports the visible world rectangle', () => {
    const vp = new Viewport(800, 600)
    expect(vp.visibleBounds()).toEqual({ min: { x: -5, y: -3.75 }, max: { x: 5, y: 3.75 } })
  })
})
