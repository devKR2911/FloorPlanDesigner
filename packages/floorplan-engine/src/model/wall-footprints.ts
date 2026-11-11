import type { Corner, Wall } from '../schema/plan.js'
import { EPSILON, angleOf, type Point } from './geometry.js'

/**
 * What an edge of a wall's outline is: the wall's `front` or `back` face, a free or cut `end`,
 * or a `join` where the outline runs to the corner and meets a neighbouring wall.
 */
export type FootprintEdge = 'front' | 'back' | 'end' | 'join'

/** The outline of one wall on the floor, after it has been joined to its neighbours. */
export interface WallFootprint {
  wallId: string
  /** Counter-clockwise, with `y` pointing up. */
  polygon: Point[]
  /** `edges[i]` labels the edge from `polygon[i]` to the next point. */
  edges: FootprintEdge[]
}

/**
 * How far a mitre may push a wall past its corner, in wall thicknesses. Past this the corner is
 * cut flat instead, so two walls meeting at a sharp angle do not grow a long spike.
 */
export const MITRE_LIMIT = 2

type WallRef = Pick<Wall, 'id' | 'start' | 'end' | 'thickness'>

/** One end of a wall, seen from its corner looking along the wall. */
interface WallEnd {
  corner: Point
  /** Unit vector from the corner along the wall. */
  direction: Point
  angle: number
  half: number
  length: number
  /** Where the wall's left and right edges stop at this corner. They start as a square cut. */
  left: Point
  right: Point
  /** An extra point after `left` that closes a flat-cut corner. */
  bevel: Point | null
  /** True when another wall shares the corner, so the outline passes through the corner point. */
  joined: boolean
}

/**
 * Works out the outline of every wall so that walls sharing a corner meet cleanly.
 *
 * At each corner the walls are sorted by direction and each neighbouring pair is joined where
 * their facing edges cross. Every outline also passes through the corner point, so the outlines
 * around a junction fit together without gaps or overlaps for any number of walls and any mix of
 * thicknesses. Walls of no length are left out.
 */
export function wallFootprints(
  corners: readonly Corner[],
  walls: readonly WallRef[],
): WallFootprint[] {
  const cornerById = new Map(corners.map((corner) => [corner.id, corner]))
  const endsAtCorner = new Map<string, WallEnd[]>()
  const endsOfWall: { wallId: string; start: WallEnd; end: WallEnd }[] = []

  for (const wall of walls) {
    const start = cornerById.get(wall.start)
    const end = cornerById.get(wall.end)
    if (!start || !end) continue
    const dx = end.x - start.x
    const dy = end.y - start.y
    const length = Math.hypot(dx, dy)
    if (length < EPSILON) continue
    const direction = { x: dx / length, y: dy / length }
    const half = wall.thickness / 2
    const startEnd = makeEnd(start, direction, half, length)
    const endEnd = makeEnd(end, { x: -direction.x, y: -direction.y }, half, length)
    addTo(endsAtCorner, wall.start, startEnd)
    addTo(endsAtCorner, wall.end, endEnd)
    endsOfWall.push({ wallId: wall.id, start: startEnd, end: endEnd })
  }

  for (const ends of endsAtCorner.values()) {
    if (ends.length < 2) continue
    ends.sort((a, b) => a.angle - b.angle)
    for (let i = 0; i < ends.length; i++) {
      join(ends[i]!, ends[(i + 1) % ends.length]!)
    }
  }

  return endsOfWall.map(({ wallId, start, end }) => outline(wallId, start, end))
}

function makeEnd(corner: Point, direction: Point, half: number, length: number): WallEnd {
  const point = { x: corner.x, y: corner.y }
  return {
    corner: point,
    direction,
    angle: angleOf(direction),
    half,
    length,
    left: offset(point, direction, half),
    right: offset(point, direction, -half),
    bevel: null,
    joined: false,
  }
}

function addTo(map: Map<string, WallEnd[]>, cornerId: string, end: WallEnd): void {
  const list = map.get(cornerId)
  if (list) list.push(end)
  else map.set(cornerId, [end])
}

/** A point beside the corner: `amount` to the left of the wall's direction, or to the right if negative. */
function offset(corner: Point, direction: Point, amount: number): Point {
  return { x: corner.x - direction.y * amount, y: corner.y + direction.x * amount }
}

/**
 * Joins a wall end to the next one counter-clockwise from it: the left edge of `a` meets the
 * right edge of `b`.
 */
function join(a: WallEnd, b: WallEnd): void {
  a.joined = true
  b.joined = true

  // The sine and cosine of the counter-clockwise angle from `a` to `b`.
  const sin = a.direction.x * b.direction.y - a.direction.y * b.direction.x
  const cos = a.direction.x * b.direction.x + a.direction.y * b.direction.y
  // Walls in a straight line have no crossing point, so each keeps its square cut.
  if (Math.abs(sin) < EPSILON) return

  // How far along each wall the crossing point lies. Negative means past the corner.
  const alongA = (b.half + a.half * cos) / sin
  const alongB = (a.half + b.half * cos) / sin
  const limit = MITRE_LIMIT * 2 * Math.max(a.half, b.half)
  const tooFar = alongA < -limit || alongB < -limit
  const pastTheWall = alongA > a.length || alongB > b.length
  if (tooFar || pastTheWall) {
    // On the outside of the angle the square cuts leave a wedge open; close it with a flat cut.
    if (tooFar && sin < 0) a.bevel = b.right
    return
  }

  const meeting = {
    x: a.left.x + a.direction.x * alongA,
    y: a.left.y + a.direction.y * alongA,
  }
  a.left = meeting
  b.right = meeting
}

function outline(wallId: string, start: WallEnd, end: WallEnd): WallFootprint {
  const polygon: Point[] = []
  const edges: FootprintEdge[] = []
  const push = (point: Point, edge: FootprintEdge) => {
    polygon.push(point)
    edges.push(edge)
  }
  /** Runs round one end of the wall, from its left point to just before its right point. */
  const roundEnd = (wallEnd: WallEnd) => {
    if (!wallEnd.joined) {
      push(wallEnd.left, 'end')
      return
    }
    if (wallEnd.bevel) {
      push(wallEnd.left, 'end')
      push(wallEnd.bevel, 'join')
    } else {
      push(wallEnd.left, 'join')
    }
    push(wallEnd.corner, 'join')
  }

  // Seen from the far end, that end's left is this wall's back, so the order below is
  // counter-clockwise: along the back, round the far end, along the front, round the near end.
  push(start.right, 'back')
  roundEnd(end)
  push(end.right, 'front')
  roundEnd(start)
  return { wallId, polygon, edges }
}
