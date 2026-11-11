import { describe, expect, it } from 'vitest'
import {
  angleBetween,
  angleOf,
  boundingBox,
  centroid,
  closestPointOnSegment,
  distance,
  distanceToSegment,
  insetPolygon,
  isClockwise,
  lineIntersection,
  pointInPolygon,
  segmentIntersection,
  signedArea,
  type Point,
} from './geometry.js'

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
]

function expectPoint(actual: Point | null, expected: Point) {
  expect(actual).not.toBeNull()
  expect(actual!.x).toBeCloseTo(expected.x, 9)
  expect(actual!.y).toBeCloseTo(expected.y, 9)
}

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5)
  })
})

describe('closestPointOnSegment', () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10, y: 0 }

  it('projects onto the segment', () => {
    const { point, t } = closestPointOnSegment({ x: 3, y: 2 }, a, b)
    expectPoint(point, { x: 3, y: 0 })
    expect(t).toBeCloseTo(0.3)
  })

  it('clamps to the ends', () => {
    expect(closestPointOnSegment({ x: -5, y: 1 }, a, b)).toEqual({ point: a, t: 0 })
    expect(closestPointOnSegment({ x: 15, y: 1 }, a, b)).toEqual({ point: b, t: 1 })
  })

  it('handles a zero-length segment', () => {
    expect(closestPointOnSegment({ x: 5, y: 5 }, a, a)).toEqual({ point: a, t: 0 })
  })

  it('gives the perpendicular distance', () => {
    expect(distanceToSegment({ x: 3, y: 2 }, a, b)).toBe(2)
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5)
  })
})

describe('lineIntersection', () => {
  it('finds where two lines cross', () => {
    const hit = lineIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 }, { x: 1, y: -1 })
    expectPoint(hit, { x: 2, y: 2 })
  })

  it('returns null for parallel lines', () => {
    expect(
      lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 0 }),
    ).toBeNull()
  })
})

describe('segmentIntersection', () => {
  it('finds a crossing', () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 })
    expectPoint(hit, { x: 2, y: 2 })
  })

  it('finds a touch at an end', () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 })
    expectPoint(hit, { x: 2, y: 0 })
  })

  it('returns null when the lines would cross beyond the segments', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 }, { x: 1, y: 3 }),
    ).toBeNull()
  })

  it('returns null for collinear segments', () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 0 }, { x: 6, y: 0 }),
    ).toBeNull()
  })
})

describe('signedArea and orientation', () => {
  it('is positive for a counter-clockwise polygon', () => {
    expect(signedArea(square)).toBe(16)
    expect(isClockwise(square)).toBe(false)
  })

  it('is negative for a clockwise polygon', () => {
    const reversed = [...square].reverse()
    expect(signedArea(reversed)).toBe(-16)
    expect(isClockwise(reversed)).toBe(true)
  })

  it('is zero for a degenerate polygon', () => {
    expect(signedArea([square[0]!, square[1]!])).toBe(0)
  })
})

describe('centroid', () => {
  it('finds the centre of a square', () => {
    expectPoint(centroid(square), { x: 2, y: 2 })
  })

  it('weights by area for an L shape', () => {
    const l: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ]
    // Three unit squares centred at (0.5,0.5), (1.5,0.5) and (0.5,1.5).
    expectPoint(centroid(l), { x: 2.5 / 3, y: 2.5 / 3 })
  })

  it('falls back to the mean for a line', () => {
    expectPoint(centroid([square[0]!, square[1]!]), { x: 2, y: 0 })
  })
})

describe('boundingBox', () => {
  it('returns null for no points', () => {
    expect(boundingBox([])).toBeNull()
  })

  it('spans the points', () => {
    expect(
      boundingBox([
        { x: -1, y: 5 },
        { x: 3, y: -2 },
      ]),
    ).toEqual({
      min: { x: -1, y: -2 },
      max: { x: 3, y: 5 },
    })
  })
})

describe('angles', () => {
  it('measures direction counter-clockwise from the x axis', () => {
    expect(angleOf({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2)
    expect(angleOf({ x: -1, y: 0 })).toBeCloseTo(Math.PI)
  })

  it('measures the counter-clockwise angle between directions in [0, 2π)', () => {
    expect(angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2)
    expect(angleBetween({ x: 0, y: 1 }, { x: 1, y: 0 })).toBeCloseTo((3 * Math.PI) / 2)
    expect(angleBetween({ x: 1, y: 0 }, { x: 1, y: 0 })).toBe(0)
  })
})

describe('pointInPolygon', () => {
  it('tells inside from outside', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, square)).toBe(true)
    expect(pointInPolygon({ x: 5, y: 2 }, square)).toBe(false)
    expect(pointInPolygon({ x: 2, y: -1 }, square)).toBe(false)
  })

  it('works for a concave polygon', () => {
    const u: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
    ]
    expect(pointInPolygon({ x: 1.5, y: 2 }, u)).toBe(false)
    expect(pointInPolygon({ x: 0.5, y: 2 }, u)).toBe(true)
  })
})

describe('insetPolygon', () => {
  it('shrinks a square by the same distance on every side', () => {
    const inner = insetPolygon(square, [0.5, 0.5, 0.5, 0.5])
    expect(inner).toHaveLength(4)
    expectPoint(inner[0]!, { x: 0.5, y: 0.5 })
    expectPoint(inner[1]!, { x: 3.5, y: 0.5 })
    expectPoint(inner[2]!, { x: 3.5, y: 3.5 })
    expectPoint(inner[3]!, { x: 0.5, y: 3.5 })
  })

  it('moves each edge by its own distance', () => {
    const inner = insetPolygon(square, [1, 0, 0, 0])
    // Only the bottom edge (from corner 0 to corner 1) moves up.
    expectPoint(inner[0]!, { x: 0, y: 1 })
    expectPoint(inner[1]!, { x: 4, y: 1 })
    expectPoint(inner[2]!, { x: 4, y: 4 })
    expectPoint(inner[3]!, { x: 0, y: 4 })
  })

  it('moves a collinear corner sideways', () => {
    const withMidpoint: Point[] = [square[0]!, { x: 2, y: 0 }, square[1]!, square[2]!, square[3]!]
    const inner = insetPolygon(withMidpoint, [0.5, 0.5, 0.5, 0.5, 0.5])
    expectPoint(inner[1]!, { x: 2, y: 0.5 })
  })

  it('rejects the wrong number of distances', () => {
    expect(() => insetPolygon(square, [1])).toThrow(RangeError)
  })
})
