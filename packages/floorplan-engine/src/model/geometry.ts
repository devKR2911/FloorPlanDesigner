// Pure 2D geometry on the floor plane. Coordinates are in metres; nothing here knows about
// corners, walls or Three.js.

export interface Point {
  readonly x: number
  readonly y: number
}

/** Below this, lengths and areas count as zero. */
export const EPSILON = 1e-9

const TWO_PI = Math.PI * 2

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function subtract(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y }
}

/** The 2D cross product `a × b`. Positive when `b` is counter-clockwise from `a`. */
export function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x
}

/** The closest point to `p` on the segment `ab`, and where it sits along the segment (0 at `a`, 1 at `b`). */
export function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared < EPSILON) return { point: a, t: 0 }
  const projection = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared
  const t = Math.min(1, Math.max(0, projection))
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t }
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return distance(p, closestPointOnSegment(p, a, b).point)
}

/** Where the line through `p1` along `d1` meets the line through `p2` along `d2`, or `null` if they are parallel. */
export function lineIntersection(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const denominator = cross(d1, d2)
  if (Math.abs(denominator) < EPSILON) return null
  const t = cross(subtract(p2, p1), d2) / denominator
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y }
}

/**
 * Where segment `a1a2` meets segment `b1b2`, including when they only touch at an end.
 * Returns `null` when they miss, or when they are parallel (collinear overlaps have no single point).
 */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1 = subtract(a2, a1)
  const d2 = subtract(b2, b1)
  const denominator = cross(d1, d2)
  if (Math.abs(denominator) < EPSILON) return null
  const offset = subtract(b1, a1)
  const t = cross(offset, d2) / denominator
  const u = cross(offset, d1) / denominator
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null
  return { x: a1.x + t * d1.x, y: a1.y + t * d1.y }
}

/** Shoelace area. Positive for a counter-clockwise polygon (with `y` pointing up), negative for clockwise. */
export function signedArea(polygon: readonly Point[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function isClockwise(polygon: readonly Point[]): boolean {
  return signedArea(polygon) < 0
}

/** The area centroid. Falls back to the mean of the points for a degenerate polygon. */
export function centroid(polygon: readonly Point[]): Point {
  const area = signedArea(polygon)
  if (polygon.length === 0) return { x: 0, y: 0 }
  if (Math.abs(area) < EPSILON) {
    let x = 0
    let y = 0
    for (const p of polygon) {
      x += p.x
      y += p.y
    }
    return { x: x / polygon.length, y: y / polygon.length }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const factor = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * factor
    cy += (a.y + b.y) * factor
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

export function boundingBox(points: readonly Point[]): { min: Point; max: Point } | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } }
}

/** Direction of `v` in radians, in (-π, π], measured counter-clockwise from the x axis. */
export function angleOf(v: Point): number {
  return Math.atan2(v.y, v.x)
}

/** The counter-clockwise angle from direction `a` to direction `b`, in [0, 2π). */
export function angleBetween(a: Point, b: Point): number {
  const angle = angleOf(b) - angleOf(a)
  if (angle < 0) return angle + TWO_PI
  if (angle >= TWO_PI) return angle - TWO_PI
  return angle
}

/** Ray casting. Points on the boundary may land on either side. */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    const crossesRay = a.y > p.y !== b.y > p.y
    if (crossesRay && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * A point inside the polygon: its centroid when that lies inside, which an L- or U-shaped room's
 * may not, and otherwise the best of a few candidate points, judged by how far the point stands
 * from the nearest edge. Used to anchor things to a room.
 */
export function insidePoint(polygon: readonly Point[]): Point {
  if (polygon.length < 3) return centroid(polygon)
  const middle = centroid(polygon)
  const candidates = [middle]
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!
    const b = polygon[(i + 1) % polygon.length]!
    const c = polygon[(i + 2) % polygon.length]!
    // The centre of each triangle of neighbouring corners, and each edge's midpoint pulled
    // towards the centroid. Between them, one lands inside any simple polygon we draw.
    candidates.push({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 })
    candidates.push({ x: (a.x + b.x + middle.x) / 3, y: (a.y + b.y + middle.y) / 3 })
  }
  let best: Point | null = null
  let bestDepth = -Infinity
  for (const candidate of candidates) {
    if (!pointInPolygon(candidate, polygon)) continue
    let depth = Infinity
    for (let i = 0; i < polygon.length; i++) {
      depth = Math.min(
        depth,
        distanceToSegment(candidate, polygon[i]!, polygon[(i + 1) % polygon.length]!),
      )
    }
    if (depth > bestDepth) {
      best = candidate
      bestDepth = depth
    }
  }
  return best ?? middle
}

/**
 * Moves each edge of a counter-clockwise polygon inwards by its own distance and returns the new
 * corners. Edge `i` runs from `polygon[i]` to `polygon[i + 1]` and moves by `distances[i]`.
 * Used to turn wall centrelines into the inside outline of a room.
 */
export function insetPolygon(polygon: readonly Point[], distances: readonly number[]): Point[] {
  const n = polygon.length
  if (distances.length !== n) {
    throw new RangeError(`Expected ${n} distances for ${n} edges, got ${distances.length}`)
  }
  if (n < 3) return [...polygon]

  const result: Point[] = []
  for (let i = 0; i < n; i++) {
    const previous = polygon[(i - 1 + n) % n]!
    const current = polygon[i]!
    const next = polygon[(i + 1) % n]!
    const inDirection = unit(subtract(current, previous))
    const outDirection = unit(subtract(next, current))
    const inOffset = shift(current, leftNormal(inDirection), distances[(i - 1 + n) % n]!)
    const outOffset = shift(current, leftNormal(outDirection), distances[i]!)
    // Where the two moved edges meet. Parallel edges (a collinear corner) just move sideways.
    result.push(lineIntersection(inOffset, inDirection, outOffset, outDirection) ?? outOffset)
  }
  return result
}

function unit(v: Point): Point {
  const length = Math.hypot(v.x, v.y)
  return length < EPSILON ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length }
}

/** The normal pointing to the left of a direction: inside a counter-clockwise polygon. */
function leftNormal(direction: Point): Point {
  return { x: -direction.y, y: direction.x }
}

function shift(p: Point, direction: Point, amount: number): Point {
  return { x: p.x + direction.x * amount, y: p.y + direction.y * amount }
}
