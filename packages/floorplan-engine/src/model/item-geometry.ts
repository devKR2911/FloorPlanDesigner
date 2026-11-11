import type { Footprint, ItemShape, ItemSize } from '../schema/item-definition.js'
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

/** The footprint of an item that has none of its own: its full rectangle, front left first. */
export const RECTANGLE_FOOTPRINT: Footprint = [
  [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ],
]

type FlatShape = Pick<ItemShape, 'width' | 'depth' | 'footprint'>

/**
 * The item's real outline on the plan: one convex, counter-clockwise polygon for each piece of
 * its footprint, in the footprint's order. An item with no footprint gives `itemOutline()`.
 */
export function itemFootprint(pose: ItemPose, shape: FlatShape): Point[][] {
  const { right, back } = itemAxes(pose.rotation)
  return (shape.footprint ?? RECTANGLE_FOOTPRINT).map((piece) =>
    piece.map(([x, y]) => ({
      x: pose.position.x + right.x * x * shape.width + back.x * y * shape.depth,
      y: pose.position.y + right.y * x * shape.width + back.y * y * shape.depth,
    })),
  )
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

/** The id of the item whose footprint contains a point, the last drawn first. */
export function itemAt(
  point: Point,
  floorplan: Pick<Floorplan, 'items'>,
  shapeOf: (catalogKey: string) => FlatShape,
): string | null {
  const items = floorplan.items
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!
    const pieces = itemFootprint(item, shapeOf(item.catalogKey))
    if (pieces.some((piece) => pointInPolygon(point, piece))) return item.id
  }
  return null
}

/**
 * The ids of the items that overlap a wall or another item. Items are compared by their
 * footprints, so one that stands in the empty corner of another's rectangle does not count.
 */
export function findOverlaps(
  floorplan: Pick<Floorplan, 'items' | 'walls' | 'getCorner'>,
  shapeOf: (catalogKey: string) => FlatShape,
): Set<string> {
  const outlines = floorplan.items.map((item) => {
    const shape = shapeOf(item.catalogKey)
    return {
      id: item.id,
      centre: item.position,
      // No part of the item is further from its centre than this.
      reach: Math.hypot(shape.width, shape.depth) / 2,
      pieces: itemFootprint(item, shape),
    }
  })
  const walls: Point[][] = []
  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)
    const end = floorplan.getCorner(wall.end)
    if (start && end) walls.push(wallRectangle(start, end, wall.thickness))
  }

  const result = new Set<string>()
  outlines.forEach((a, i) => {
    if (walls.some((wall) => a.pieces.some((piece) => convexPolygonsOverlap(piece, wall)))) {
      result.add(a.id)
    }
    for (let j = i + 1; j < outlines.length; j++) {
      const b = outlines[j]!
      // Too far apart to touch: skip the full test, which runs on every redraw.
      const apart = Math.hypot(b.centre.x - a.centre.x, b.centre.y - a.centre.y)
      if (apart > a.reach + b.reach) continue
      if (piecesOverlap(a.pieces, b.pieces)) {
        result.add(a.id)
        result.add(b.id)
      }
    }
  })
  return result
}

/** Whether any piece of one shape overlaps any piece of the other. */
export function piecesOverlap(a: readonly Point[][], b: readonly Point[][]): boolean {
  return a.some((pieceA) => b.some((pieceB) => convexPolygonsOverlap(pieceA, pieceB)))
}
