import { Vector3, type BufferGeometry } from 'three'
import { describe, expect, it } from 'vitest'
import { wallFootprints } from '../model/wall-footprints.js'
import { toPlan, toScene } from './coordinates.js'
import { buildFloorGeometry } from './floor-geometry.js'
import { WALL_FACE, buildWallGeometry } from './wall-geometry.js'

interface Triangle {
  centre: Vector3
  /** From the winding of the three points. */
  facing: Vector3
  /** The normal stored on the first vertex. */
  stored: Vector3
  area: number
}

function triangles(geometry: BufferGeometry): Triangle[] {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const index = geometry.getIndex()
  const count = index ? index.count : position.count
  const vertex = (i: number) =>
    new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i)
  const result: Triangle[] = []
  for (let i = 0; i < count; i += 3) {
    const [a, b, c] = [vertex(i), vertex(i + 1), vertex(i + 2)]
    const cross = b.clone().sub(a).cross(c.clone().sub(a))
    result.push({
      centre: a.clone().add(b).add(c).divideScalar(3),
      facing: cross.clone().normalize(),
      stored: new Vector3().fromBufferAttribute(normal, index ? index.getX(i) : i),
      area: cross.length() / 2,
    })
  }
  return result
}

function loneWall(): BufferGeometry {
  const [footprint] = wallFootprints(
    [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
    ],
    [{ id: 'w', start: 'a', end: 'b', thickness: 0.2 }],
  )
  return buildWallGeometry(footprint!, 2.5)
}

describe('coordinates', () => {
  it('maps plan y to scene -z and back', () => {
    expect(toScene({ x: 1, y: 2 }, 3)).toEqual([1, 3, -2])
    expect(toPlan({ x: 1, z: -2 })).toEqual({ x: 1, y: 2 })
  })
})

describe('buildWallGeometry', () => {
  it('builds a lone wall as four sides and a top', () => {
    const geometry = loneWall()
    // Two triangles for each of the four sides and for the top.
    expect(geometry.getAttribute('position').count).toBe(30)
    expect(geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: WALL_FACE.front },
      { start: 6, count: 6, materialIndex: WALL_FACE.back },
      { start: 12, count: 6, materialIndex: WALL_FACE.top },
      { start: 18, count: 12, materialIndex: WALL_FACE.end },
    ])
  })

  it('has the size of the wall', () => {
    const geometry = loneWall()
    geometry.computeBoundingBox()
    const { min, max } = geometry.boundingBox!
    expect(min.toArray()).toEqual([0, 0, expect.closeTo(-0.1)])
    expect(max.toArray()).toEqual([4, 2.5, expect.closeTo(0.1)])
  })

  it('faces every triangle outwards, matching its stored normal', () => {
    const centre = new Vector3(2, 1.25, 0)
    for (const triangle of triangles(loneWall())) {
      expect(triangle.facing.distanceTo(triangle.stored)).toBeCloseTo(0)
      expect(triangle.facing.dot(triangle.centre.clone().sub(centre))).toBeGreaterThan(0)
    }
  })

  it('puts the front face on the left of the wall, which is scene -z for a wall along x', () => {
    const geometry = loneWall()
    const front = triangles(geometry).slice(0, 2)
    for (const triangle of front) expect(triangle.stored.toArray()).toEqual([0, 0, -1])
  })

  it('closes a joined wall with a face for each outline edge', () => {
    const footprints = wallFootprints(
      [
        { id: 'a', x: 4, y: 0 },
        { id: 'b', x: 0, y: 0 },
        { id: 'c', x: 0, y: 3 },
      ],
      [
        { id: 'ba', start: 'b', end: 'a', thickness: 0.2 },
        { id: 'bc', start: 'b', end: 'c', thickness: 0.2 },
      ],
    )
    const geometry = buildWallGeometry(footprints[0]!, 2.5)
    // Five outline edges and a five-sided top of three triangles.
    expect(geometry.getAttribute('position').count).toBe(5 * 6 + 3 * 3)
    const top = triangles(geometry).filter((triangle) => triangle.stored.y === 1)
    expect(top.reduce((sum, triangle) => sum + triangle.area, 0)).toBeCloseTo(0.8)
    for (const triangle of top) expect(triangle.facing.y).toBeCloseTo(1)
  })
})

describe('buildFloorGeometry', () => {
  const lShape = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 2, y: 2 },
    { x: 2, y: 4 },
    { x: 0, y: 4 },
  ]

  it('covers the room, flat on the floor and facing up', () => {
    const all = triangles(buildFloorGeometry(lShape))
    expect(all.reduce((sum, triangle) => sum + triangle.area, 0)).toBeCloseTo(12)
    for (const triangle of all) {
      expect(triangle.centre.y).toBe(0)
      expect(triangle.facing.y).toBeCloseTo(1)
    }
  })

  it('faces up for a clockwise polygon too', () => {
    const all = triangles(buildFloorGeometry([...lShape].reverse()))
    expect(all.reduce((sum, triangle) => sum + triangle.area, 0)).toBeCloseTo(12)
    for (const triangle of all) expect(triangle.facing.y).toBeCloseTo(1)
  })
})
