import type { Floorplan } from '../model/floorplan.js'
import { distance, distanceToSegment, type Point } from '../model/geometry.js'
import { itemAt, itemAxes } from '../model/item-geometry.js'
import { openingAt } from '../model/wall-openings.js'
import type { Item } from '../schema/plan.js'
import type { ItemSize } from '../schema/item-definition.js'

export type Hit =
  | { kind: 'corner'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'item'; id: string }
  | { kind: 'opening'; id: string }
  | null

/** How far, in pixels, the rotate handle sits beyond the front of the selected item. */
export const ROTATE_HANDLE_OFFSET = 22

/**
 * What is under a world point: the nearest corner within `tolerance` metres, else a door or
 * window whose gap contains the point, else an item whose outline contains it, else the nearest
 * wall within `tolerance` of its band, else nothing. Corners win so a shared end stays
 * grabbable; openings and items win over walls, which they sit in or against.
 */
export function hitTest(
  point: Point,
  floorplan: Floorplan,
  tolerance: number,
  sizeOf?: (catalogKey: string) => ItemSize,
): Hit {
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

  const opening = openingAt(point, floorplan, tolerance / 2)
  if (opening) return { kind: 'opening', id: opening }

  if (sizeOf) {
    const item = itemAt(point, floorplan, sizeOf)
    if (item) return { kind: 'item', id: item }
  }

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

/** Where the rotate handle of an item is drawn: in front of the item, a fixed number of pixels out. */
export function rotateHandlePosition(
  item: Pick<Item, 'position' | 'rotation'>,
  size: Pick<ItemSize, 'depth'>,
  metresPerPixel: number,
): Point {
  const { back } = itemAxes(item.rotation)
  const reach = size.depth / 2 + ROTATE_HANDLE_OFFSET * metresPerPixel
  return { x: item.position.x - back.x * reach, y: item.position.y - back.y * reach }
}
