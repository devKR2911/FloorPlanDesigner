import type { Corner, Opening, OpeningKind, Wall } from '../schema/plan.js'
import { EPSILON, type Point } from './geometry.js'
import { wallFootprints } from './wall-footprints.js'

// The rules for doors and windows: where on a wall an opening may sit, its outline on the plan,
// and what is under a point. Pure functions, with no rendering.

/** The least distance, in metres, between an opening and the end of its wall's usable stretch. */
export const OPENING_END_MARGIN = 0.05
/** The least distance, in metres, between two openings on one wall. */
export const OPENING_GAP = 0.05
/** The least height of wall, in metres, left above an opening. */
export const OPENING_TOP_MARGIN = 0.1

/** The size a new door or window gets when none is given. */
export const OPENING_DEFAULTS: Record<
  OpeningKind,
  { width: number; height: number; sill: number }
> = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
}

/** What these functions need from a plan. `Floorplan` provides it. */
export interface OpeningHost {
  readonly corners: readonly Readonly<Corner>[]
  readonly walls: readonly Readonly<Wall>[]
  readonly openings: readonly Readonly<Opening>[]
  getCorner(id: string): Readonly<Corner> | undefined
  getWall(id: string): Readonly<Wall> | undefined
}

/** A stretch of a wall, as distances along it from its start corner. */
export interface WallSpan {
  min: number
  max: number
}

/** Where a point lies relative to a wall's centreline. */
export interface WallProjection {
  /** Distance along the wall from its start corner. Negative or beyond `length` past the ends. */
  along: number
  /** Distance from the line through the wall, to the side. Never negative. */
  distance: number
  length: number
}

export function projectOntoWall(point: Point, start: Point, end: Point): WallProjection {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < EPSILON) {
    return { along: 0, distance: Math.hypot(point.x - start.x, point.y - start.y), length: 0 }
  }
  const px = point.x - start.x
  const py = point.y - start.y
  return {
    along: (px * dx + py * dy) / length,
    distance: Math.abs(px * dy - py * dx) / length,
    length,
  }
}

/**
 * The stretch of each wall that an opening may occupy: the part where both faces of the wall
 * exist once the wall is joined to its neighbours, less a margin at each end. At a corner the
 * inside face stops short of the corner point, so the stretch is shorter than the wall.
 */
export function wallClearSpans(
  corners: readonly Readonly<Corner>[],
  walls: readonly Readonly<Wall>[],
): Map<string, WallSpan> {
  const cornerById = new Map(corners.map((corner) => [corner.id, corner]))
  const wallById = new Map(walls.map((wall) => [wall.id, wall]))
  const spans = new Map<string, WallSpan>()
  for (const { wallId, polygon, edges } of wallFootprints(corners, walls)) {
    const wall = wallById.get(wallId)!
    const start = cornerById.get(wall.start)!
    const end = cornerById.get(wall.end)!
    let min = -Infinity
    let max = Infinity
    edges.forEach((edge, i) => {
      if (edge !== 'front' && edge !== 'back') return
      const a = projectOntoWall(polygon[i]!, start, end).along
      const b = projectOntoWall(polygon[(i + 1) % polygon.length]!, start, end).along
      min = Math.max(min, Math.min(a, b))
      max = Math.min(max, Math.max(a, b))
    })
    spans.set(wallId, { min: min + OPENING_END_MARGIN, max: max - OPENING_END_MARGIN })
  }
  return spans
}

/**
 * The offset nearest to `requested` at which an opening of `width` fits inside `span` and keeps
 * its distance from the `others` on the wall, or `null` if there is no room for it anywhere.
 */
export function fitOffset(
  requested: number,
  width: number,
  span: WallSpan,
  others: readonly { offset: number; width: number }[],
): number | null {
  const blocked = others
    .map((other) => ({
      from: other.offset - other.width / 2 - OPENING_GAP,
      to: other.offset + other.width / 2 + OPENING_GAP,
    }))
    .sort((a, b) => a.from - b.from)

  // Walk the free stretches between the blocked ones.
  let best: number | null = null
  const consider = (from: number, to: number) => {
    if (to - from < width - 1e-9) return
    const candidate = Math.min(Math.max(requested, from + width / 2), to - width / 2)
    if (best === null || Math.abs(candidate - requested) < Math.abs(best - requested)) {
      best = candidate
    }
  }
  let cursor = span.min
  for (const { from, to } of blocked) {
    consider(cursor, Math.min(from, span.max))
    cursor = Math.max(cursor, to)
  }
  consider(cursor, span.max)
  return best === null ? null : Number((best as number).toFixed(6))
}

/** Whether an opening leaves enough wall above it. */
export function fitsUnderTop(
  opening: Pick<Opening, 'sill' | 'height'>,
  wallHeight: number,
): boolean {
  return opening.sill + opening.height <= wallHeight - OPENING_TOP_MARGIN + 1e-9
}

/**
 * The openings that do not fit their wall: reaching past its usable stretch, too tall for it,
 * or too close to another opening. They are kept in the plan but not cut into the wall.
 */
export function unfitOpenings(host: OpeningHost): Set<string> {
  const unfit = new Set<string>()
  if (host.openings.length === 0) return unfit
  const spans = wallClearSpans(host.corners, host.walls)
  for (const opening of host.openings) {
    const wall = host.getWall(opening.wallId)
    const span = spans.get(opening.wallId)
    const from = opening.offset - opening.width / 2
    const to = opening.offset + opening.width / 2
    if (!wall || !span || !fitsUnderTop(opening, wall.height)) {
      unfit.add(opening.id)
      continue
    }
    if (from < span.min - 1e-6 || to > span.max + 1e-6) unfit.add(opening.id)
    for (const other of host.openings) {
      if (other === opening || other.wallId !== opening.wallId) continue
      const gap = Math.abs(other.offset - opening.offset) - (other.width + opening.width) / 2
      if (gap < OPENING_GAP - 1e-6) unfit.add(opening.id)
    }
  }
  return unfit
}

/** The middle of an opening on the plan. */
export function openingCentre(opening: Pick<Opening, 'offset'>, start: Point, end: Point): Point {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < EPSILON) return { x: start.x, y: start.y }
  const t = opening.offset / length
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
}

/**
 * An opening's outline on the plan: its width by the wall's thickness. Counter-clockwise,
 * starting at the back of the wall on the side nearer the wall's start.
 */
export function openingOutline(
  opening: Pick<Opening, 'offset' | 'width'>,
  start: Point,
  end: Point,
  thickness: number,
): Point[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < EPSILON) return []
  const ax = (end.x - start.x) / length
  const ay = (end.y - start.y) / length
  const at = (along: number, side: number): Point => ({
    x: start.x + ax * along - ay * side,
    y: start.y + ay * along + ax * side,
  })
  const from = opening.offset - opening.width / 2
  const to = opening.offset + opening.width / 2
  const half = thickness / 2
  return [at(from, -half), at(to, -half), at(to, half), at(from, half)]
}

/** The id of the opening under a point, within `tolerance` metres of its wall's faces. */
export function openingAt(point: Point, host: OpeningHost, tolerance: number): string | null {
  for (let i = host.openings.length - 1; i >= 0; i--) {
    const opening = host.openings[i]!
    const wall = host.getWall(opening.wallId)
    const start = wall && host.getCorner(wall.start)
    const end = wall && host.getCorner(wall.end)
    if (!wall || !start || !end) continue
    const { along, distance } = projectOntoWall(point, start, end)
    if (
      Math.abs(along - opening.offset) <= opening.width / 2 &&
      distance <= wall.thickness / 2 + tolerance
    ) {
      return opening.id
    }
  }
  return null
}

/** The wall whose centreline is nearest to a point, and where along it the point falls. */
export function nearestWall(
  point: Point,
  host: Pick<OpeningHost, 'walls' | 'getCorner'>,
): { wallId: string; along: number; distance: number } | null {
  let best: { wallId: string; along: number; distance: number } | null = null
  for (const wall of host.walls) {
    const start = host.getCorner(wall.start)
    const end = host.getCorner(wall.end)
    if (!start || !end) continue
    const { along, distance, length } = projectOntoWall(point, start, end)
    // Past an end, the distance is to the end point, not to the line.
    const overshoot = along < 0 ? -along : along > length ? along - length : 0
    const d = Math.hypot(distance, overshoot)
    if (!best || d < best.distance) best = { wallId: wall.id, along, distance: d }
  }
  return best
}

export interface OpeningSnapSettings {
  enabled: boolean
  /** Offsets round to this step, in metres. */
  step: number
  /** Within this distance of the middle of the wall, an opening snaps to the middle. Metres. */
  centre: number
}

export const defaultOpeningSnapSettings: OpeningSnapSettings = {
  enabled: true,
  step: 0.05,
  centre: 0.08,
}

/** Snaps a dragged opening's offset to the middle of its wall, or else to the step. */
export function snapOpeningOffset(
  along: number,
  wallLength: number,
  settings: OpeningSnapSettings = defaultOpeningSnapSettings,
): number {
  if (!settings.enabled) return along
  if (Math.abs(along - wallLength / 2) <= settings.centre) return wallLength / 2
  if (settings.step <= 0) return along
  return Number((Math.round(along / settings.step) * settings.step).toFixed(6))
}

/** The next of a door's four ways to hang: the hinge changes ends, then the swing changes sides. */
export function nextDoorSwing(
  door: Pick<Opening, 'hinge' | 'swing'>,
): Pick<Opening, 'hinge' | 'swing'> {
  if (door.hinge === 'start') return { hinge: 'end', swing: door.swing }
  return { hinge: 'start', swing: door.swing === 'front' ? 'back' : 'front' }
}
