import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { Point } from '../model/geometry.js'
import { toScene } from './coordinates.js'
import { triangulate } from './triangulate.js'

/**
 * Builds a room's floor: the polygon laid flat at height 0, facing up. Texture coordinates are
 * the plan coordinates in metres, ready for a tiled floor texture.
 */
export function buildFloorGeometry(polygon: readonly Point[]): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  for (const point of polygon) {
    positions.push(...toScene(point))
    normals.push(0, 1, 0)
    uvs.push(point.x, point.y)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(triangulate(polygon))
  return geometry
}
