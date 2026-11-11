import { Emitter, type Listener } from './core/events.js'
import { SelectionStore, type Selection } from './core/selection.js'
import { PlanEditor, type PlanEditorOptions } from './editor/plan-editor.js'
import { Floorplan, FloorplanError, type FloorplanOptions } from './model/floorplan.js'
import type { Point } from './model/geometry.js'
import { ItemCatalog } from './model/item-catalog.js'
import { defaultPlacementSettings, placeItem, type PlacementSettings } from './model/placement.js'
import type { ItemDefinition } from './schema/item-definition.js'
import type { Plan } from './schema/plan.js'
import type { ItemLoadError } from './view3d/item-scene.js'
import type { ModelLoader } from './view3d/model-library.js'
import { View3D, type View3DTheme } from './view3d/view3d.js'

export interface FloorplanEngineOptions {
  /** Element that hosts the 3D view. The engine adds a canvas to it and follows its size. */
  view3d: HTMLElement
  /** Element that hosts the 2D plan editor. Without it, `engine.editor` is `null`. */
  view2d?: HTMLElement
  /** Tolerances and wall defaults for the floor-plan model. */
  floorplan?: FloorplanOptions
  /** Snapping and colours for the 2D editor. */
  editor?: Pick<PlanEditorOptions, 'snapping' | 'theme'>
  /** Colours for the 3D view. */
  view3dTheme?: Partial<View3DTheme>
  /** Wall and grid snapping for items, in both views. */
  placement?: Partial<PlacementSettings>
  /** Where the Draco decoder files are served, such as `/draco/`, for compressed models. */
  dracoPath?: string
  /** Replaces the GLB loader, for tests. */
  loadModel?: ModelLoader
}

export type FloorplanEngineEvents = {
  /** A plan was loaded with `load()`. */
  load: Plan
  /** The selection changed, in either view. */
  selection: Selection
  /** An item's model could not be loaded. It is shown as a box instead. */
  itemError: ItemLoadError
}

export class FloorplanEngine {
  /** The plan being edited: corners, walls, items and the rooms detected from the walls. */
  readonly floorplan: Floorplan
  /** The item definitions passed in with `setCatalog()`. */
  readonly catalog = new ItemCatalog()
  /** Wall and grid snapping for items. Change a field and the next drag uses it. */
  readonly placement: PlacementSettings
  /** The 2D plan editor, when a `view2d` element was given. Shares `floorplan` with the 3D view. */
  readonly editor: PlanEditor | null
  /** The 3D view: walls, floors and items drawn from `floorplan`, with its camera modes. */
  readonly view3d: View3D

  private readonly selectionStore = new SelectionStore()
  private readonly emitter = new Emitter<FloorplanEngineEvents>()
  private readonly cleanups: (() => void)[] = []
  private disposed = false

  constructor(options: FloorplanEngineOptions) {
    this.floorplan = new Floorplan(options.floorplan)
    this.placement = { ...defaultPlacementSettings, ...options.placement }
    const shared = {
      floorplan: this.floorplan,
      catalog: this.catalog,
      selection: this.selectionStore,
      placement: this.placement,
    }
    this.editor = options.view2d
      ? new PlanEditor({ host: options.view2d, ...shared, ...options.editor })
      : null
    this.view3d = new View3D({
      host: options.view3d,
      ...shared,
      ...(options.view3dTheme && { theme: options.view3dTheme }),
      ...(options.dracoPath && { dracoPath: options.dracoPath }),
      ...(options.loadModel && { loadModel: options.loadModel }),
    })
    this.cleanups.push(
      this.selectionStore.on('change', (selection) => this.emitter.emit('selection', selection)),
      this.view3d.on('itemError', (error) => this.emitter.emit('itemError', error)),
      // A selected corner, wall or item that no longer exists is no longer selected.
      this.floorplan.on('change', () => {
        const selection = this.selectionStore.current
        if (selection && !this.exists(selection)) this.selectionStore.set(null)
      }),
    )
  }

  /** What is selected, in either view. */
  get selection(): Selection {
    return this.selectionStore.current
  }

  /** Selects a corner, wall or item in both views, or clears the selection with `null`. */
  select(selection: Selection): void {
    if (selection && !this.exists(selection)) {
      throw new FloorplanError(`There is no ${selection.kind} "${selection.id}"`)
    }
    this.selectionStore.set(selection)
  }

  /**
   * The item definitions to use: sizes and model URLs, by key. Items already in the plan are
   * redrawn with them. Throws a `ZodError` if a definition is not valid.
   */
  setCatalog(definitions: readonly ItemDefinition[]): void {
    this.catalog.set(definitions)
  }

  /**
   * Adds an item from the catalogue and selects it. Without a position it goes in the middle of
   * whichever view is showing, and is snapped against a wall if one is near. Returns its id.
   */
  addItem(catalogKey: string, options: { position?: Point; rotation?: number } = {}): string {
    this.assertActive()
    if (!this.catalog.get(catalogKey)) {
      throw new FloorplanError(`"${catalogKey}" is not in the catalogue`)
    }
    const placed = placeItem(
      { position: options.position ?? this.viewCentre(), rotation: options.rotation ?? 0 },
      this.catalog.sizeOf(catalogKey),
      this.floorplan,
      this.placement,
    )
    const id = this.floorplan.addItem({
      catalogKey,
      position: placed.position,
      rotation: placed.rotation,
    })
    this.selectionStore.set({ kind: 'item', id })
    return id
  }

  /**
   * Validates `input` against the plan format and makes it the current plan.
   * Throws a `ZodError` if the input is not a valid plan.
   */
  load(input: unknown): Plan {
    this.assertActive()
    this.selectionStore.set(null)
    this.floorplan.load(input)
    const plan = this.export()
    this.emitter.emit('load', plan)
    return plan
  }

  /** Returns a copy of the current plan, ready to be saved as JSON. */
  export(): Plan {
    return this.floorplan.export()
  }

  /** Subscribes to an engine event and returns a function that unsubscribes. */
  on<Name extends keyof FloorplanEngineEvents>(
    name: Name,
    listener: Listener<FloorplanEngineEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  /** Releases both views and their listeners. The engine cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const cleanup of this.cleanups) cleanup()
    this.editor?.dispose()
    this.view3d.dispose()
    this.emitter.clear()
  }

  /** The plan point in the middle of whichever view is showing. */
  private viewCentre(): Point {
    if (this.view3d.isVisible || !this.editor) return this.view3d.focusPoint
    const { viewport } = this.editor
    return viewport.toWorld({ x: viewport.width / 2, y: viewport.height / 2 })
  }

  private exists(selection: NonNullable<Selection>): boolean {
    const { floorplan } = this
    if (selection.kind === 'corner') return floorplan.getCorner(selection.id) !== undefined
    if (selection.kind === 'wall') return floorplan.getWall(selection.id) !== undefined
    return floorplan.getItem(selection.id) !== undefined
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('FloorplanEngine has been disposed')
  }
}
