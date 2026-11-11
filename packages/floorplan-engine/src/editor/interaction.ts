import { Emitter, type Listener } from '../core/events.js'
import { SelectionStore, sameSelection, type Selection } from '../core/selection.js'
import { Floorplan, FloorplanError } from '../model/floorplan.js'
import { distance, type Point } from '../model/geometry.js'
import type { History } from '../model/history.js'
import { ItemCatalog } from '../model/item-catalog.js'
import { defaultPlacementSettings, placeItem, type PlacementSettings } from '../model/placement.js'
import {
  defaultOpeningSnapSettings,
  nearestWall,
  nextDoorSwing,
  snapOpeningOffset,
  type OpeningSnapSettings,
} from '../model/wall-openings.js'
import { hitTest, rotateHandlePosition, type Hit } from './hit-testing.js'
import { snapPoint, toGrid, type SnapSettings, type SnapTarget } from './snapping.js'
import type { Viewport } from './viewport.js'

export type EditorMode = 'move' | 'draw' | 'delete'

export type { Selection }

export interface InteractionOptions {
  /** Item sizes. Without it, items cannot be picked or moved. */
  catalog?: ItemCatalog
  /** The selection to share with other views. A new one is made if not given. */
  selection?: SelectionStore
  /** Wall and grid snapping for items. */
  placement?: PlacementSettings
  /** Snapping for doors and windows dragged along a wall. */
  openingSnap?: OpeningSnapSettings
  /** Undo history. Each press-to-release is marked on it, so one drag is one step to undo. */
  history?: Pick<History, 'begin' | 'end'>
}

/** A dragged opening jumps to another wall when the pointer comes this close to it. Metres. */
const SWITCH_WALL_DISTANCE = 0.3
/** ...and that wall is nearer than the opening's own wall by at least this much. Metres. */
const SWITCH_WALL_MARGIN = 0.15

/** Rotation by hand moves in steps of this many radians, unless `Alt` is held. */
export const ROTATION_STEP = Math.PI / 12

/** A pointer event in both coordinate systems, as the canvas layer reports it. */
export interface PointerInput {
  screen: Point
  world: Point
  /** 0 main, 1 auxiliary (wheel), 2 secondary. */
  button?: number
  /** Snapping is off while `Alt` is held. */
  altKey?: boolean
}

/** What the renderer shows while drawing: the rubber-band wall and the snap indicator. */
export interface DrawPreview {
  /** The previous corner in the chain, if any. */
  anchor: Point | null
  /** The snapped pointer position. */
  cursor: Point
  target: SnapTarget
}

export type InteractionEvents = {
  mode: EditorMode
  selection: Selection
  hover: Hit
  /** The viewport was panned or zoomed. */
  viewport: Viewport
  /** Something visual changed that the model does not report: hover, preview, cursor. */
  invalidate: undefined
}

/** How far, in pixels, the pointer may travel for a press to still count as a click. */
const CLICK_SLOP = 3

type Gesture =
  | { type: 'idle' }
  | { type: 'pending'; start: PointerInput; hit: Hit; handle: boolean }
  | { type: 'pan'; last: Point }
  | { type: 'dragCorner'; id: string }
  | {
      type: 'dragWall'
      id: string
      cornerIds: [string, string]
      grabWorld: Point
      grabCorner: Point
    }
  | { type: 'dragItem'; id: string; offset: Point; rotation: number }
  | { type: 'rotateItem'; id: string }
  /** `grab` is how far the opening's middle is from where it was grabbed, along its wall. */
  | { type: 'dragOpening'; id: string; grab: number }

/**
 * The editor's input logic: modes, selection, drawing and dragging. It takes pointer input in
 * world coordinates and calls the model, with no DOM involved, so it is tested in Node.
 */
export class Interaction {
  readonly floorplan: Floorplan
  readonly viewport: Viewport
  readonly snapping: SnapSettings
  readonly catalog: ItemCatalog
  readonly placement: PlacementSettings
  readonly openingSnap: OpeningSnapSettings

  private readonly selectionStore: SelectionStore
  private readonly history: Pick<History, 'begin' | 'end'> | undefined
  private readonly stopWatchingSelection: () => void
  private readonly stopWatchingFloorplan: () => void
  private currentMode: EditorMode = 'move'
  private currentHover: Hit = null
  private handleHover = false
  private gesture: Gesture = { type: 'idle' }
  private chain: { start: string; last: string; walls: number } | null = null
  private pointer: PointerInput | null = null
  private readonly emitter = new Emitter<InteractionEvents>()

  constructor(
    floorplan: Floorplan,
    viewport: Viewport,
    snapping: SnapSettings,
    options: InteractionOptions = {},
  ) {
    this.floorplan = floorplan
    this.viewport = viewport
    this.snapping = snapping
    this.catalog = options.catalog ?? new ItemCatalog()
    this.placement = options.placement ?? { ...defaultPlacementSettings }
    this.openingSnap = options.openingSnap ?? { ...defaultOpeningSnapSettings }
    this.selectionStore = options.selection ?? new SelectionStore()
    this.history = options.history
    // An earlier state put back by undo may not have the corner the chain was drawn from.
    this.stopWatchingFloorplan = floorplan.on('change', ({ kind }) => {
      if (kind === 'restore' || kind === 'load') this.endChain()
    })
    this.stopWatchingSelection = this.selectionStore.on('change', (selection) => {
      this.emitter.emit('selection', selection)
      this.invalidate()
    })
  }

  /** Stops following the shared selection. */
  dispose(): void {
    this.stopWatchingSelection()
    this.stopWatchingFloorplan()
    this.emitter.clear()
  }

  get mode(): EditorMode {
    return this.currentMode
  }

  set mode(mode: EditorMode) {
    if (mode === this.currentMode) return
    this.endChain()
    this.gesture = { type: 'idle' }
    this.currentMode = mode
    this.select(null)
    this.emitter.emit('mode', mode)
    this.invalidate()
  }

  get selection(): Selection {
    return this.selectionStore.current
  }

  get hover(): Hit {
    return this.currentHover
  }

  /** The id of the door or window being dragged, if any. */
  get draggedOpening(): string | null {
    return this.gesture.type === 'dragOpening' ? this.gesture.id : null
  }

  /** True while the pointer is over the selected item's rotate handle. */
  get overRotateHandle(): boolean {
    return this.handleHover
  }

  /** True while a chain of walls is being drawn. */
  get drawing(): boolean {
    return this.chain !== null
  }

  /** The rubber-band wall and snap indicator, or `null` when there is nothing to preview. */
  get preview(): DrawPreview | null {
    if (this.currentMode !== 'draw' || !this.pointer) return null
    const { point, target } = this.snapDrawPoint(this.pointer)
    const last = this.chain ? this.floorplan.getCorner(this.chain.last) : undefined
    return { anchor: last ? { x: last.x, y: last.y } : null, cursor: point, target }
  }

  on<Name extends keyof InteractionEvents>(
    name: Name,
    listener: Listener<InteractionEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  pointerDown(input: PointerInput): void {
    this.pointer = input
    if (input.button === 1) {
      this.gesture = { type: 'pan', last: input.screen }
      return
    }
    if (input.button !== undefined && input.button !== 0) return
    // Whatever this press goes on to change, until it is released, is one step to undo.
    this.history?.begin()
    const handle = this.currentMode === 'move' && this.isOnRotateHandle(input.world)
    const hit = this.currentMode === 'draw' || handle ? null : this.hitAt(input.world)
    this.gesture = { type: 'pending', start: input, hit, handle }
  }

  pointerMove(input: PointerInput): void {
    this.pointer = input
    const gesture = this.gesture

    if (gesture.type === 'pending') {
      if (distance(gesture.start.screen, input.screen) < CLICK_SLOP) return
      this.beginDrag(gesture)
      this.pointerMove(input)
      return
    }

    if (gesture.type === 'pan') {
      this.viewport.panBy(input.screen.x - gesture.last.x, input.screen.y - gesture.last.y)
      gesture.last = input.screen
      this.emitter.emit('viewport', this.viewport)
      return
    }

    if (gesture.type === 'dragCorner') {
      const { point } = snapPoint(input.world, this.floorplan, {
        settings: this.settingsFor(input),
        metresPerPixel: this.viewport.metresPerPixel,
        exclude: new Set([gesture.id]),
      })
      this.floorplan.moveCorner(gesture.id, point.x, point.y, { resolve: false })
      return
    }

    if (gesture.type === 'dragWall') {
      // Carry the grabbed corner's start position by the pointer offset, then grid it.
      const grid = this.settingsFor(input).enabled ? this.snapping.grid : 0
      const targetX = toGrid(gesture.grabCorner.x + (input.world.x - gesture.grabWorld.x), grid)
      const targetY = toGrid(gesture.grabCorner.y + (input.world.y - gesture.grabWorld.y), grid)
      const current = this.floorplan.getCorner(gesture.cornerIds[0])
      if (!current) return
      const dx = targetX - current.x
      const dy = targetY - current.y
      if (dx !== 0 || dy !== 0) {
        this.floorplan.moveCorners(gesture.cornerIds, dx, dy, { resolve: false })
      }
      return
    }

    if (gesture.type === 'dragItem') {
      const item = this.floorplan.getItem(gesture.id)
      if (!item) return
      const placed = placeItem(
        {
          position: { x: input.world.x + gesture.offset.x, y: input.world.y + gesture.offset.y },
          rotation: gesture.rotation,
        },
        this.catalog.sizeOf(item.catalogKey),
        this.floorplan,
        input.altKey ? { ...this.placement, enabled: false } : this.placement,
      )
      this.floorplan.updateItem(gesture.id, {
        position: placed.position,
        rotation: placed.rotation,
      })
      return
    }

    if (gesture.type === 'dragOpening') {
      this.dragOpening(gesture, input)
      return
    }

    if (gesture.type === 'rotateItem') {
      const item = this.floorplan.getItem(gesture.id)
      if (!item) return
      // The handle is in front of the item, so the item's rotation is a quarter turn on from it.
      const angle =
        Math.atan2(input.world.y - item.position.y, input.world.x - item.position.x) + Math.PI / 2
      const rotation = input.altKey ? angle : Math.round(angle / ROTATION_STEP) * ROTATION_STEP
      this.floorplan.updateItem(gesture.id, { rotation })
      return
    }

    this.updateHover(input)
    if (this.currentMode === 'draw') this.invalidate()
  }

  pointerUp(input: PointerInput): void {
    this.pointer = input
    const gesture = this.gesture
    this.gesture = { type: 'idle' }

    if (gesture.type === 'pending') {
      this.click(input, gesture.hit)
    } else if (gesture.type === 'dragCorner') {
      const survivor = this.floorplan.resolveCorner(gesture.id)
      this.select({ kind: 'corner', id: survivor })
    } else if (gesture.type === 'dragWall') {
      for (const id of gesture.cornerIds) {
        if (this.floorplan.getCorner(id)) this.floorplan.resolveCorner(id)
      }
      this.select(this.floorplan.getWall(gesture.id) ? { kind: 'wall', id: gesture.id } : null)
    }
    // An item drag or turn has nothing left to apply: every move already went to the model.
    this.history?.end()
    this.updateHover(input)
    this.invalidate()
  }

  /** The pointer left the canvas, or the gesture was cancelled by the browser. */
  pointerCancel(): void {
    const gesture = this.gesture
    this.gesture = { type: 'idle' }
    this.pointer = null
    if (gesture.type === 'dragCorner') this.floorplan.resolveCorner(gesture.id)
    if (gesture.type === 'dragWall') {
      for (const id of gesture.cornerIds) {
        if (this.floorplan.getCorner(id)) this.floorplan.resolveCorner(id)
      }
    }
    if (gesture.type !== 'idle') this.history?.end()
    this.setHover(null)
    this.invalidate()
  }

  doubleClick(): void {
    if (this.chain) this.endChain()
  }

  /** `deltaY` as the wheel event reports it: positive scrolls down and zooms out. */
  wheel(screen: Point, deltaY: number): void {
    this.viewport.zoomAt(screen, Math.pow(1.0015, -deltaY))
    this.emitter.emit('viewport', this.viewport)
    if (this.pointer) this.updateHover({ ...this.pointer, world: this.viewport.toWorld(screen) })
  }

  /** Keyboard input by `KeyboardEvent.key`. Returns whether the key was used. */
  key(key: string): boolean {
    switch (key) {
      case 'Escape':
        if (this.chain) this.endChain()
        else if (this.currentMode !== 'move') this.mode = 'move'
        else if (this.selectionStore.current) this.select(null)
        else return false
        this.invalidate()
        return true
      case 'Delete':
      case 'Backspace':
        return this.deleteSelection()
      case 'r':
      case 'R':
        return this.turnSelectedItem(Math.PI / 2)
      case 'f':
      case 'F':
        return this.flipSelectedDoor()
      default:
        return false
    }
  }

  /** Ends the chain being drawn, if any. */
  endChain(): void {
    if (!this.chain) return
    this.chain = null
    this.invalidate()
  }

  deleteSelection(): boolean {
    const selection = this.selectionStore.current
    if (!selection) return false
    this.select(null)
    this.remove(selection)
    return true
  }

  /** Turns the selected item counter-clockwise by `angle` radians. Returns whether one was selected. */
  turnSelectedItem(angle: number): boolean {
    const selection = this.selectionStore.current
    if (selection?.kind !== 'item') return false
    const item = this.floorplan.getItem(selection.id)
    if (!item) return false
    this.floorplan.updateItem(item.id, { rotation: item.rotation + angle })
    return true
  }

  /**
   * Steps the selected door to its next way of hanging: the hinge changes ends, then the swing
   * changes sides. Returns whether a door was selected.
   */
  flipSelectedDoor(): boolean {
    const selection = this.selectionStore.current
    if (selection?.kind !== 'opening') return false
    const opening = this.floorplan.getOpening(selection.id)
    if (opening?.kind !== 'door') return false
    this.floorplan.updateOpening(opening.id, nextDoorSwing(opening))
    return true
  }

  private remove(target: NonNullable<Selection>): void {
    if (target.kind === 'corner') this.floorplan.removeCorner(target.id)
    else if (target.kind === 'wall') this.floorplan.removeWall(target.id)
    else if (target.kind === 'opening') this.floorplan.removeOpening(target.id)
    else this.floorplan.removeItem(target.id)
  }

  /** Slides a dragged opening along its wall, or moves it to another wall the pointer is nearer to. */
  private dragOpening(
    gesture: Extract<Gesture, { type: 'dragOpening' }>,
    input: PointerInput,
  ): void {
    const { floorplan } = this
    const opening = floorplan.getOpening(gesture.id)
    const ownWall = opening && floorplan.getWall(opening.wallId)
    if (!opening || !ownWall) return
    const own = nearestWall(input.world, {
      walls: [ownWall],
      getCorner: (id) => floorplan.getCorner(id),
    })
    const nearest = nearestWall(input.world, floorplan)
    if (!own || !nearest) return

    const snap = input.altKey ? { ...this.openingSnap, enabled: false } : this.openingSnap
    const moveTo = (wallId: string, along: number): boolean => {
      const wall = floorplan.getWall(wallId)!
      const start = floorplan.getCorner(wall.start)!
      const end = floorplan.getCorner(wall.end)!
      const offset = snapOpeningOffset(along, distance(start, end), snap)
      try {
        floorplan.updateOpening(opening.id, { wallId, offset })
        return true
      } catch (error) {
        // No room for it there: it stays where it is.
        if (!(error instanceof FloorplanError)) throw error
        return false
      }
    }

    const switches =
      nearest.wallId !== opening.wallId &&
      nearest.distance < SWITCH_WALL_DISTANCE &&
      nearest.distance + SWITCH_WALL_MARGIN < own.distance
    if (switches && moveTo(nearest.wallId, nearest.along)) {
      gesture.grab = 0
      return
    }
    moveTo(opening.wallId, own.along + gesture.grab)
  }

  private click(input: PointerInput, hit: Hit): void {
    switch (this.currentMode) {
      case 'move':
        this.select(hit)
        break
      case 'draw':
        this.placeCorner(input)
        break
      case 'delete':
        if (hit) {
          if (sameSelection(hit, this.selectionStore.current)) this.select(null)
          this.remove(hit)
        }
        this.setHover(null)
        break
    }
  }

  private placeCorner(input: PointerInput): void {
    const { point } = this.snapDrawPoint(input)
    const id = this.floorplan.addCorner(point.x, point.y)
    if (!this.chain) {
      this.chain = { start: id, last: id, walls: 0 }
      return
    }
    if (id === this.chain.last) {
      // Clicking the last corner again ends the chain, which is also what a double click does.
      this.endChain()
      return
    }
    try {
      this.floorplan.addWall(this.chain.last, id)
      this.chain.walls++
    } catch (error) {
      // Drawing over an existing wall is allowed; the chain just moves on.
      if (!(error instanceof FloorplanError)) throw error
    }
    if (id === this.chain.start) this.endChain()
    else this.chain.last = id
  }

  private beginDrag(pending: Extract<Gesture, { type: 'pending' }>): void {
    const { hit, start } = pending
    const selection = this.selectionStore.current
    if (pending.handle && selection?.kind === 'item') {
      this.gesture = { type: 'rotateItem', id: selection.id }
      return
    }
    if (this.currentMode === 'move' && hit?.kind === 'item') {
      const item = this.floorplan.getItem(hit.id)!
      this.gesture = {
        type: 'dragItem',
        id: hit.id,
        offset: { x: item.position.x - start.world.x, y: item.position.y - start.world.y },
        rotation: item.rotation,
      }
      this.select(hit)
      return
    }
    if (this.currentMode === 'move' && hit?.kind === 'opening') {
      const opening = this.floorplan.getOpening(hit.id)!
      const wall = this.floorplan.getWall(opening.wallId)!
      const grabbed = nearestWall(start.world, {
        walls: [wall],
        getCorner: (id) => this.floorplan.getCorner(id),
      })
      this.gesture = {
        type: 'dragOpening',
        id: hit.id,
        grab: grabbed ? opening.offset - grabbed.along : 0,
      }
      this.select(hit)
      return
    }
    if (this.currentMode === 'move' && hit?.kind === 'corner') {
      this.gesture = { type: 'dragCorner', id: hit.id }
      this.select(hit)
      return
    }
    if (this.currentMode === 'move' && hit?.kind === 'wall') {
      const wall = this.floorplan.getWall(hit.id)!
      const grabCorner = this.floorplan.getCorner(wall.start)!
      this.gesture = {
        type: 'dragWall',
        id: hit.id,
        cornerIds: [wall.start, wall.end],
        grabWorld: start.world,
        grabCorner: { x: grabCorner.x, y: grabCorner.y },
      }
      this.select(hit)
      return
    }
    this.gesture = { type: 'pan', last: start.screen }
  }

  private snapDrawPoint(input: PointerInput): { point: Point; target: SnapTarget } {
    return snapPoint(input.world, this.floorplan, {
      settings: this.settingsFor(input),
      metresPerPixel: this.viewport.metresPerPixel,
      anchorId: this.chain?.last ?? null,
    })
  }

  private settingsFor(input: PointerInput): SnapSettings {
    return input.altKey ? { ...this.snapping, enabled: false } : this.snapping
  }

  private hitAt(world: Point): Hit {
    return hitTest(
      world,
      this.floorplan,
      this.snapping.cornerTolerance * this.viewport.metresPerPixel,
      this.catalog.sizeOf,
    )
  }

  /** Whether a world point is on the selected item's rotate handle. */
  private isOnRotateHandle(world: Point): boolean {
    const selection = this.selectionStore.current
    if (selection?.kind !== 'item') return false
    const item = this.floorplan.getItem(selection.id)
    if (!item) return false
    const { metresPerPixel } = this.viewport
    const handle = rotateHandlePosition(item, this.catalog.sizeOf(item.catalogKey), metresPerPixel)
    return distance(world, handle) <= this.snapping.cornerTolerance * metresPerPixel
  }

  private updateHover(input: PointerInput): void {
    const handle = this.currentMode === 'move' && this.isOnRotateHandle(input.world)
    if (handle !== this.handleHover) {
      this.handleHover = handle
      this.invalidate()
    }
    this.setHover(this.currentMode === 'draw' || handle ? null : this.hitAt(input.world))
  }

  private setHover(hit: Hit): void {
    if (sameHit(hit, this.currentHover)) return
    this.currentHover = hit
    this.emitter.emit('hover', hit)
    this.invalidate()
  }

  private select(selection: Selection): void {
    // The store tells this class back through its change event, which emits and redraws.
    this.selectionStore.set(selection)
  }

  private invalidate(): void {
    this.emitter.emit('invalidate', undefined)
  }
}

function sameHit(a: Hit, b: Hit): boolean {
  return sameSelection(a, b)
}
