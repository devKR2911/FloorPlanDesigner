import { describe, expect, it } from 'vitest'
import { Floorplan } from '../model/floorplan.js'
import { PlanScene } from './plan-scene.js'
import { wallsFacingCamera } from './wall-cutaway.js'

/** A 4 m square room with its corner at the origin. Returns the wall ids by compass side. */
function squareRoom(floorplan: Floorplan) {
  const a = floorplan.addCorner(0, 0)
  const b = floorplan.addCorner(4, 0)
  const c = floorplan.addCorner(4, 4)
  const d = floorplan.addCorner(0, 4)
  return {
    corners: { a, b, c, d },
    south: floorplan.addWall(a, b),
    east: floorplan.addWall(b, c),
    north: floorplan.addWall(c, d),
    west: floorplan.addWall(d, a),
  }
}

const colors = { wall: '#ffffff', floor: '#cccccc' }

describe('PlanScene', () => {
  it('builds a mesh per wall and a floor per room', () => {
    const floorplan = new Floorplan()
    const room = squareRoom(floorplan)
    const scene = new PlanScene(floorplan, colors)
    scene.setActive(true)

    expect(scene.wallMeshes).toHaveLength(4)
    expect(scene.floorMeshes).toHaveLength(1)
    expect(scene.wallMeshes.map((mesh) => mesh.userData.id).sort()).toEqual(
      [room.south, room.east, room.north, room.west].sort(),
    )
    expect(scene.wallMeshes[0]!.userData).toMatchObject({ kind: 'wall', height: 2.5 })
    expect(scene.floorMeshes[0]!.userData).toEqual({ kind: 'floor', id: floorplan.rooms[0]!.id })
  })

  it('follows the plan while active', () => {
    const floorplan = new Floorplan()
    const room = squareRoom(floorplan)
    const scene = new PlanScene(floorplan, colors)
    scene.setActive(true)
    let rebuilds = 0
    scene.on('rebuild', () => rebuilds++)

    floorplan.updateWall(room.east, { height: 3 })
    expect(rebuilds).toBe(1)
    const east = scene.wallMeshes.find((mesh) => mesh.userData.id === room.east)!
    east.geometry.computeBoundingBox()
    expect(east.geometry.boundingBox!.max.y).toBe(3)

    floorplan.removeWall(room.east)
    expect(rebuilds).toBe(2)
    expect(scene.wallMeshes).toHaveLength(3)
    expect(scene.floorMeshes).toHaveLength(0)
  })

  it('does not rebuild while inactive, and rebuilds once on activation', () => {
    const floorplan = new Floorplan()
    const scene = new PlanScene(floorplan, colors)
    let rebuilds = 0
    scene.on('rebuild', () => rebuilds++)

    squareRoom(floorplan)
    expect(rebuilds).toBe(0)
    expect(scene.wallMeshes).toHaveLength(0)

    scene.setActive(true)
    expect(rebuilds).toBe(1)
    expect(scene.wallMeshes).toHaveLength(4)

    // Nothing changed, so switching off and on again does not rebuild.
    scene.setActive(false)
    scene.setActive(true)
    expect(rebuilds).toBe(1)
  })

  it('disposes the old geometries on rebuild and stops following after dispose', () => {
    const floorplan = new Floorplan()
    const room = squareRoom(floorplan)
    const scene = new PlanScene(floorplan, colors)
    scene.setActive(true)
    let disposed = 0
    for (const mesh of scene.wallMeshes) {
      mesh.geometry.addEventListener('dispose', () => disposed++)
    }

    floorplan.updateWall(room.south, { thickness: 0.3 })
    expect(disposed).toBe(4)

    scene.dispose()
    floorplan.removeWall(room.south)
    expect(scene.wallMeshes).toHaveLength(0)
  })
})

describe('wallsFacingCamera', () => {
  it('picks the outer walls the camera looks at from outside', () => {
    const floorplan = new Floorplan()
    const room = squareRoom(floorplan)
    expect(wallsFacingCamera(floorplan, { x: 10, y: 2 })).toEqual(new Set([room.east]))
    expect(wallsFacingCamera(floorplan, { x: 10, y: 10 })).toEqual(new Set([room.east, room.north]))
    expect(wallsFacingCamera(floorplan, { x: -3, y: -3 })).toEqual(new Set([room.west, room.south]))
  })

  it('picks nothing from inside the room', () => {
    const floorplan = new Floorplan()
    squareRoom(floorplan)
    expect(wallsFacingCamera(floorplan, { x: 2, y: 2 }).size).toBe(0)
  })

  it('picks nothing when the camera is straight above a wall', () => {
    const floorplan = new Floorplan()
    squareRoom(floorplan)
    expect(wallsFacingCamera(floorplan, { x: 4.05, y: 2 }).size).toBe(0)
    expect(wallsFacingCamera(floorplan, { x: 4.1, y: 2 }).size).toBe(1)
  })

  it('gives the same answer whichever way a wall was drawn', () => {
    const floorplan = new Floorplan()
    const a = floorplan.addCorner(0, 0)
    const b = floorplan.addCorner(4, 0)
    const c = floorplan.addCorner(4, 4)
    // Each wall is drawn against the direction of the room's loop.
    const south = floorplan.addWall(b, a)
    const east = floorplan.addWall(c, b)
    floorplan.addWall(a, c)
    expect(wallsFacingCamera(floorplan, { x: 2, y: -5 })).toEqual(new Set([south]))
    expect(wallsFacingCamera(floorplan, { x: 9, y: 2 })).toEqual(new Set([east]))
  })

  it('never picks a wall between two rooms or a wall that borders no room', () => {
    const floorplan = new Floorplan()
    const room = squareRoom(floorplan)
    const e = floorplan.addCorner(8, 0)
    const f = floorplan.addCorner(8, 4)
    floorplan.addWall(room.corners.b, e)
    const farEast = floorplan.addWall(e, f)
    floorplan.addWall(f, room.corners.c)
    const g = floorplan.addCorner(12, 0)
    floorplan.addWall(e, g)

    expect(floorplan.rooms).toHaveLength(2)
    // From the east: only the second room's outer wall. The shared wall and the spur stay.
    expect(wallsFacingCamera(floorplan, { x: 20, y: 2 })).toEqual(new Set([farEast]))
  })
})
