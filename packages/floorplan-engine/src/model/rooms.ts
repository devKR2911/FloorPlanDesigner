import type { Corner, Wall } from '../schema/plan.js'
import { EPSILON, angleOf, signedArea, type Point } from './geometry.js'

export interface DetectedRoom {
  /** The sorted corner ids joined with `-`, so it survives edits that keep the same corners. */
  id: string
  /** Counter-clockwise. */
  cornerIds: string[]
  /** `wallIds[i]` joins `cornerIds[i]` to the next corner. */
  wallIds: string[]
}

/** `front` is the left side when walking a wall from `start` to `end`; `back` is the right side. */
export type WallSide = 'front' | 'back'

export interface RoomDetection {
  rooms: DetectedRoom[]
  /** For each wall that borders a room, the room on each side. */
  wallSides: Map<string, Partial<Record<WallSide, string>>>
}

type WallRef = Pick<Wall, 'id' | 'start' | 'end'>

interface HalfEdge {
  from: string
  to: string
  wallId: string
}

/**
 * Finds the rooms in a plan: the bounded faces of the planar graph whose vertices are the
 * corners and whose edges are the walls.
 *
 * Every wall gives two half-edges. Starting from each unvisited half-edge, the walk leaves each
 * corner by the next wall clockwise from the one it arrived on. That traces every face once with
 * its interior on the left, so rooms come out counter-clockwise and the outside of each connected
 * group of walls comes out clockwise and is dropped. Walls that dangle into a face are walked out
 * and straight back, and those spikes are removed from the result.
 *
 * Walls that cross without a corner at the crossing are not supported; the result is then
 * undefined but still finite.
 */
export function findRooms(corners: readonly Corner[], walls: readonly WallRef[]): RoomDetection {
  const cornerById = new Map(corners.map((corner) => [corner.id, corner]))
  const wallById = new Map(walls.map((wall) => [wall.id, wall]))

  const outgoing = new Map<string, HalfEdge[]>()
  const addEdge = (edge: HalfEdge) => {
    const list = outgoing.get(edge.from)
    if (list) list.push(edge)
    else outgoing.set(edge.from, [edge])
  }
  for (const wall of walls) {
    if (!cornerById.has(wall.start) || !cornerById.has(wall.end)) continue
    addEdge({ from: wall.start, to: wall.end, wallId: wall.id })
    addEdge({ from: wall.end, to: wall.start, wallId: wall.id })
  }
  for (const [cornerId, edges] of outgoing) {
    const origin = cornerById.get(cornerId)!
    const angle = (edge: HalfEdge) => angleOf(direction(origin, cornerById.get(edge.to)!))
    edges.sort((a, b) => angle(a) - angle(b))
  }

  const visited = new Set<string>()
  const rooms: DetectedRoom[] = []
  const wallSides: RoomDetection['wallSides'] = new Map()
  const usedIds = new Map<string, number>()

  for (const edges of outgoing.values()) {
    for (const start of edges) {
      if (visited.has(key(start))) continue

      const loop: HalfEdge[] = []
      let edge = start
      do {
        visited.add(key(edge))
        loop.push(edge)
        const next = outgoing.get(edge.to)!
        const arrivedOn = next.findIndex((candidate) => candidate.to === edge.from)
        edge = next[(arrivedOn - 1 + next.length) % next.length]!
      } while (key(edge) !== key(start))

      const trimmed = removeSpikes(loop)
      if (trimmed.length < 3) continue
      const polygon = trimmed.map((half) => cornerById.get(half.from)!)
      if (signedArea(polygon) <= EPSILON) continue

      const cornerIds = trimmed.map((half) => half.from)
      const baseId = [...cornerIds].sort().join('-')
      const collisions = usedIds.get(baseId) ?? 0
      usedIds.set(baseId, collisions + 1)
      const id = collisions === 0 ? baseId : `${baseId}#${collisions + 1}`

      rooms.push({ id, cornerIds, wallIds: trimmed.map((half) => half.wallId) })
      for (const half of trimmed) {
        const wall = wallById.get(half.wallId)!
        const side: WallSide = half.from === wall.start ? 'front' : 'back'
        const sides = wallSides.get(wall.id) ?? {}
        sides[side] = id
        wallSides.set(wall.id, sides)
      }
    }
  }

  rooms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { rooms, wallSides }
}

function key(edge: HalfEdge): string {
  return `${edge.from}>${edge.to}`
}

function direction(from: Point, to: Point): Point {
  return { x: to.x - from.x, y: to.y - from.y }
}

/** Removes every half-edge that is immediately followed by its reverse, including across the loop's seam. */
function removeSpikes(loop: HalfEdge[]): HalfEdge[] {
  const stack: HalfEdge[] = []
  for (const edge of loop) {
    const top = stack[stack.length - 1]
    if (top && isReverse(top, edge)) stack.pop()
    else stack.push(edge)
  }
  while (stack.length >= 2 && isReverse(stack[stack.length - 1]!, stack[0]!)) {
    stack.pop()
    stack.shift()
  }
  return stack
}

function isReverse(a: HalfEdge, b: HalfEdge): boolean {
  return a.from === b.to && a.to === b.from
}
