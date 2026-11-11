import type { Floorplan } from '../model/floorplan.js'
import type { Point } from '../model/geometry.js'

/**
 * The walls that stand between the camera and a room: those with a room on one side only, seen
 * from the other side. `camera` is the camera's position on the plan. Walls with a room on both
 * sides, or on neither, are never included.
 */
export function wallsFacingCamera(
  floorplan: Pick<Floorplan, 'walls' | 'getCorner' | 'roomsOf'>,
  camera: Point,
): Set<string> {
  const result = new Set<string>()
  for (const wall of floorplan.walls) {
    const { front, back } = floorplan.roomsOf(wall.id)
    if ((front === null) === (back === null)) continue
    const start = floorplan.getCorner(wall.start)
    const end = floorplan.getCorner(wall.end)
    if (!start || !end) continue
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length === 0) continue
    // How far the camera is to the left of the wall's centreline, walking from start to end.
    // The front is the left side, so a positive distance means the camera is on the front side.
    const distance =
      ((end.x - start.x) * (camera.y - start.y) - (end.y - start.y) * (camera.x - start.x)) / length
    // A camera above the wall itself is on neither side.
    if (Math.abs(distance) <= wall.thickness / 2) continue
    const cameraInFront = distance > 0
    const roomInFront = front !== null
    if (cameraInFront !== roomInFront) result.add(wall.id)
  }
  return result
}
