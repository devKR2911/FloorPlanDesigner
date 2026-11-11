import type { ItemSize } from '../schema/item-definition.js'
import type { Floorplan } from './floorplan.js'
import { EPSILON, type Point } from './geometry.js'
import {
  convexPolygonsOverlap,
  itemAxes,
  itemOutline,
  normalizeAngle,
  wallRectangle,
  type ItemPose,
} from './item-geometry.js'

export interface PlacementSettings {
  /** Master switch. Off, the requested pose is used as it is. */
  enabled: boolean
  /** How close, in metres, an item's back or side must come to a wall face to snap to it. */
  wallDistance: number
  /** Grid step in metres for items that are not against a wall. 0 turns the grid off. */
  grid: number
}

export const defaultPlacementSettings: PlacementSettings = {
  enabled: true,
  wallDistance: 0.2,
  grid: 0.1,
}

export interface PlacementResult extends ItemPose {
  /** The walls the item was snapped against: none, one, or two in a corner. */
  walls: string[]
}

/** One face of a wall: a line beside the wall's centreline, with a normal pointing away from it. */
interface WallFace {
  wallId: string
  /** Where the face starts, level with the wall's start corner. */
  origin: Point
  /** Unit vector along the face, from the wall's start towards its end. */
  along: Point
  length: number
  /** Unit vector out of the wall, away from its centreline. */
  normal: Point
}

/**
 * Where an item goes when it is asked to be at `request`.
 *
 * 1. **Wall snap.** If the item's back comes within `wallDistance` of a wall face, the item
 *    turns to face away from the wall and sits with its back flush against it. If one of its
 *    sides then comes within `wallDistance` of another wall face, it slides along the first wall
 *    to sit flush against that one too, which puts it neatly in a corner.
 * 2. **Grid snap.** Otherwise its centre is rounded to the grid and its rotation is kept.
 */
export function placeItem(
  request: ItemPose,
  size: Pick<ItemSize, 'width' | 'depth'>,
  floorplan: Pick<Floorplan, 'walls' | 'getCorner'>,
  settings: PlacementSettings = defaultPlacementSettings,
): PlacementResult {
  const rotation = normalizeAngle(request.rotation)
  if (!settings.enabled) return { position: { ...request.position }, rotation, walls: [] }

  const faces = wallFaces(floorplan)
  const back = closestFace(faces, request.position, size.depth / 2, settings.wallDistance, 0)
  if (!back) {
    return {
      position: {
        x: toGrid(request.position.x, settings.grid),
        y: toGrid(request.position.y, settings.grid),
      },
      rotation,
      walls: [],
    }
  }

  // The item's back faces the wall, so its own `back` direction is the face normal reversed.
  const { normal } = back.face
  const snappedRotation = normalizeAngle(Math.atan2(normal.x, -normal.y))
  let position = shift(request.position, normal, -back.gap)

  // A wall face along either side of the item, which is now parallel to the item's width.
  const { right } = itemAxes(snappedRotation)
  const sideFaces = faces.filter(
    (face) => face.wallId !== back.face.wallId && Math.abs(dot(face.normal, right)) > 1 - 1e-6,
  )
  const side = closestFace(
    sideFaces,
    position,
    size.width / 2,
    settings.wallDistance,
    size.depth / 2,
  )
  if (side) position = shift(position, side.face.normal, -side.gap)

  return {
    position,
    rotation: snappedRotation,
    walls: side ? [back.face.wallId, side.face.wallId] : [back.face.wallId],
  }
}

/** How far apart the rings of places tried by `findFreeSpot()` are, in metres. */
const SEARCH_STEP = 0.3
/** How far from the requested place `findFreeSpot()` looks, in metres. */
const SEARCH_REACH = 6
/** How many places are tried on each ring. */
const SEARCH_DIRECTIONS = 12

/**
 * Where a new item goes so that it overlaps no wall and no other item: the requested place if
 * it is free, else the nearest free place found on rings around it. Every place tried goes
 * through `placeItem()`, so the result is snapped like a dragged item. If nothing free is found
 * within reach, the requested place is used after all.
 */
export function findFreeSpot(
  request: ItemPose,
  size: Pick<ItemSize, 'width' | 'depth'>,
  floorplan: Pick<Floorplan, 'walls' | 'getCorner' | 'items'>,
  sizeOf: (catalogKey: string) => Pick<ItemSize, 'width' | 'depth'>,
  settings: PlacementSettings = defaultPlacementSettings,
): PlacementResult {
  const obstacles: Point[][] = floorplan.items.map((item) =>
    itemOutline(item, sizeOf(item.catalogKey)),
  )
  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)
    const end = floorplan.getCorner(wall.end)
    if (start && end) obstacles.push(wallRectangle(start, end, wall.thickness))
  }
  const tryAt = (position: Point): PlacementResult | null => {
    const placed = placeItem({ position, rotation: request.rotation }, size, floorplan, settings)
    const outline = itemOutline(placed, size)
    return obstacles.some((obstacle) => convexPolygonsOverlap(outline, obstacle)) ? null : placed
  }

  const first = tryAt(request.position)
  if (first) return first
  for (let radius = SEARCH_STEP; radius <= SEARCH_REACH; radius += SEARCH_STEP) {
    for (let i = 0; i < SEARCH_DIRECTIONS; i++) {
      const angle = (i / SEARCH_DIRECTIONS) * Math.PI * 2
      const found = tryAt({
        x: request.position.x + Math.cos(angle) * radius,
        y: request.position.y + Math.sin(angle) * radius,
      })
      if (found) return found
    }
  }
  return placeItem(request, size, floorplan, settings)
}

/** Both faces of every wall. */
function wallFaces(floorplan: Pick<Floorplan, 'walls' | 'getCorner'>): WallFace[] {
  const faces: WallFace[] = []
  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)
    const end = floorplan.getCorner(wall.end)
    if (!start || !end) continue
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    if (length < EPSILON) continue
    const along = { x: (end.x - start.x) / length, y: (end.y - start.y) / length }
    for (const side of [1, -1]) {
      const normal = { x: -along.y * side, y: along.x * side }
      faces.push({
        wallId: wall.id,
        origin: shift(start, normal, wall.thickness / 2),
        along,
        length,
        normal,
      })
    }
  }
  return faces
}

/**
 * The face nearest to having `point` exactly `halfExtent` in front of it, within `distance`.
 * `gap` is how far the shape's edge stands off the face; negative means it is pushed into it.
 * `slack` lets the point lie that far past either end of the face.
 */
function closestFace(
  faces: readonly WallFace[],
  point: Point,
  halfExtent: number,
  distance: number,
  slack: number,
): { face: WallFace; gap: number } | null {
  let best: { face: WallFace; gap: number } | null = null
  for (const face of faces) {
    const offset = { x: point.x - face.origin.x, y: point.y - face.origin.y }
    const inFront = dot(offset, face.normal)
    if (inFront <= 0) continue
    const along = dot(offset, face.along)
    if (along < -slack || along > face.length + slack) continue
    const gap = inFront - halfExtent
    if (Math.abs(gap) > distance) continue
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { face, gap }
  }
  return best
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y
}

function shift(p: Point, direction: Point, amount: number): Point {
  return { x: p.x + direction.x * amount, y: p.y + direction.y * amount }
}

function toGrid(value: number, step: number): number {
  if (step <= 0) return value
  // Rounded twice so that grid positions come out as clean decimals, such as 0.3 not 0.30000000000000004.
  return Number((Math.round(value / step) * step).toFixed(6))
}
