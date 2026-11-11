import { ShapeUtils, Vector2 } from 'three'
import type { Point } from '../model/geometry.js'

/**
 * Splits a simple polygon into triangles. Returns indices into `polygon`, three per triangle,
 * each triangle counter-clockwise (with `y` pointing up) whichever way the polygon runs.
 */
export function triangulate(polygon: readonly Point[]): number[] {
  const contour = polygon.map((point) => new Vector2(point.x, point.y))
  const indices: number[] = []
  for (const [a, b, c] of ShapeUtils.triangulateShape(contour, []) as [number, number, number][]) {
    const pa = polygon[a]!
    const pb = polygon[b]!
    const pc = polygon[c]!
    const area = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x)
    if (area >= 0) indices.push(a, b, c)
    else indices.push(a, c, b)
  }
  return indices
}
