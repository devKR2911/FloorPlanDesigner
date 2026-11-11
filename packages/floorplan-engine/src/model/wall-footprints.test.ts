import { describe, expect, it } from 'vitest'
import { signedArea, type Point } from './geometry.js'
import { wallFootprints, type WallFootprint } from './wall-footprints.js'

type CornerInput = [id: string, x: number, y: number]
type WallInput = [start: string, end: string, thickness?: number]

/** Footprints by wall id, where a wall's id is its two corner ids joined, such as `ab`. */
function footprints(corners: CornerInput[], walls: WallInput[]): Record<string, WallFootprint> {
  const result = wallFootprints(
    corners.map(([id, x, y]) => ({ id, x, y })),
    walls.map(([start, end, thickness = 0.2]) => ({ id: start + end, start, end, thickness })),
  )
  return Object.fromEntries(result.map((footprint) => [footprint.wallId, footprint]))
}

function totalArea(result: Record<string, WallFootprint>): number {
  return Object.values(result).reduce((sum, { polygon }) => sum + signedArea(polygon), 0)
}

function expectPoints(actual: Point[], expected: [number, number][]): void {
  expect(actual).toHaveLength(expected.length)
  expected.forEach(([x, y], index) => {
    expect(actual[index]!.x).toBeCloseTo(x)
    expect(actual[index]!.y).toBeCloseTo(y)
  })
}

function expectCounterClockwise(result: Record<string, WallFootprint>): void {
  for (const { polygon, edges } of Object.values(result)) {
    expect(signedArea(polygon)).toBeGreaterThan(0)
    expect(edges).toHaveLength(polygon.length)
  }
}

describe('wallFootprints', () => {
  it('gives a lone wall a rectangle with square ends', () => {
    const { ab } = footprints(
      [
        ['a', 0, 0],
        ['b', 4, 0],
      ],
      [['a', 'b']],
    )
    expectPoints(ab!.polygon, [
      [0, -0.1],
      [4, -0.1],
      [4, 0.1],
      [0, 0.1],
    ])
    expect(ab!.edges).toEqual(['back', 'end', 'front', 'end'])
  })

  it('mitres two walls at a right angle', () => {
    const result = footprints(
      [
        ['a', 4, 0],
        ['b', 0, 0],
        ['c', 0, 3],
      ],
      [
        ['b', 'a'],
        ['b', 'c'],
      ],
    )
    // Starts at the outer mitre point, runs to the free end and back to the inner point,
    // then through the corner.
    expectPoints(result.ba!.polygon, [
      [-0.1, -0.1],
      [4, -0.1],
      [4, 0.1],
      [0.1, 0.1],
      [0, 0],
    ])
    expect(result.ba!.edges).toEqual(['back', 'end', 'front', 'join', 'join'])
    expectCounterClockwise(result)
    // A mitre moves area from one wall to the other, so each keeps thickness × length.
    expect(signedArea(result.ba!.polygon)).toBeCloseTo(0.8)
    expect(signedArea(result.bc!.polygon)).toBeCloseTo(0.6)
  })

  it('mitres two walls at an angle that is not a right angle', () => {
    const result = footprints(
      [
        ['a', 4, 0],
        ['b', 0, 0],
        ['c', -2, 2],
      ],
      [
        ['b', 'a'],
        ['b', 'c'],
      ],
    )
    expectCounterClockwise(result)
    expect(totalArea(result)).toBeCloseTo(0.2 * (4 + Math.hypot(2, 2)))
    // Both walls share the same two meeting points.
    const shared = result.ba!.polygon.filter((p) =>
      result.bc!.polygon.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9),
    )
    expect(shared).toHaveLength(3)
  })

  it('joins walls of two thicknesses at a right angle', () => {
    const result = footprints(
      [
        ['a', 4, 0],
        ['b', 0, 0],
        ['c', 0, 3],
      ],
      [
        ['b', 'a', 0.2],
        ['b', 'c', 0.4],
      ],
    )
    expectCounterClockwise(result)
    // The thin wall stops at the thick wall's face, and the outer point is the outer corner of both.
    expectPoints(result.ba!.polygon, [
      [-0.2, -0.1],
      [4, -0.1],
      [4, 0.1],
      [0.2, 0.1],
      [0, 0],
    ])
    // The union: the thick wall 0.4 × 3.1, plus the rest of the thin wall 3.8 × 0.2.
    expect(totalArea(result)).toBeCloseTo(0.4 * 3.1 + 3.8 * 0.2)
  })

  it('keeps walls in a straight line flush', () => {
    const result = footprints(
      [
        ['a', -2, 0],
        ['b', 0, 0],
        ['c', 2, 0],
      ],
      [
        ['a', 'b'],
        ['b', 'c'],
      ],
    )
    expectPoints(result.bc!.polygon, [
      [0, -0.1],
      [2, -0.1],
      [2, 0.1],
      [0, 0.1],
      [0, 0],
    ])
    expect(totalArea(result)).toBeCloseTo(0.8)
  })

  it('leaves a step between walls in a straight line with different thicknesses', () => {
    const result = footprints(
      [
        ['a', -2, 0],
        ['b', 0, 0],
        ['c', 2, 0],
      ],
      [
        ['a', 'b', 0.3],
        ['b', 'c', 0.1],
      ],
    )
    expectCounterClockwise(result)
    expect(signedArea(result.ab!.polygon)).toBeCloseTo(0.6)
    expect(signedArea(result.bc!.polygon)).toBeCloseTo(0.2)
    expect(Math.max(...result.bc!.polygon.map((p) => Math.abs(p.y)))).toBeCloseTo(0.05)
  })

  it('does not shoot off when nearly straight walls have different thicknesses', () => {
    const result = footprints(
      [
        ['a', -2, 0],
        ['b', 0, 0],
        ['c', 2, 0.03],
      ],
      [
        ['a', 'b', 0.3],
        ['b', 'c', 0.1],
      ],
    )
    expectCounterClockwise(result)
    for (const { polygon } of Object.values(result)) {
      for (const point of polygon) {
        expect(Math.abs(point.x)).toBeLessThan(2.01)
        expect(Math.abs(point.y)).toBeLessThan(0.16)
      }
    }
  })

  it('fits three walls together at a T-junction', () => {
    const result = footprints(
      [
        ['l', -2, 0],
        ['c', 0, 0],
        ['r', 2, 0],
        ['t', 0, 2],
      ],
      [
        ['l', 'c'],
        ['c', 'r'],
        ['c', 't'],
      ],
    )
    expectCounterClockwise(result)
    // The stem's outline comes to a point at the corner, between the two through walls.
    expectPoints(result.ct!.polygon, [
      [0.1, 0.1],
      [0.1, 2],
      [-0.1, 2],
      [-0.1, 0.1],
      [0, 0],
    ])
    // The union: the through wall 4 × 0.2, plus the stem above it 0.2 × 1.9.
    expect(totalArea(result)).toBeCloseTo(0.8 + 0.38)
  })

  it('fits four walls together at a crossing', () => {
    const result = footprints(
      [
        ['c', 0, 0],
        ['e', 2, 0],
        ['n', 0, 2],
        ['w', -2, 0],
        ['s', 0, -2],
      ],
      [
        ['c', 'e'],
        ['c', 'n'],
        ['c', 'w'],
        ['c', 's'],
      ],
    )
    expectCounterClockwise(result)
    // The union of two crossing bands: 0.8 + 0.8 minus the shared square.
    expect(totalArea(result)).toBeCloseTo(1.56)
  })

  it('fits a T-junction of two thicknesses together', () => {
    const result = footprints(
      [
        ['l', -2, 0],
        ['c', 0, 0],
        ['r', 2, 0],
        ['t', 0, 2],
      ],
      [
        ['l', 'c', 0.4],
        ['c', 'r', 0.4],
        ['c', 't', 0.1],
      ],
    )
    expectCounterClockwise(result)
    expect(totalArea(result)).toBeCloseTo(4 * 0.4 + 0.1 * 1.8)
  })

  it('cuts a very sharp corner flat instead of growing a spike', () => {
    const angle = (20 * Math.PI) / 180
    const result = footprints(
      [
        ['a', 4, 0],
        ['b', 0, 0],
        ['c', 4 * Math.cos(angle), 4 * Math.sin(angle)],
      ],
      [
        ['b', 'a'],
        ['b', 'c'],
      ],
    )
    expectCounterClockwise(result)
    // A mitre here would reach 0.57 m behind the corner. The flat cut stays within the thickness.
    for (const { polygon } of Object.values(result)) {
      expect(Math.min(...polygon.map((p) => p.x))).toBeGreaterThan(-0.1 - 1e-9)
    }
    // One wall carries the flat cut as a second `end` edge.
    const endCounts = Object.values(result).map(
      ({ edges }) => edges.filter((edge) => edge === 'end').length,
    )
    expect(endCounts.sort()).toEqual([1, 2])
  })

  it('still mitres a corner just wider than the limit', () => {
    const angle = (40 * Math.PI) / 180
    const result = footprints(
      [
        ['a', 4, 0],
        ['b', 0, 0],
        ['c', 4 * Math.cos(angle), 4 * Math.sin(angle)],
      ],
      [
        ['b', 'a'],
        ['b', 'c'],
      ],
    )
    expect(totalArea(result)).toBeCloseTo(0.2 * 8)
    expect(result.ba!.edges.filter((edge) => edge === 'end')).toHaveLength(1)
  })

  it('leaves out walls of no length and walls with a missing corner', () => {
    const result = footprints(
      [
        ['a', 0, 0],
        ['b', 0, 0],
        ['c', 3, 0],
      ],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'missing'],
      ],
    )
    expect(Object.keys(result)).toEqual(['bc'])
    expect(result.bc!.edges).toEqual(['back', 'end', 'front', 'end'])
  })
})
