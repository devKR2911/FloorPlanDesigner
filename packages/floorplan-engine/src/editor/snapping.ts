import type { Floorplan } from '../model/floorplan.js'
import { closestPointOnSegment, distance, type Point } from '../model/geometry.js'

export interface SnapSettings {
  /** Master switch. Off, points are used as they are. */
  enabled: boolean
  /** Grid step in metres. 0 disables the grid snap. */
  grid: number
  /** How close, in pixels, the pointer must be to a corner or wall to snap to it. */
  cornerTolerance: number
  /** How close, in pixels, to horizontal or vertical alignment with a corner to snap to it. */
  axisTolerance: number
}

export const defaultSnapSettings: SnapSettings = {
  enabled: true,
  grid: 0.1,
  cornerTolerance: 8,
  axisTolerance: 6,
}

export type SnapTarget =
  | { kind: 'corner'; id: string }
  | { kind: 'wall'; id: string }
  | { kind: 'axis'; x: string | null; y: string | null }
  | { kind: 'grid' }
  | { kind: 'none' }

export interface SnapResult {
  point: Point
  target: SnapTarget
}

export interface SnapContext {
  settings: SnapSettings
  /** Converts the pixel tolerances to metres at the current zoom. */
  metresPerPixel: number
  /** Corners being dragged: never snap to them or to their walls. */
  exclude?: ReadonlySet<string>
  /** The previous corner while drawing a chain. Its id, so it aligns like any other corner. */
  anchorId?: string | null
}

/**
 * Snaps a world point, trying in order: an existing corner, an existing wall, horizontal or
 * vertical alignment with a corner, then the grid. The first match wins.
 */
export function snapPoint(point: Point, floorplan: Floorplan, context: SnapContext): SnapResult {
  const { settings, metresPerPixel } = context
  if (!settings.enabled) return { point, target: { kind: 'none' } }
  const exclude = context.exclude ?? new Set<string>()
  const tolerance = settings.cornerTolerance * metresPerPixel

  let nearestCorner: { id: string; point: Point } | null = null
  let nearestDistance = tolerance
  for (const corner of floorplan.corners) {
    if (exclude.has(corner.id)) continue
    const d = distance(point, corner)
    if (d < nearestDistance) {
      nearestCorner = { id: corner.id, point: { x: corner.x, y: corner.y } }
      nearestDistance = d
    }
  }
  if (nearestCorner)
    return { point: nearestCorner.point, target: { kind: 'corner', id: nearestCorner.id } }

  let nearestWall: { id: string; point: Point } | null = null
  nearestDistance = tolerance
  for (const wall of floorplan.walls) {
    if (exclude.has(wall.start) || exclude.has(wall.end)) continue
    const start = floorplan.getCorner(wall.start)!
    const end = floorplan.getCorner(wall.end)!
    const closest = closestPointOnSegment(point, start, end).point
    const d = distance(point, closest)
    if (d < nearestDistance) {
      nearestWall = { id: wall.id, point: closest }
      nearestDistance = d
    }
  }
  if (nearestWall) return { point: nearestWall.point, target: { kind: 'wall', id: nearestWall.id } }

  const axisTolerance = settings.axisTolerance * metresPerPixel
  let xAlign: { id: string; value: number } | null = null
  let yAlign: { id: string; value: number } | null = null
  let xDistance = axisTolerance
  let yDistance = axisTolerance
  for (const corner of floorplan.corners) {
    if (exclude.has(corner.id)) continue
    // The anchor wins ties, so a chain prefers to continue straight.
    const bias = corner.id === context.anchorId ? 1e-9 : 0
    const dx = Math.abs(point.x - corner.x) - bias
    const dy = Math.abs(point.y - corner.y) - bias
    if (dx < xDistance) {
      xAlign = { id: corner.id, value: corner.x }
      xDistance = dx
    }
    if (dy < yDistance) {
      yAlign = { id: corner.id, value: corner.y }
      yDistance = dy
    }
  }

  const snapped = {
    x: xAlign ? xAlign.value : toGrid(point.x, settings.grid),
    y: yAlign ? yAlign.value : toGrid(point.y, settings.grid),
  }
  if (xAlign || yAlign) {
    return {
      point: snapped,
      target: { kind: 'axis', x: xAlign?.id ?? null, y: yAlign?.id ?? null },
    }
  }
  return { point: snapped, target: { kind: settings.grid > 0 ? 'grid' : 'none' } }
}

export function toGrid(value: number, step: number): number {
  if (step <= 0) return value
  const rounded = Math.round(value / step) * step
  // Avoid 0.30000000000000004 from floating point rounding.
  return Number(rounded.toFixed(6))
}
