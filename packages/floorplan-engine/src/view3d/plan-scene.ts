import { Group, Mesh, MeshStandardMaterial, type ColorRepresentation } from 'three'
import { Emitter, type Listener } from '../core/events.js'
import type { Floorplan } from '../model/floorplan.js'
import { wallFootprints } from '../model/wall-footprints.js'
import { buildFloorGeometry } from './floor-geometry.js'
import { buildWallGeometry } from './wall-geometry.js'

export interface PlanSceneColors {
  wall: ColorRepresentation
  floor: ColorRepresentation
}

export type PlanSceneEvents = {
  /** The wall and floor meshes were rebuilt from the plan. */
  rebuild: undefined
}

/** What a wall mesh carries in `userData`. */
export interface WallMeshData {
  kind: 'wall'
  id: string
  /** The wall's full height in metres. */
  height: number
}

/** What a floor mesh carries in `userData`. */
export interface FloorMeshData {
  kind: 'floor'
  /** The id of the room. */
  id: string
}

/**
 * The walls and floors of a plan as meshes, kept in step with a `Floorplan`.
 *
 * Every change to the plan rebuilds all of them. While the scene is inactive (its view is
 * hidden) a change only marks it out of date, and the rebuild happens once on activation.
 */
export class PlanScene {
  /** Add this to a scene. It holds every wall and floor mesh. */
  readonly group = new Group()

  private readonly wallGroup = new Group()
  private readonly floorGroup = new Group()
  private readonly wallMaterial: MeshStandardMaterial
  private readonly floorMaterial: MeshStandardMaterial
  private readonly emitter = new Emitter<PlanSceneEvents>()
  private readonly stopWatching: () => void
  private active = false
  private outOfDate = true

  constructor(
    private readonly floorplan: Floorplan,
    colors: PlanSceneColors,
  ) {
    this.wallMaterial = new MeshStandardMaterial({ color: colors.wall, roughness: 0.9 })
    this.floorMaterial = new MeshStandardMaterial({ color: colors.floor, roughness: 0.95 })
    this.group.add(this.floorGroup, this.wallGroup)
    this.stopWatching = floorplan.on('change', () => {
      this.outOfDate = true
      if (this.active) this.rebuild()
    })
  }

  get wallMeshes(): readonly Mesh[] {
    return this.wallGroup.children as Mesh[]
  }

  get floorMeshes(): readonly Mesh[] {
    return this.floorGroup.children as Mesh[]
  }

  /** Turns rebuilding on or off. Turning it on rebuilds at once if the plan changed meanwhile. */
  setActive(active: boolean): void {
    this.active = active
    if (active && this.outOfDate) this.rebuild()
  }

  on<Name extends keyof PlanSceneEvents>(
    name: Name,
    listener: Listener<PlanSceneEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  dispose(): void {
    this.stopWatching()
    this.clear()
    this.wallMaterial.dispose()
    this.floorMaterial.dispose()
    this.emitter.clear()
  }

  private rebuild(): void {
    this.clear()
    const { floorplan } = this
    for (const footprint of wallFootprints(floorplan.corners, floorplan.walls)) {
      const { height } = floorplan.getWall(footprint.wallId)!
      const mesh = new Mesh(buildWallGeometry(footprint, height), this.wallMaterial)
      mesh.userData = { kind: 'wall', id: footprint.wallId, height } satisfies WallMeshData
      this.wallGroup.add(mesh)
    }
    for (const room of floorplan.rooms) {
      const mesh = new Mesh(buildFloorGeometry(room.polygon), this.floorMaterial)
      mesh.userData = { kind: 'floor', id: room.id } satisfies FloorMeshData
      this.floorGroup.add(mesh)
    }
    this.outOfDate = false
    this.emitter.emit('rebuild', undefined)
  }

  private clear(): void {
    for (const mesh of [...this.wallMeshes, ...this.floorMeshes]) mesh.geometry.dispose()
    this.wallGroup.clear()
    this.floorGroup.clear()
  }
}
