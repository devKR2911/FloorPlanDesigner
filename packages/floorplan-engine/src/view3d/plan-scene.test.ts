import { Box3, Mesh, type Object3D } from 'three'
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

const colors = {
  wall: '#ffffff',
  floor: '#cccccc',
  frame: '#eeeeee',
  door: '#aa8855',
  glass: '#88aacc',
  selected: '#0000ff',
}

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

describe('PlanScene openings', () => {
  function roomWithDoor() {
    const floorplan = new Floorplan({ wallThickness: 0.2 })
    const room = squareRoom(floorplan)
    const door = floorplan.addOpening({ wallId: room.south, kind: 'door', offset: 2 })
    const scene = new PlanScene(floorplan, colors)
    scene.setActive(true)
    return { floorplan, room, door, scene }
  }

  const partsOf = (object: Object3D, part: string) => {
    const found: Mesh[] = []
    object.traverse((child) => {
      if (child instanceof Mesh && child.userData.part === part) found.push(child)
    })
    return found
  }

  const boxOf = (object: Object3D) => {
    // World positions need the transforms of every parent, so update from the top.
    let root = object
    while (root.parent) root = root.parent
    root.updateMatrixWorld(true)
    return new Box3().setFromObject(object)
  }

  it('cuts the door out of its wall and adds a door object', () => {
    const { room, door, scene } = roomWithDoor()
    expect(scene.openingObjects).toHaveLength(1)
    const object = scene.openingObjects[0]!
    expect(object.userData).toEqual({ kind: 'opening', id: door, wallId: room.south })

    // The frame spans the opening: 0.9 m wide around x = 2, floor to 2.1 m, through the wall.
    const frame = new Box3()
    for (const mesh of partsOf(object, 'frame')) frame.union(boxOf(mesh))
    expect(frame.min.x).toBeCloseTo(1.55)
    expect(frame.max.x).toBeCloseTo(2.45)
    expect(frame.min.y).toBeCloseTo(0)
    expect(frame.max.y).toBeCloseTo(2.1)
    expect(frame.max.z - frame.min.z).toBeCloseTo(0.22)

    // The wall has less front face than its neighbours' 4 m × 2.5 m.
    const south = scene.wallMeshes.find((mesh) => mesh.userData.id === room.south)!
    const north = scene.wallMeshes.find((mesh) => mesh.userData.id === room.north)!
    expect(south.geometry.getAttribute('position').count).toBeGreaterThan(
      north.geometry.getAttribute('position').count,
    )
  })

  it('opens the door leaf towards its swing side, from its hinge', () => {
    const { floorplan, door, scene } = roomWithDoor()
    const leafBox = () => boxOf(partsOf(scene.openingObjects[0]!, 'leaf')[0]!)

    // The south wall runs along +x, so its front (left) side is plan +y: scene -z.
    let leaf = leafBox()
    expect(leaf.min.z).toBeLessThan(-0.5)
    expect(leaf.max.z).toBeLessThan(0)
    // Hinged at the start end of the opening, at x = 1.6.
    expect(leaf.min.x).toBeCloseTo(1.6, 1)

    floorplan.updateOpening(door, { swing: 'back', hinge: 'end' })
    leaf = leafBox()
    expect(leaf.max.z).toBeGreaterThan(0.5)
    expect(leaf.max.x).toBeCloseTo(2.4, 1)
  })

  it('builds a window with glass at its sill height', () => {
    const { floorplan, room, scene } = roomWithDoor()
    floorplan.addOpening({ wallId: room.east, kind: 'window', offset: 2 })
    const object = scene.openingObjects.find((o) => o.userData.wallId === room.east)!
    const glass = boxOf(partsOf(object, 'glass')[0]!)
    expect(glass.min.y).toBeCloseTo(0.95)
    expect(glass.max.y).toBeCloseTo(2.05)
    // The east wall runs up the plan at x = 4; the glass is in the middle of its thickness.
    expect((glass.min.x + glass.max.x) / 2).toBeCloseTo(4)
    expect(partsOf(object, 'leaf')).toHaveLength(0)
  })

  it('neither cuts nor shows an opening that does not fit', () => {
    const { floorplan, room, scene } = roomWithDoor()
    floorplan.updateWall(room.south, { height: 2 })
    expect(scene.openingObjects).toHaveLength(0)
    const south = scene.wallMeshes.find((mesh) => mesh.userData.id === room.south)!
    // A plain wall again: five outline edges and a top.
    expect(south.geometry.getAttribute('position').count).toBe(6 * 6 + 4 * 3)
  })

  it('colours the frame of the selected opening, also after a rebuild', () => {
    const { floorplan, door, scene } = roomWithDoor()
    const frameMaterial = () => partsOf(scene.openingObjects[0]!, 'frame')[0]!.material
    const plain = frameMaterial()
    scene.setSelection({ kind: 'opening', id: door })
    expect(frameMaterial()).not.toBe(plain)
    floorplan.updateOpening(door, { offset: 1.5 })
    expect(frameMaterial()).not.toBe(plain)
    scene.setSelection(null)
    expect(frameMaterial()).toBe(plain)
  })

  it('does not rebuild the walls when only an item changes', () => {
    const { floorplan, scene } = roomWithDoor()
    let rebuilds = 0
    scene.on('rebuild', () => rebuilds++)
    floorplan.addItem({ catalogKey: 'chair', position: { x: 2, y: 2 } })
    expect(rebuilds).toBe(0)
  })
})
