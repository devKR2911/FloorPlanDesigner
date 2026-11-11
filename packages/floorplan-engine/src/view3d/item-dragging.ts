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
