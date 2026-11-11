import {
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type ColorRepresentation,
} from 'three'
import { Emitter, type Listener } from '../core/events.js'
import type { Selection } from '../core/selection.js'
import type { Floorplan } from '../model/floorplan.js'
import { wallFootprints } from '../model/wall-footprints.js'
import { unfitOpenings } from '../model/wall-openings.js'
import { buildFloorGeometry } from './floor-geometry.js'
import {
  buildOpeningObject,
  type OpeningMaterials,
  type OpeningPartData,
} from './opening-geometry.js'
import { buildWallGeometry, type WallCut } from './wall-geometry.js'

export interface PlanSceneColors {
  wall: ColorRepresentation
  floor: ColorRepresentation
  /** The frame of a door or window. */
  frame: ColorRepresentation
  door: ColorRepresentation
  glass: ColorRepresentation
  /** The frame of the selected door or window. */
  selected: ColorRepresentation
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

/** What a door's or window's group carries in `userData`. */
export interface OpeningObjectData {
  kind: 'opening'
  id: string
  wallId: string
}

/** What a floor mesh carries in `userData`. */
export interface FloorMeshData {
  kind: 'floor'
  /** The id of the room. */
  id: string
}

/**
 * The walls, floors, doors and windows of a plan as meshes, kept in step with a `Floorplan`.
 * Walls are built with a hole for each door and window that fits.
 *
 * Every change to the plan, except to its items, rebuilds all of them. While the scene is inactive (its view is
 * hidden) a change only marks it out of date, and the rebuild happens once on activation.
 */
export class PlanScene {
  /** Add this to a scene. It holds every wall and floor mesh. */
  readonly group = new Group()

  private readonly wallGroup = new Group()
  private readonly floorGroup = new Group()
  private readonly openingGroup = new Group()
  private readonly wallMaterial: MeshStandardMaterial
  private readonly floorMaterial: MeshStandardMaterial
  private readonly openingMaterials: OpeningMaterials
  private readonly selectedFrameMaterial: MeshStandardMaterial
  private selection: Selection = null
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
    this.openingMaterials = {
      frame: new MeshStandardMaterial({ color: colors.frame, roughness: 0.7 }),
      leaf: new MeshStandardMaterial({ color: colors.door, roughness: 0.8 }),
      glass: new MeshStandardMaterial({
        color: colors.glass,
        roughness: 0.1,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
      pick: new MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    }
    this.selectedFrameMaterial = new MeshStandardMaterial({
      color: colors.selected,
      roughness: 0.7,
    })
    this.group.add(this.floorGroup, this.wallGroup, this.openingGroup)
    this.stopWatching = floorplan.on('change', ({ kind }) => {
      // Items have their own scene; walls and floors stay as they are.
      if (kind === 'items') return
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

  /** One group per door or window that fits its wall. */
  get openingObjects(): readonly Group[] {
    return this.openingGroup.children as Group[]
  }

  /** Shows the selected door or window with a coloured frame. */
  setSelection(selection: Selection): void {
    this.selection = selection
    this.applySelection()
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
    for (const material of Object.values(this.openingMaterials)) material.dispose()
    this.selectedFrameMaterial.dispose()
    this.emitter.clear()
  }

  private rebuild(): void {
    this.clear()
    const { floorplan } = this
    const unfit = unfitOpenings(floorplan)
    for (const footprint of wallFootprints(floorplan.corners, floorplan.walls)) {
      const wall = floorplan.getWall(footprint.wallId)!
      const start = floorplan.getCorner(wall.start)!
      const end = floorplan.getCorner(wall.end)!
      const length = Math.hypot(end.x - start.x, end.y - start.y)
      // An opening that does not fit its wall is neither cut nor shown.
      const openings = floorplan.openingsOf(wall.id).filter((opening) => !unfit.has(opening.id))
      const cut: WallCut | undefined =
        openings.length > 0
          ? {
              origin: start,
              direction: { x: (end.x - start.x) / length, y: (end.y - start.y) / length },
              holes: openings.map((opening) => ({
                from: opening.offset - opening.width / 2,
                to: opening.offset + opening.width / 2,
                bottom: opening.sill,
                top: opening.sill + opening.height,
              })),
            }
          : undefined
      const mesh = new Mesh(buildWallGeometry(footprint, wall.height, cut), this.wallMaterial)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData = { kind: 'wall', id: wall.id, height: wall.height } satisfies WallMeshData
      this.wallGroup.add(mesh)

      for (const opening of openings) {
        const object = buildOpeningObject(
          opening,
          { start, end, thickness: wall.thickness },
          this.openingMaterials,
        )
        object.userData = {
          kind: 'opening',
          id: opening.id,
          wallId: wall.id,
        } satisfies OpeningObjectData
        this.openingGroup.add(object)
      }
    }
    this.applySelection()
    for (const room of floorplan.rooms) {
      const mesh = new Mesh(buildFloorGeometry(room.polygon), this.floorMaterial)
      mesh.receiveShadow = true
      mesh.userData = { kind: 'floor', id: room.id } satisfies FloorMeshData
      this.floorGroup.add(mesh)
    }
    this.outOfDate = false
    this.emitter.emit('rebuild', undefined)
  }

  private applySelection(): void {
    for (const object of this.openingObjects) {
      const { id } = object.userData as OpeningObjectData
      const selected = this.selection?.kind === 'opening' && this.selection.id === id
      object.traverse((child) => {
        if (child instanceof Mesh && (child.userData as OpeningPartData).part === 'frame') {
          child.material = selected ? this.selectedFrameMaterial : this.openingMaterials.frame
        }
      })
    }
  }

  private clear(): void {
    for (const mesh of [...this.wallMeshes, ...this.floorMeshes]) mesh.geometry.dispose()
    this.openingGroup.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose()
    })
    this.wallGroup.clear()
    this.floorGroup.clear()
    this.openingGroup.clear()
  }
}
