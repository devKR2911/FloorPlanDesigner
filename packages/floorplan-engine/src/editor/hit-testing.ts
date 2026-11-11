import type { Floorplan } from '../model/floorplan.js'
import { distance, distanceToSegment, type Point } from '../model/geometry.js'

export type Hit = { kind: 'corner'; id: string } | { kind: 'wall'; id: string } | null

/**
 * What is under a world point: the nearest corner within `tolerance` metres, else the nearest
 * wall within `tolerance` of its band, else nothing. Corners win so a shared end stays grabbable.
 */
export function hitTest(point: Point, floorplan: Floorplan, tolerance: number): Hit {
  let best: Hit = null
  let bestDistance = tolerance
  for (const corner of floorplan.corners) {
    const d = distance(point, corner)
    if (d < bestDistance) {
      best = { kind: 'corner', id: corner.id }
      bestDistance = d
    }
  }
  if (best) return best

  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)!
    const end = floorplan.getCorner(wall.end)!
    const d = distanceToSegment(point, start, end) - wall.thickness / 2
    if (d < bestDistance) {
      best = { kind: 'wall', id: wall.id }
      bestDistance = d
    }
  }
  return best
}
