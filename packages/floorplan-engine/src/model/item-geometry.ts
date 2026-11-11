import type { ItemSize } from '../schema/item-definition.js'
import type { Floorplan } from './floorplan.js'
import { EPSILON, pointInPolygon, type Point } from './geometry.js'

/** Where an item stands on the plan and which way it faces. */
export interface ItemPose {
  position: Point
  /** Radians, counter-clockwise. */
  rotation: number
}

/** How far two shapes must overlap, in metres, to count. Items placed flush do not overlap. */
export const OVERLAP_TOLERANCE = 0.005

const TWO_PI = Math.PI * 2

/** An angle in radians brought into (-π, π]. */
export function normalizeAngle(angle: number): number {
  let result = angle % TWO_PI
  if (result <= -Math.PI) result += TWO_PI
  else if (result > Math.PI) result -= TWO_PI
  // Collapse -0, so a full turn compares equal to no turn.
  return result === 0 ? 0 : result
}

/**
 * An item's own directions on the plan: `right` runs along its width and `back` points from
 * its centre to its back. At rotation 0 these are the plan's `+x` and `+y`.
 */
export function itemAxes(rotation: number): { right: Point; back: Point } {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return { right: { x: cos, y: sin }, back: { x: -sin, y: cos } }
}

/**
 * The item's outline on the plan, counter-clockwise: front left, front right, back right,
 * back left.
 */
export function itemOutline(pose: ItemPose, size: Pick<ItemSize, 'width' | 'depth'>): Point[] {
  const { right, back } = itemAxes(pose.rotation)
  const w = size.width / 2
  const d = size.depth / 2
  const at = (along: number, behind: number): Point => ({
    x: pose.position.x + right.x * along + back.x * behind,
    y: pose.position.y + right.y * along + back.y * behind,
  })
  return [at(-w, -d), at(w, -d), at(w, d), at(-w, d)]
}

/** A wall's band at its full thickness, as a counter-clockwise rectangle. */
export function wallRectangle(start: Point, end: Point, thickness: number): Point[] {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < EPSILON) return []
  const nx = (-dy / length) * (thickness / 2)
  const ny = (dx / length) * (thickness / 2)
  return [
    { x: start.x - nx, y: start.y - ny },
    { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny },
    { x: start.x + nx, y: start.y + ny },
  ]
}

/**
 * Whether two convex polygons overlap by more than `tolerance` metres, by the separating axis
 * test. Shapes that only touch, or overlap by less, do not count.
 */
export function convexPolygonsOverlap(
  a: readonly Point[],
  b: readonly Point[],
  tolerance = OVERLAP_TOLERANCE,
): boolean {
  if (a.length < 3 || b.length < 3) return false
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!
      const q = polygon[(i + 1) % polygon.length]!
      const length = Math.hypot(q.x - p.x, q.y - p.y)
      if (length < EPSILON) continue
      const axis = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length }
      const [minA, maxA] = project(a, axis)
      const [minB, maxB] = project(b, axis)
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= tolerance) return false
    }
  }
  return true
}

function project(polygon: readonly Point[], axis: Point): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const p of polygon) {
    const value = p.x * axis.x + p.y * axis.y
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return [min, max]
}

/** The id of the item whose outline contains a point, the last drawn first. */
export function itemAt(
  point: Point,
  floorplan: Pick<Floorplan, 'items'>,
  sizeOf: (catalogKey: string) => ItemSize,
): string | null {
  const items = floorplan.items
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    if (pointInPolygon(point, itemOutline(item, sizeOf(item.catalogKey)))) return item.id
  }
  return null
}

/** The ids of the items that overlap a wall or another item. */
export function findOverlaps(
  floorplan: Pick<Floorplan, 'items' | 'walls' | 'getCorner'>,
  sizeOf: (catalogKey: string) => ItemSize,
): Set<string> {
  const outlines = floorplan.items.map((item) => ({
    id: item.id,
    outline: itemOutline(item, sizeOf(item.catalogKey)),
  }))
  const walls: Point[][] = []
  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)
    const end = floorplan.getCorner(wall.end)
    if (start && end) walls.push(wallRectangle(start, end, wall.thickness))
  }

  const result = new Set<string>()
  outlines.forEach(({ id, outline }, i) => {
    if (walls.some((wall) => convexPolygonsOverlap(outline, wall))) result.add(id)
    for (let j = i + 1; j < outlines.length; j++) {
      if (convexPolygonsOverlap(outline, outlines[j]!.outline)) {
        result.add(id)
        result.add(outlines[j]!.id)
      }
    }
  })
  return result
}
