import type { Point } from '../model/geometry.js'
import { toPlan } from './coordinates.js'

/** Farther than this from the camera, a pointer ray is treated as missing the floor. */
export const MAX_FLOOR_DISTANCE = 200

/**
 * Where a ray from the camera meets the floor, as a plan point, or `null` if the ray points
 * level or upwards, or meets the floor too far away to be useful.
 */
export function floorPointFromRay(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  floorHeight = 0,
): Point | null {
  if (direction.y >= -1e-6) return null
  const t = (floorHeight - origin.y) / direction.y
  if (t < 0) return null
  const length = Math.hypot(direction.x, direction.y, direction.z)
  if (t * length > MAX_FLOOR_DISTANCE) return null
  return toPlan({ x: origin.x + direction.x * t, z: origin.z + direction.z * t })
}

/**
 * How far along a wall a ray from the camera meets the upright plane through the wall's
 * centreline, measured from the wall's start corner. `null` if the ray runs along the wall or
 * away from it. `start` and `end` are the wall's corners on the plan.
 */
export function wallOffsetFromRay(
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  start: Point,
  end: Point,
): number | null {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < 1e-9) return null
  const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
  const normal = { x: -along.y, y: along.x }
  // The ray on the plan. Its height does not matter for an upright plane.
  const from = toPlan(origin)
  const heading = toPlan(direction)
  const approach = heading.x * normal.x + heading.y * normal.y
  if (Math.abs(approach) < 1e-6) return null
  const t = ((start.x - from.x) * normal.x + (start.y - from.y) * normal.y) / approach
  if (t < 0) return null
  const hit = { x: from.x + heading.x * t, y: from.y + heading.y * t }
  return (hit.x - start.x) * along.x + (hit.y - start.y) * along.y
}
