import { Emitter, type Listener } from './core/events.js'
import { SelectionStore, type Selection } from './core/selection.js'
import { PlanEditor, type PlanEditorOptions } from './editor/plan-editor.js'
import { Floorplan, FloorplanError, type FloorplanOptions } from './model/floorplan.js'
import type { Point } from './model/geometry.js'
import { History } from './model/history.js'
import { ItemCatalog } from './model/item-catalog.js'
import {
  defaultPlacementSettings,
  findFreeSpot,
  placeItem,
  type PlacementSettings,
} from './model/placement.js'
import { findOverlaps } from './model/item-geometry.js'
import {
  defaultOpeningSnapSettings,
  projectOntoWall,
  type OpeningSnapSettings,
} from './model/wall-openings.js'
import type { ItemDefinition } from './schema/item-definition.js'
import { unitGrid } from './model/units.js'
import type { OpeningKind, Plan, UnitSystem } from './schema/plan.js'
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
  /**
   * Where the Draco decoder files are served, such as `/draco/`, for compressed models. Without
   * it, the copy that comes with Three.js is used.
   */
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
  /** The plan's display unit changed: by `setUnits()`, by loading a plan, or by undo. */
  units: UnitSystem
}

export class FloorplanEngine {
  /** The plan being edited: corners, walls, items and the rooms detected from the walls. */
  readonly floorplan: Floorplan
  /**
   * Undo and redo for `floorplan`. A drag in either view is one step, and loading a plan
   * clears it.
   */
  readonly history: History
  /** The item definitions passed in with `setCatalog()`. */
  readonly catalog = new ItemCatalog()
  /** Wall and grid snapping for items. Change a field and the next drag uses it. */
  readonly placement: PlacementSettings
  /** Snapping for doors and windows dragged along a wall. Live, like `placement`. */
  readonly openingSnap: OpeningSnapSettings = { ...defaultOpeningSnapSettings }
  /** The 2D plan editor, when a `view2d` element was given. Shares `floorplan` with the 3D view. */
  readonly editor: PlanEditor | null
  /** The 3D view: walls, floors and items drawn from `floorplan`, with its camera modes. */
  readonly view3d: View3D

  private readonly selectionStore = new SelectionStore()
  private readonly emitter = new Emitter<FloorplanEngineEvents>()
  private readonly cleanups: (() => void)[] = []
  private disposed = false
  /** The unit the snap steps were last set for. */
  private appliedUnits: UnitSystem = 'metric'
  /** True when the host gave its own corner grid step, which then is not replaced by the unit's. */
  private readonly ownGrid: boolean

  constructor(options: FloorplanEngineOptions) {
    this.floorplan = new Floorplan(options.floorplan)
    this.history = new History(this.floorplan)
    this.placement = { ...defaultPlacementSettings, ...options.placement }
    this.ownGrid = options.editor?.snapping?.grid !== undefined
    const shared = {
      floorplan: this.floorplan,
      catalog: this.catalog,
      selection: this.selectionStore,
      placement: this.placement,
      openingSnap: this.openingSnap,
      history: this.history,
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
      // The unit can change with `setUnits()`, a loaded plan or an undo; follow all three.
      this.floorplan.on('change', () => this.applyUnits()),
    )
  }

  /**
   * How the plan's measurements are shown and typed: metres, or feet and inches. Display only:
   * the plan is stored and calculated in metres whichever is chosen. Furniture keeps its metric
   * placement step in both.
   */
  get units(): UnitSystem {
    return this.floorplan.units
  }

  /**
   * Changes the plan's display unit. Walls, doors and windows then snap to that unit's steps
   * (0.1 m, or whole inches). It is a change to the plan, so it is saved and can be undone.
   */
  setUnits(units: UnitSystem): void {
    this.assertActive()
    this.floorplan.setUnits(units)
  }

  private applyUnits(): void {
    const { units } = this.floorplan
    if (units === this.appliedUnits) return
    this.appliedUnits = units
    const grid = unitGrid(units)
    if (this.editor && !this.ownGrid) this.editor.snapping.grid = grid.snap
    this.openingSnap.step = grid.openingStep
    this.emitter.emit('units', units)
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
   * The ids of the items that overlap a wall or another item, judged by their outlines on the
   * floor. These are the items both views show in red.
   */
  overlappingItems(): Set<string> {
    return findOverlaps(this.floorplan, this.catalog.shapeOf)
  }

  /**
   * Adds an item from the catalogue and selects it. Without a position it goes to the free place
   * nearest the middle of whichever view is showing, and is snapped against a wall if one is
   * near. Returns its id.
   */
  addItem(catalogKey: string, options: { position?: Point; rotation?: number } = {}): string {
    this.assertActive()
    if (!this.catalog.get(catalogKey)) {
      throw new FloorplanError(`"${catalogKey}" is not in the catalogue`)
    }
    const size = this.catalog.shapeOf(catalogKey)
    const rotation = options.rotation ?? 0
    // A place the caller chose is used as it is. Without one, the item goes to the free place
    // nearest the middle of the view, so that it does not land on top of something else.
    const placed = options.position
      ? placeItem({ position: options.position, rotation }, size, this.floorplan, this.placement)
      : findFreeSpot(
          { position: this.viewCentre(), rotation },
          size,
          this.floorplan,
          this.catalog.shapeOf,
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
   * Adds a door or window and selects it. It goes on the wall nearest the middle of whichever
   * view is showing that has room for it. Sizes not given take the defaults for its kind.
   * Throws a `FloorplanError` if no wall can take it. Returns its id.
   */
  addOpening(opening: {
    kind: OpeningKind
    width?: number
    height?: number
    sill?: number
  }): string {
    this.assertActive()
    const centre = this.viewCentre()
    const { floorplan } = this
    const candidates = floorplan.walls
      .map((wall) => {
        const start = floorplan.getCorner(wall.start)!
        const end = floorplan.getCorner(wall.end)!
        const { along, distance, length } = projectOntoWall(centre, start, end)
        const overshoot = along < 0 ? -along : along > length ? along - length : 0
        return { wallId: wall.id, offset: along, distance: Math.hypot(distance, overshoot) }
      })
      .sort((a, b) => a.distance - b.distance)
    for (const { wallId, offset } of candidates) {
      try {
        const id = floorplan.addOpening({ ...opening, wallId, offset })
        this.selectionStore.set({ kind: 'opening', id })
        return id
      } catch (error) {
        // This wall has no room for it; try the next nearest.
        if (!(error instanceof FloorplanError)) throw error
      }
    }
    throw new FloorplanError(
      candidates.length === 0 ? 'There is no wall to put it on' : 'No wall has room for it',
    )
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
    this.history.dispose()
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
    if (selection.kind === 'opening') return floorplan.getOpening(selection.id) !== undefined
    if (selection.kind === 'room') return floorplan.getRoom(selection.id) !== undefined
    return floorplan.getItem(selection.id) !== undefined
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('FloorplanEngine has been disposed')
  }
}
