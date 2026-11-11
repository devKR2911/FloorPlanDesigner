import {
  Box3,
  BoxGeometry,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from 'three'
import { describe, expect, it } from 'vitest'
import { Floorplan } from '../model/floorplan.js'
import { ItemCatalog } from '../model/item-catalog.js'
import { floorPointFromRay } from './item-dragging.js'
import { ItemScene, type ItemLoadError } from './item-scene.js'
import { ModelLibrary } from './model-library.js'

/**
 * A stand-in for a model file: an unlit box 0.5 × 0.25 × 0.2 in its own units, placed off
 * centre and below the origin like the kit's models often are.
 */
function fakeModel(): Object3D {
  const geometry = new BoxGeometry(0.5, 0.25, 0.2)
  geometry.translate(0.25, 0.125 - 0.05, -0.1)
  const scene = new Group()
  scene.add(new Mesh(geometry, new MeshBasicMaterial({ color: 0xff0000 })))
  return scene
}

/** A loader that counts requests and can be made to fail or wait. */
function fakeLoader() {
  const requests: string[] = []
  const pending: (() => void)[] = []
  let hold = false
  return {
    requests,
    hold: () => (hold = true),
    release: () => pending.splice(0).forEach((resolve) => resolve()),
    load: (url: string) => {
      requests.push(url)
      if (url.includes('missing')) return Promise.reject(new Error(`404 ${url}`))
      if (!hold) return Promise.resolve(fakeModel())
      return new Promise<Object3D>((resolve) => pending.push(() => resolve(fakeModel())))
    },
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const sofa = { width: 2, height: 0.8, depth: 0.9 }

/** The box around an object's meshes, leaving out the selection outline. */
function measure(object: Object3D): Box3 {
  object.updateMatrixWorld(true)
  const box = new Box3()
  object.traverse((child) => {
    if (child instanceof Mesh) box.expandByObject(child)
  })
  return box
}

describe('ModelLibrary', () => {
  it('scales a model to its size and stands it on the origin', async () => {
    const library = new ModelLibrary(fakeLoader().load)
    const box = measure(await library.instance('/sofa.glb', sofa))
    expect(box.min.x).toBeCloseTo(-1)
    expect(box.max.x).toBeCloseTo(1)
    expect(box.min.y).toBeCloseTo(0)
    expect(box.max.y).toBeCloseTo(0.8)
    expect(box.min.z).toBeCloseTo(-0.45)
    expect(box.max.z).toBeCloseTo(0.45)
  })

  it('loads each file once and shares geometry and materials between copies', async () => {
    const loader = fakeLoader()
    const library = new ModelLibrary(loader.load)
    const [a, b] = await Promise.all([
      library.instance('/sofa.glb', sofa),
      library.instance('/sofa.glb', { ...sofa, width: 1 }),
    ])
    expect(loader.requests).toEqual(['/sofa.glb'])
    const meshOf = (object: Object3D) => {
      let found: Mesh | undefined
      object.traverse((child) => {
        if (child instanceof Mesh) found = child
      })
      return found!
    }
    expect(meshOf(a).geometry).toBe(meshOf(b).geometry)
    expect(meshOf(a).material).toBe(meshOf(b).material)
    expect(measure(b).max.x).toBeCloseTo(0.5)
  })

  it('swaps unlit materials for lit ones of the same colour', async () => {
    const library = new ModelLibrary(fakeLoader().load)
    const model = await library.instance('/sofa.glb', sofa)
    let material: unknown
    model.traverse((child) => {
      if (child instanceof Mesh) material = child.material
    })
    expect(material).toBeInstanceOf(MeshStandardMaterial)
    expect((material as MeshStandardMaterial).color.getHex()).toBe(0xff0000)
  })

  it('rejects for a file that fails, without asking for it again', async () => {
    const loader = fakeLoader()
    const library = new ModelLibrary(loader.load)
    await expect(library.instance('/missing.glb', sofa)).rejects.toThrow('404')
    await expect(library.instance('/missing.glb', sofa)).rejects.toThrow('404')
    expect(loader.requests).toEqual(['/missing.glb'])
  })
})

function setup(loader = fakeLoader()) {
  const floorplan = new Floorplan()
  const catalog = new ItemCatalog()
  catalog.set([
    { key: 'sofa', model: '/sofa.glb', size: sofa, placement: 'floor' },
    { key: 'broken', model: '/missing.glb', size: sofa, placement: 'floor' },
  ])
  const library = new ModelLibrary(loader.load)
  const scene = new ItemScene(floorplan, catalog, library, {
    placeholder: '#aaaaaa',
    selected: '#0000ff',
    overlap: '#ff0000',
  })
  const errors: ItemLoadError[] = []
  scene.on('error', (error) => errors.push(error))
  scene.setActive(true)
  return { floorplan, catalog, scene, loader, errors }
}

function outlineOf(object: Object3D): LineSegments {
  return object.children.find((child) => child instanceof LineSegments) as LineSegments
}

describe('ItemScene', () => {
  it('shows a box until the model has loaded, then the model', async () => {
    const { floorplan, scene, loader } = setup()
    loader.hold()
    const id = floorplan.addItem({ catalogKey: 'sofa', position: { x: 1, y: 2 } })
    expect(scene.hasModel(id)).toBe(false)
    expect(measure(scene.objects.get(id)!).max.y).toBeCloseTo(0.8)
    loader.release()
    await flush()
    expect(scene.hasModel(id)).toBe(true)
  })

  it('places and turns items to match the plan, updating them in place', async () => {
    const { floorplan, scene, loader } = setup()
    const id = floorplan.addItem({ catalogKey: 'sofa', position: { x: 1, y: 2 } })
    await flush()
    const object = scene.objects.get(id)!
    // Plan y is scene -z.
    expect(object.position.toArray()).toEqual([1, 0, -2])

    floorplan.updateItem(id, { position: { x: 3, y: 1 }, rotation: Math.PI / 2 })
    expect(scene.objects.get(id)).toBe(object)
    expect(object.position.toArray()).toEqual([3, 0, -1])
    // A quarter turn counter-clockwise: the sofa's width now runs along the plan's y axis.
    const box = measure(object)
    expect(box.max.z - box.min.z).toBeCloseTo(2)
    expect(box.max.x - box.min.x).toBeCloseTo(0.9)
    // The front, which faces scene +z (plan -y) at rotation 0, now faces scene +x (plan +x).
    const front = new Vector3(0, 0, 1).applyEuler(object.rotation)
    expect(front.x).toBeCloseTo(1)
    expect(loader.requests).toHaveLength(1)
  })

  it('removes objects of removed items', () => {
    const { floorplan, scene } = setup()
    const id = floorplan.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 } })
    floorplan.removeItem(id)
    expect(scene.objects.size).toBe(0)
    expect(scene.group.children).toHaveLength(0)
  })

  it('keeps a box and reports an error when a model fails to load', async () => {
    const { floorplan, scene, errors } = setup()
    const id = floorplan.addItem({ catalogKey: 'broken', position: { x: 0, y: 0 } })
    await flush()
    expect(scene.hasModel(id)).toBe(false)
    expect(errors).toEqual([
      { itemId: id, catalogKey: 'broken', model: '/missing.glb', error: expect.any(Error) },
    ])
  })

  it('shows an item whose key is not in the catalogue as a small box', () => {
    const { floorplan, scene, loader } = setup()
    const id = floorplan.addItem({ catalogKey: 'unknown', position: { x: 0, y: 0 } })
    expect(measure(scene.objects.get(id)!).max.y).toBeCloseTo(0.5)
    expect(loader.requests).toEqual([])
  })

  it('outlines the selected item and items that overlap', () => {
    const { floorplan, scene } = setup()
    const a = floorplan.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 } })
    const b = floorplan.addItem({ catalogKey: 'sofa', position: { x: 5, y: 0 } })
    expect(outlineOf(scene.objects.get(a)!).visible).toBe(false)
    scene.setSelection({ kind: 'item', id: a })
    expect(outlineOf(scene.objects.get(a)!).visible).toBe(true)
    expect(outlineOf(scene.objects.get(b)!).visible).toBe(false)

    floorplan.updateItem(b, { position: { x: 1, y: 0 } })
    const outlineA = outlineOf(scene.objects.get(a)!)
    const outlineB = outlineOf(scene.objects.get(b)!)
    expect(outlineB.visible).toBe(true)
    // Overlapping wins over selected, so the warning shows.
    expect(outlineA.material).toBe(outlineB.material)
  })

  it('waits while inactive and catches up on activation', () => {
    const { floorplan, scene } = setup()
    scene.setActive(false)
    floorplan.addItem({ catalogKey: 'sofa', position: { x: 0, y: 0 } })
    expect(scene.objects.size).toBe(0)
    scene.setActive(true)
    expect(scene.objects.size).toBe(1)
  })
})

describe('floorPointFromRay', () => {
  it('finds where a ray meets the floor, in plan coordinates', () => {
    const point = floorPointFromRay({ x: 0, y: 10, z: 0 }, { x: 1, y: -1, z: -2 })
    expect(point!.x).toBeCloseTo(10)
    expect(point!.y).toBeCloseTo(20)
  })

  it('misses for a ray that is level, points up, or meets the floor too far away', () => {
    expect(floorPointFromRay({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull()
    expect(floorPointFromRay({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(floorPointFromRay({ x: 0, y: 1, z: 0 }, { x: 1, y: -0.001, z: 0 })).toBeNull()
  })
})
