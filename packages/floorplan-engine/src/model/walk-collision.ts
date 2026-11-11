import { EPSILON, type Point } from './geometry.js'
import { unfitOpenings, type OpeningHost } from './wall-openings.js'

// Keeps a walker out of the walls. Pure maths on the plan, with no camera.

/** The walker is a circle of this radius, in metres. */
export const WALKER_RADIUS = 0.25

/** A solid piece of wall: a rectangle running `length` from `start` along `direction`. */
export interface WallBlock {
  start: Point
  /** Unit vector along the piece. */
  direction: Point
  length: number
  /** Half the wall's thickness. */
  half: number
}

/**
 * The solid pieces of every wall. A door that fits its wall leaves a gap between two pieces;
 * a window does not, and neither does a door that is not cut into its wall.
 */
export function wallBlocks(host: OpeningHost): WallBlock[] {
  const unfit = unfitOpenings(host)
  const blocks: WallBlock[] = []
  for (const wall of host.walls) {
    const start = host.getCorner(wall.start)
    const end = host.getCorner(wall.end)
    if (!start || !end) continue
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length < EPSILON) continue
    const direction = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
    const piece = (from: number, to: number) => {
      if (to - from < EPSILON) return
      blocks.push({
        start: { x: start.x + direction.x * from, y: start.y + direction.y * from },
        direction,
        length: to - from,
        half: wall.thickness / 2,
      })
    }
    let cursor = 0
    const doors = host.openings
      .filter((o) => o.wallId === wall.id && o.kind === 'door' && !unfit.has(o.id))
      .sort((a, b) => a.offset - b.offset)
    for (const door of doors) {
      piece(cursor, door.offset - door.width / 2)
      cursor = door.offset + door.width / 2
    }
    piece(cursor, length)
  }
  return blocks
}

/**
 * Where a walker ends up when stepping from `from` towards `to`. A step into a wall slides
 * along it; a walker who is inside a wall is pushed out of its nearer face.
 */
export function moveWalker(
  from: Point,
  to: Point,
  blocks: readonly WallBlock[],
  radius = WALKER_RADIUS,
): Point {
  // Short steps, so a fast walker cannot jump through a thin wall.
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(distance / (radius / 2)))
  let position = { x: from.x, y: from.y }
  for (let i = 0; i < steps; i++) {
    position = pushOut(
      {
        x: position.x + (to.x - from.x) / steps,
        y: position.y + (to.y - from.y) / steps,
      },
      blocks,
      radius,
    )
  }
  return position
}

/** Moves a point out of every block it is within `radius` of. */
function pushOut(point: Point, blocks: readonly WallBlock[], radius: number): Point {
  let { x, y } = point
  // In a corner two walls push in turn; a few rounds settle it.
  for (let round = 0; round < 6; round++) {
    let moved = false
    for (const { start, direction, length, half } of blocks) {
      // The point in the block's own frame: `u` along it, `v` to its left.
      let u = (x - start.x) * direction.x + (y - start.y) * direction.y
      let v = (y - start.y) * direction.x - (x - start.x) * direction.y
      const du = u - Math.min(Math.max(u, 0), length)
      const dv = v - Math.min(Math.max(v, -half), half)
      const gap = Math.hypot(du, dv)
      if (gap >= radius - 1e-9) continue
      if (gap > 1e-9) {
        u += (du / gap) * (radius - gap)
        v += (dv / gap) * (radius - gap)
      } else {
        // Inside the wall itself: out through the face on the side it is nearer to.
        v = v >= 0 ? half + radius : -half - radius
      }
      x = start.x + direction.x * u - direction.y * v
      y = start.y + direction.y * u + direction.x * v
      moved = true
    }
    if (!moved) break
  }
  return { x, y }
}
