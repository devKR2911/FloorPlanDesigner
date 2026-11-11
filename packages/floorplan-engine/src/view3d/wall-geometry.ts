import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { FootprintEdge, WallFootprint } from '../model/wall-footprints.js'
import { toScene } from './coordinates.js'
import { triangulate } from './triangulate.js'

/**
 * The material slot of each part of a wall, so the two sides can be coloured separately later.
 * Ends and joins share a slot. With a single material the slots make no difference.
 */
export const WALL_FACE = { front: 0, back: 1, top: 2, end: 3 } as const

const SLOT_OF_EDGE: Record<FootprintEdge, number> = {
  front: WALL_FACE.front,
  back: WALL_FACE.back,
  end: WALL_FACE.end,
  join: WALL_FACE.end,
}

/**
 * Builds a wall as a solid: its footprint raised from the floor to `height`, with a top face and
 * one upright face per footprint edge. There is no bottom face. The faces where the wall meets a
 * neighbour are included, so a taller wall is closed where it stands above a shorter one.
 */
export function buildWallGeometry(footprint: WallFootprint, height: number): BufferGeometry {
  const { polygon, edges } = footprint
  // Positions and normals are collected per material slot, then laid end to end.
  const positions: number[][] = [[], [], [], []]
  const normals: number[][] = [[], [], [], []]

  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i]!
    const to = polygon[(i + 1) % polygon.length]!
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length === 0) continue
    const slot = SLOT_OF_EDGE[edges[i]!]
    // The outside of a counter-clockwise outline is to the right of each edge.
    const normal = toScene({ x: dy / length, y: -dx / length })
    const a = toScene(from)
    const b = toScene(to)
    const c = toScene(to, height)
    const d = toScene(from, height)
    positions[slot]!.push(...a, ...b, ...c, ...a, ...c, ...d)
    for (let vertex = 0; vertex < 6; vertex++) normals[slot]!.push(...normal)
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
