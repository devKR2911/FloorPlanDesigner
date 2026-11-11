import { Emitter, type Listener } from '../core/events.js'
import type { SelectionStore } from '../core/selection.js'
import type { Floorplan } from '../model/floorplan.js'
import { boundingBox } from '../model/geometry.js'
import { ItemCatalog } from '../model/item-catalog.js'
import { findOverlaps } from '../model/item-geometry.js'
import type { PlacementSettings } from '../model/placement.js'
import { unfitOpenings, type OpeningSnapSettings } from '../model/wall-openings.js'
import { rotateHandlePosition, type Hit } from './hit-testing.js'
import { Interaction, type EditorMode, type PointerInput, type Selection } from './interaction.js'
import { defaultTheme, render, type EditorTheme } from './renderer.js'
import { defaultSnapSettings, type SnapSettings } from './snapping.js'
import { Viewport } from './viewport.js'

export interface PlanEditorOptions {
  /** Element that hosts the 2D view. The editor adds a canvas to it and follows its size. */
  host: HTMLElement
  floorplan: Floorplan
  snapping?: Partial<SnapSettings>
  theme?: Partial<EditorTheme>
  /** Item sizes. Without it, items are drawn and picked at a fallback size. */
  catalog?: ItemCatalog
  /** The selection to share with other views. */
  selection?: SelectionStore
  /** Wall and grid snapping for items. */
  placement?: PlacementSettings
  /** Snapping for doors and windows dragged along a wall. */
  openingSnap?: OpeningSnapSettings
}

export type PlanEditorEvents = {
  mode: EditorMode
  selection: Selection
  hover: Hit
  viewport: Viewport
}

/** The 2D plan editor: a canvas bound to a `Floorplan`, with modes, snapping and dimensions. */
export class PlanEditor {
  readonly canvas: HTMLCanvasElement
  readonly viewport: Viewport
  /** Live settings: change a field and the next pointer move uses it. */
  readonly snapping: SnapSettings
  readonly theme: EditorTheme

  private readonly host: HTMLElement
  private readonly floorplan: Floorplan
  private readonly catalog: ItemCatalog
  private readonly interaction: Interaction
  private readonly context: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private readonly emitter = new Emitter<PlanEditorEvents>()
  private readonly cleanups: (() => void)[] = []
  private frame: number | null = null
  private disposed = false

  constructor(options: PlanEditorOptions) {
    this.host = options.host
    this.floorplan = options.floorplan
    this.snapping = { ...defaultSnapSettings, ...options.snapping }
    this.theme = { ...defaultTheme, ...options.theme }

    this.canvas = document.createElement('canvas')
    this.canvas.tabIndex = 0
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.outline = 'none'
    this.canvas.style.touchAction = 'none'
    this.host.appendChild(this.canvas)
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D is not available')
    this.context = context

    this.viewport = new Viewport(this.host.clientWidth, this.host.clientHeight)
    this.catalog = options.catalog ?? new ItemCatalog()
    this.interaction = new Interaction(this.floorplan, this.viewport, this.snapping, {
      catalog: this.catalog,
      ...(options.selection && { selection: options.selection }),
      ...(options.placement && { placement: options.placement }),
      ...(options.openingSnap && { openingSnap: options.openingSnap }),
    })

    this.cleanups.push(
      this.floorplan.on('change', this.scheduleRender),
      this.catalog.on('change', this.scheduleRender),
      this.interaction.on('invalidate', this.scheduleRender),
      this.interaction.on('mode', (mode) => {
        this.updateCursor()
        this.emitter.emit('mode', mode)
      }),
      this.interaction.on('selection', (selection) => this.emitter.emit('selection', selection)),
      this.interaction.on('hover', (hover) => {
        this.updateCursor()
        this.emitter.emit('hover', hover)
      }),
      this.interaction.on('viewport', (viewport) => {
        this.scheduleRender()
        this.emitter.emit('viewport', viewport)
      }),
    )
    this.listen('pointerdown', this.onPointerDown)
    this.listen('pointermove', this.onPointerMove)
    this.listen('pointerup', this.onPointerUp)
    this.listen('pointercancel', this.onPointerCancel)
    this.listen('pointerleave', this.onPointerLeave)
    this.listen('dblclick', () => this.interaction.doubleClick())
    this.listen('wheel', this.onWheel, { passive: false })
    this.listen('keydown', this.onKeyDown)
    this.listen('contextmenu', (event) => event.preventDefault())

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    this.resize()
    this.updateCursor()
  }

  get mode(): EditorMode {
    return this.interaction.mode
  }

  set mode(mode: EditorMode) {
    this.interaction.mode = mode
  }

  /** The same as assigning `mode`, for callers that prefer a method. */
  setMode(mode: EditorMode): void {
    this.interaction.mode = mode
  }

  get selection(): Selection {
    return this.interaction.selection
  }

  get hover(): Hit {
    return this.interaction.hover
  }

  /** True while a chain of walls is being drawn. */
  get drawing(): boolean {
    return this.interaction.drawing
  }

  on<Name extends keyof PlanEditorEvents>(
    name: Name,
    listener: Listener<PlanEditorEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  /** Frames the whole plan, or resets the view when the plan is empty. */
  fit(): void {
    const bounds = boundingBox(this.floorplan.corners)
    if (bounds) this.viewport.fit(bounds)
    else this.viewport.reset()
    this.emitter.emit('viewport', this.viewport)
    this.scheduleRender()
  }

  deleteSelection(): boolean {
    return this.interaction.deleteSelection()
  }

  /** Steps the selected door to its next way of hanging. Returns whether a door was selected. */
  flipSelectedDoor(): boolean {
    return this.interaction.flipSelectedDoor()
  }

  /** Turns the selected item counter-clockwise by `angle` radians. */
  turnSelectedItem(angle: number): boolean {
    return this.interaction.turnSelectedItem(angle)
  }

  /** Removes the canvas and all listeners. The editor cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    for (const cleanup of this.cleanups) cleanup()
    this.interaction.dispose()
    this.canvas.remove()
  }

  private listen<Name extends keyof HTMLElementEventMap>(
    name: Name,
    handler: (event: HTMLElementEventMap[Name]) => void,
    options?: AddEventListenerOptions,
  ): void {
    this.canvas.addEventListener(name, handler, options)
    this.cleanups.push(() => this.canvas.removeEventListener(name, handler, options))
  }

  private input(event: PointerEvent): PointerInput {
    const rect = this.canvas.getBoundingClientRect()
    const screen = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    return {
      screen,
      world: this.viewport.toWorld(screen),
      button: event.button,
      altKey: event.altKey,
    }
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.focus({ preventScroll: true })
    this.canvas.setPointerCapture(event.pointerId)
    this.interaction.pointerDown(this.input(event))
    this.updateCursor()
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    this.interaction.pointerMove(this.input(event))
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    this.interaction.pointerUp(this.input(event))
    this.updateCursor()
  }

  private readonly onPointerCancel = (): void => {
    this.interaction.pointerCancel()
    this.updateCursor()
  }

  private readonly onPointerLeave = (event: PointerEvent): void => {
    // A captured pointer keeps reporting moves while a drag continues outside the canvas.
    if (this.canvas.hasPointerCapture(event.pointerId)) return
    this.interaction.pointerCancel()
    this.updateCursor()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    // Line and page scrolling report small deltas; treat them as pixels times a factor.
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1
    this.interaction.wheel(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      event.deltaY * factor,
    )
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.interaction.key(event.key)) event.preventDefault()
  }

  private readonly resize = (): void => {
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    if (width === 0 || height === 0) return
    const ratio = Math.min(window.devicePixelRatio || 1, 3)
    this.canvas.width = Math.round(width * ratio)
    this.canvas.height = Math.round(height * ratio)
    this.viewport.setSize(width, height)
    this.render()
  }

  private readonly scheduleRender = (): void => {
    if (this.disposed || this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      this.render()
    })
  }

  private render(): void {
    if (this.disposed || this.viewport.width === 0 || this.viewport.height === 0) return
    const ratio = this.canvas.width / this.viewport.width
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const selection = this.interaction.selection
    const selectedItem =
      selection?.kind === 'item' ? this.floorplan.getItem(selection.id) : undefined
    render(this.context, {
      floorplan: this.floorplan,
      viewport: this.viewport,
      hover: this.interaction.hover,
      selection,
      preview: this.interaction.preview,
      theme: this.theme,
      sizeOf: this.catalog.sizeOf,
      overlaps: findOverlaps(this.floorplan, this.catalog.sizeOf),
      rotateHandle: selectedItem
        ? rotateHandlePosition(
            selectedItem,
            this.catalog.sizeOf(selectedItem.catalogKey),
            this.viewport.metresPerPixel,
          )
        : null,
      rotateHandleHover: this.interaction.overRotateHandle,
      unfitOpenings: unfitOpenings(this.floorplan),
      draggedOpening: this.interaction.draggedOpening,
    })
  }

  private updateCursor(): void {
    const { mode, hover } = this.interaction
    let cursor = 'default'
    if (mode === 'draw') cursor = 'crosshair'
    else if (this.interaction.overRotateHandle) cursor = 'alias'
    else if (hover)
      cursor = mode === 'delete' ? 'pointer' : hover.kind === 'corner' ? 'move' : 'grab'
    this.canvas.style.cursor = cursor
  }
}
