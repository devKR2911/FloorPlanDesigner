import {
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { ItemSize } from '../schema/item-definition.js'

/** Loads a model file and resolves with its scene. */
export type ModelLoader = (url: string) => Promise<Object3D>

/**
 * A loader for GLB and glTF files. The Draco decoder is fetched from `dracoPath` only if a model
 * is compressed with it.
 */
export function createGltfLoader(dracoPath?: string): { load: ModelLoader; dispose: () => void } {
  const gltf = new GLTFLoader()
  let draco: DRACOLoader | null = null
  if (dracoPath) {
    draco = new DRACOLoader().setDecoderPath(dracoPath)
    gltf.setDRACOLoader(draco)
  }
  return {
    load: async (url) => (await gltf.loadAsync(url)).scene,
    dispose: () => draco?.dispose(),
  }
}

interface Template {
  scene: Object3D
  /** The model's bounding box in its own units. */
  box: Box3
}

/**
 * Loads each model file once and hands out copies. Copies share geometry and materials, so a
 * plan with ten of the same chair holds one chair's worth of data.
 */
export class ModelLibrary {
  private readonly templates = new Map<string, Promise<Template>>()
  private disposed = false

  constructor(private readonly load: ModelLoader) {}

  /** How many different model files have been asked for. */
  get size(): number {
    return this.templates.size
  }

  /**
   * A copy of the model at `url`, scaled to `size` in metres along each axis and moved so that
   * its origin is the middle of its base. Rejects if the file cannot be loaded; a failed file is
   * not asked for again.
   */
  async instance(url: string, size: ItemSize): Promise<Object3D> {
    let template = this.templates.get(url)
    if (!template) {
      template = this.load(url).then(prepare)
      this.templates.set(url, template)
    }
    const { scene, box } = await template
    if (this.disposed) throw new Error('ModelLibrary has been disposed')

    const model = scene.clone(true)
    const measured = box.getSize(new Vector3())
    const scale = new Vector3(
      ratio(size.width, measured.x),
      ratio(size.height, measured.y),
      ratio(size.depth, measured.z),
    )
    const centre = box.getCenter(new Vector3())
    model.scale.multiply(scale)
    model.position.set(-centre.x * scale.x, -box.min.y * scale.y, -centre.z * scale.z)
    const wrapper = new Group()
    wrapper.add(model)
    return wrapper
  }

  /** Releases every loaded model's geometry and materials. Copies already handed out stop working. */
  dispose(): void {
    this.disposed = true
    for (const template of this.templates.values()) {
      template
        .then(({ scene }) => disposeObject(scene))
        .catch(() => {
          // A file that failed to load has nothing to release.
        })
    }
    this.templates.clear()
  }
}

function ratio(target: number, measured: number): number {
  return measured > 1e-6 ? target / measured : 1
}

/**
 * Gets a loaded model ready to be copied: unlit materials are swapped for lit ones of the same
 * colour, so the model is shaded like the walls, and its bounding box is measured.
 */
function prepare(scene: Object3D): Template {
  const replaced = new Map<Material, Material>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const swap = (material: Material): Material => {
      if (!(material instanceof MeshBasicMaterial)) return material
      let lit = replaced.get(material)
      if (!lit) {
        lit = new MeshStandardMaterial({
          name: material.name,
          color: material.color,
          map: material.map,
          vertexColors: material.vertexColors,
          transparent: material.transparent,
          opacity: material.opacity,
          side: material.side,
          roughness: 0.85,
        })
        replaced.set(material, lit)
        material.dispose()
      }
      return lit
    }
    object.material = Array.isArray(object.material)
      ? object.material.map(swap)
      : swap(object.material)
  })
  scene.updateMatrixWorld(true)
  return { scene, box: new Box3().setFromObject(scene) }
}

/** Disposes every geometry and material under an object. */
export function disposeObject(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    object.geometry.dispose()
    const materials: Material[] = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) material.dispose()
  })
}
