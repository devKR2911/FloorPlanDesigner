import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Point } from '../model/geometry.js'
import type { FootprintEdge, WallFootprint } from '../model/wall-footprints.js'
import { toScene, type ScenePosition } from './coordinates.js'
import { triangulate } from './triangulate.js'

/**
 * The material slot of each part of a wall, so the two sides can be coloured separately later.
 * Ends, joins and the faces inside an opening share a slot. With a single material the slots
 * make no difference.
 */
export const WALL_FACE = { front: 0, back: 1, top: 2, end: 3 } as const

const SLOT_OF_EDGE: Record<FootprintEdge, number> = {
  front: WALL_FACE.front,
  back: WALL_FACE.back,
  end: WALL_FACE.end,
  join: WALL_FACE.end,
}

/** A door's threshold sits this far above the floor, so the two never share a plane. Metres. */
const THRESHOLD_LIFT = 0.002

/** A rectangular hole through a wall, for a door or window. Metres. */
export interface WallHole {
  /** Where the hole starts and ends, as distances along the wall from its start corner. */
  from: number
  to: number
  /** Heights of the bottom and top of the hole above the floor. */
  bottom: number
  top: number
}

/** The holes to cut in a wall, and the wall's centreline to measure them along. */
export interface WallCut {
  /** The wall's start corner. */
  origin: Point
  /** Unit vector from the wall's start corner towards its end corner. */
  direction: Point
  holes: readonly WallHole[]
}

/** A rectangle on a wall face: `u` along the wall, `y` up. */
export interface FaceRectangle {
  u0: number
  u1: number
  y0: number
  y1: number
}

/**
 * Splits a wall face, from `from` to `to` along the wall and `height` tall, into plain
 * rectangles around its holes: a full-height strip between holes, and a strip below and above
 * each one. Holes are expected not to overlap.
 */
export function faceRectangles(
  from: number,
  to: number,
  height: number,
  holes: readonly WallHole[],
): FaceRectangle[] {
  const rectangles: FaceRectangle[] = []
  const add = (u0: number, u1: number, y0: number, y1: number) => {
    if (u1 - u0 > 1e-9 && y1 - y0 > 1e-9) rectangles.push({ u0, u1, y0, y1 })
  }
  let cursor = from
  for (const hole of [...holes].sort((a, b) => a.from - b.from)) {
    const start = Math.max(hole.from, cursor)
    const end = Math.min(hole.to, to)
    if (end <= start) continue
    add(cursor, start, 0, height)
    add(start, end, 0, Math.max(0, hole.bottom))
    add(start, end, Math.min(height, hole.top), height)
    cursor = end
  }
  add(cursor, to, 0, height)
  return rectangles
}

/**
 * Builds a wall as a solid: its footprint raised from the floor to `height`, with a top face and
 * one upright face per footprint edge. There is no bottom face. The faces where the wall meets a
 * neighbour are included, so a taller wall is closed where it stands above a shorter one.
 *
 * With a `cut`, the front and back faces are built around its holes and each hole gets its four
 * inner faces, so the wall reads as solid from every side.
 */
export function buildWallGeometry(
  footprint: WallFootprint,
  height: number,
  cut?: WallCut,
): BufferGeometry {
  const { polygon, edges } = footprint
  // Positions and normals are collected per material slot, then laid end to end.
  const positions: number[][] = [[], [], [], []]
  const normals: number[][] = [[], [], [], []]

  /** Adds a four-sided face. The corners go round the face; either way round is accepted. */
  const quad = (slot: number, corners: ScenePosition[], normal: ScenePosition) => {
    const [a, b, c, d] = corners as [ScenePosition, ScenePosition, ScenePosition, ScenePosition]
    const ordered = facesAlong(a, b, c, normal) ? [a, b, c, a, c, d] : [a, d, c, a, c, b]
    for (const vertex of ordered) {
      positions[slot]!.push(...vertex)
      normals[slot]!.push(...normal)
    }
  }

  const holes = cut?.holes ?? []
  /** How far each long face is to the left of the centreline. Known once its edge is seen. */
  const faceOffset: { front?: number; back?: number } = {}
  /** A point on the wall: `u` along the centreline, `side` to its left, `y` up. */
  const at = (u: number, side: number, y: number): ScenePosition => {
    const { origin, direction } = cut!
    return toScene(
      {
        x: origin.x + direction.x * u - direction.y * side,
        y: origin.y + direction.y * u + direction.x * side,
      },
      y,
    )
  }

  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]!
    const to = polygon[(i + 1) % polygon.length]!
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    const edge = edges[i]!
    const slot = SLOT_OF_EDGE[edge]
    // The outside of a counter-clockwise outline is to the right of each edge.
    const normal = toScene({ x: dy / length, y: -dx / length })

    if (cut && holes.length > 0 && (edge === 'front' || edge === 'back')) {
      const { origin, direction } = cut
      const along = (p: Point) => (p.x - origin.x) * direction.x + (p.y - origin.y) * direction.y
      const side = (from.x - origin.x) * -direction.y + (from.y - origin.y) * direction.x
      faceOffset[edge] = side
      const [u0, u1] = [Math.min(along(from), along(to)), Math.max(along(from), along(to))]
      for (const r of faceRectangles(u0, u1, height, holes)) {
        quad(
          slot,
          [at(r.u0, side, r.y0), at(r.u1, side, r.y0), at(r.u1, side, r.y1), at(r.u0, side, r.y1)],
          normal,
        )
      }
      continue
    }

    quad(slot, [toScene(from), toScene(to), toScene(to, height), toScene(from, height)], normal)
  }

  // The inside of each hole: its two sides, its top, and its sill or threshold.
  const { front, back } = faceOffset
  if (cut && front !== undefined && back !== undefined) {
    const towardsEnd = toScene(cut.direction)
    const towardsStart = toScene({ x: -cut.direction.x, y: -cut.direction.y })
    for (const hole of holes) {
      const bottom = hole.bottom > 0 ? hole.bottom : THRESHOLD_LIFT
      const across = (u: number, y0: number, y1: number) => [
        at(u, front, y0),
        at(u, back, y0),
        at(u, back, y1),
        at(u, front, y1),
      ]
      const level = (y: number) => [
        at(hole.from, front, y),
        at(hole.to, front, y),
        at(hole.to, back, y),
        at(hole.from, back, y),
      ]
      quad(WALL_FACE.end, across(hole.from, bottom, hole.top), towardsEnd)
      quad(WALL_FACE.end, across(hole.to, bottom, hole.top), towardsStart)
      quad(WALL_FACE.end, level(hole.top), [0, -1, 0])
      quad(WALL_FACE.end, level(bottom), [0, 1, 0])
    }
  }

  for (const index of triangulate(polygon)) {
    positions[WALL_FACE.top]!.push(...toScene(polygon[index]!, height))
    normals[WALL_FACE.top]!.push(0, 1, 0)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions.flat(), 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals.flat(), 3))
  let start = 0
  positions.forEach((slotPositions, slot) => {
    const count = slotPositions.length / 3
    if (count > 0) geometry.addGroup(start, count, slot)
    start += count
  })
  return geometry
}

/** Whether the triangle a, b, c winds so that it faces along `normal`. */
function facesAlong(
  a: ScenePosition,
  b: ScenePosition,
  c: ScenePosition,
  normal: ScenePosition,
): boolean {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ] as const
  return cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0
}
