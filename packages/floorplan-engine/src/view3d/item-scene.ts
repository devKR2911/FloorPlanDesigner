import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  type ColorRepresentation,
  type Object3D,
} from 'three'
import { Emitter, type Listener } from '../core/events.js'
import type { Selection } from '../core/selection.js'
import type { Floorplan } from '../model/floorplan.js'
import { FALLBACK_ITEM_SIZE, type ItemCatalog } from '../model/item-catalog.js'
import { findOverlaps } from '../model/item-geometry.js'
import type { ItemSize } from '../schema/item-definition.js'
import type { Item } from '../schema/plan.js'
import { toScene } from './coordinates.js'
import type { ModelLibrary } from './model-library.js'

export interface ItemSceneColors {
  /** Items whose model is loading, failed to load, or is not in the catalogue. */
  placeholder: ColorRepresentation
  selected: ColorRepresentation
  overlap: ColorRepresentation
}

export interface ItemLoadError {
  itemId: string
  catalogKey: string
  model: string
  error: unknown
}

export type ItemSceneEvents = {
  /** Something visible changed, such as a model finishing loading. */
  update: undefined
  /** A model could not be loaded. The item stays in the scene as a box. */
  error: ItemLoadError
}

/** What an item's root object carries in `userData`. */
export interface ItemObjectData {
  kind: 'item'
  id: string
}

interface Entry {
  root: Group
  /** What the content was built for. A change to either rebuilds it. */
  catalogKey: string
  model: string | null
  /** The box or the loaded model inside `root`. */
  content: Object3D
  outline: LineSegments
  /** Whether `content` is still a stand-in box. */
  placeholder: boolean
  /** Bumped whenever the content is rebuilt, so a model that finishes loading late is dropped. */
  version: number
}

/**
 * The items of a plan as 3D objects, kept in step with a `Floorplan`. Each item shows a box
 * of its size until its model has loaded. Moving an item only moves its object; nothing is
 * reloaded or copied.
 *
 * Like the wall scene, it only follows the plan while active.
 */
export class ItemScene {
  readonly group = new Group()

  private readonly entries = new Map<string, Entry>()
  private readonly placeholderMaterial: MeshStandardMaterial
  private readonly selectedMaterial: LineBasicMaterial
  private readonly overlapMaterial: LineBasicMaterial
  private readonly emitter = new Emitter<ItemSceneEvents>()
  private readonly cleanups: (() => void)[]
  private selection: Selection = null
  private active = false
  private outOfDate = true
  private disposed = false

  constructor(
    private readonly floorplan: Floorplan,
    private readonly catalog: ItemCatalog,
    private readonly library: ModelLibrary,
    colors: ItemSceneColors,
  ) {
    this.placeholderMaterial = new MeshStandardMaterial({
      color: colors.placeholder,
      roughness: 0.9,
    })
    this.selectedMaterial = new LineBasicMaterial({ color: colors.selected })
    this.overlapMaterial = new LineBasicMaterial({ color: colors.overlap })
    this.cleanups = [
      floorplan.on('change', this.changed),
      catalog.on('change', () => {
        // New definitions can change any item's size or model.
        for (const entry of this.entries.values()) entry.model = null
        this.changed()
      }),
    ]
  }

  get objects(): ReadonlyMap<string, Object3D> {
    return new Map([...this.entries].map(([id, entry]) => [id, entry.root]))
  }

  /** Whether an item's model has loaded, as opposed to showing a stand-in box. */
  hasModel(id: string): boolean {
    const entry = this.entries.get(id)
    return entry !== undefined && !entry.placeholder
  }

  setActive(active: boolean): void {
    this.active = active
    if (active && this.outOfDate) this.sync()
  }

  setSelection(selection: Selection): void {
    this.selection = selection
    if (this.active) this.updateOutlines()
    else this.outOfDate = true
  }

  on<Name extends keyof ItemSceneEvents>(
    name: Name,
    listener: Listener<ItemSceneEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  dispose(): void {
    this.disposed = true
    for (const cleanup of this.cleanups) cleanup()
    for (const id of [...this.entries.keys()]) this.remove(id)
    this.placeholderMaterial.dispose()
    this.selectedMaterial.dispose()
    this.overlapMaterial.dispose()
    this.emitter.clear()
  }

  private readonly changed = (): void => {
    this.outOfDate = true
    if (this.active) this.sync()
  }

  private sync(): void {
    this.outOfDate = false
    const present = new Set<string>()
    for (const item of this.floorplan.items) {
      present.add(item.id)
      const model = this.catalog.get(item.catalogKey)?.model ?? null
      let entry = this.entries.get(item.id)
      if (!entry || entry.catalogKey !== item.catalogKey || entry.model !== model) {
        if (entry) this.remove(item.id)
        entry = this.create(item)
      }
      entry.root.position.set(...toScene(item.position, item.elevation))
      // A turn counter-clockwise on the plan is a turn counter-clockwise about the scene's up axis.
      entry.root.rotation.y = item.rotation
    }
    for (const id of [...this.entries.keys()]) if (!present.has(id)) this.remove(id)
    this.updateOutlines()
    this.emitter.emit('update', undefined)
  }

  private create(item: Item): Entry {
    const definition = this.catalog.get(item.catalogKey)
    const size = definition?.size ?? FALLBACK_ITEM_SIZE
    const root = new Group()
    root.userData = { kind: 'item', id: item.id } satisfies ItemObjectData

    const content = new Mesh(boxGeometry(size), this.placeholderMaterial)
    const outline = new LineSegments(new EdgesGeometry(boxGeometry(size, 0.02)))
    outline.visible = false
    // The outline is only a marker; pointer picking goes by the item's own shape.
    outline.raycast = () => {}
    root.add(content, outline)
    this.group.add(root)

    const entry: Entry = {
      root,
      catalogKey: item.catalogKey,
      model: definition?.model ?? null,
      content,
      outline,
      placeholder: true,
      version: 0,
    }
    this.entries.set(item.id, entry)
    if (definition) this.loadModel(item.id, entry, definition.model, size)
    return entry
  }

  private loadModel(id: string, entry: Entry, url: string, size: ItemSize): void {
    const version = ++entry.version
    this.library.instance(url, size).then(
      (model) => {
        if (this.disposed || this.entries.get(id) !== entry || entry.version !== version) return
        const placeholder = entry.content as Mesh
        placeholder.geometry.dispose()
        entry.root.remove(placeholder)
        entry.root.add(model)
        entry.content = model
        entry.placeholder = false
        this.emitter.emit('update', undefined)
      },
      (error: unknown) => {
        if (this.disposed || this.entries.get(id) !== entry) return
        this.emitter.emit('error', { itemId: id, catalogKey: entry.catalogKey, model: url, error })
      },
    )
  }

  private remove(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.version++
    // A loaded model shares its geometry with the library, so only the stand-in box is ours.
    if (entry.placeholder) (entry.content as Mesh).geometry.dispose()
    entry.outline.geometry.dispose()
    this.group.remove(entry.root)
    this.entries.delete(id)
  }

  private updateOutlines(): void {
    const overlaps = findOverlaps(this.floorplan, this.catalog.sizeOf)
    for (const [id, entry] of this.entries) {
      const selected = this.selection?.kind === 'item' && this.selection.id === id
      const overlapping = overlaps.has(id)
      entry.outline.visible = selected || overlapping
      entry.outline.material = overlapping ? this.overlapMaterial : this.selectedMaterial
    }
  }
}

/** A box of an item's size standing on the floor, centred on its origin. `grow` pads every side. */
function boxGeometry(size: ItemSize, grow = 0): BoxGeometry {
  const geometry = new BoxGeometry(
    size.width + grow * 2,
    size.height + grow * 2,
    size.depth + grow * 2,
  )
  geometry.translate(0, size.height / 2, 0)
  return geometry
}
