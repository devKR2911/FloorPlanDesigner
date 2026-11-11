import {
  AmbientLight,
  Color,
  DirectionalLight,
  Euler,
  GridHelper,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Emitter, type Listener } from '../core/events.js'
import { SelectionStore } from '../core/selection.js'
import type { Floorplan } from '../model/floorplan.js'
import { boundingBox, type Point } from '../model/geometry.js'
import { ItemCatalog } from '../model/item-catalog.js'
import { defaultPlacementSettings, placeItem, type PlacementSettings } from '../model/placement.js'
import { toPlan, toScene } from './coordinates.js'
import {
  defaultWalkSettings,
  isMoving,
  isWalkKey,
  lookBy,
  stepWalk,
  walkInput,
  type WalkSettings,
  type WalkState,
} from './first-person.js'
import { floorPointFromRay } from './item-dragging.js'
import { ItemScene, type ItemLoadError, type ItemObjectData } from './item-scene.js'
import { ModelLibrary, createGltfLoader, type ModelLoader } from './model-library.js'
import { PlanScene, type WallMeshData } from './plan-scene.js'
import { easeInOut, type Tween } from './tween.js'
import { wallsFacingCamera } from './wall-cutaway.js'

/** `orbit` circles the plan from outside. `walk` moves through it at eye height. */
export type CameraMode = 'orbit' | 'walk'

/** Colours of the 3D view, as CSS colour strings. */
export interface View3DTheme {
  background: string
  wall: string
  floor: string
  gridMajor: string
  gridMinor: string
  /** Items whose model is loading or missing. */
  itemPlaceholder: string
  itemSelected: string
  /** Outline of items that overlap a wall or another item. */
  itemOverlap: string
}

export const defaultView3DTheme: View3DTheme = {
  background: '#f4f4f5',
  wall: '#f3f1ec',
  floor: '#cfc6b8',
  gridMajor: '#71717a',
  gridMinor: '#d4d4d8',
  itemPlaceholder: '#c4c4c8',
  itemSelected: '#1d4ed8',
  itemOverlap: '#dc2626',
}

export interface View3DOptions {
  /** Element that hosts the 3D view. The view adds a canvas to it and follows its size. */
  host: HTMLElement
  floorplan: Floorplan
  theme?: Partial<View3DTheme>
  walk?: Partial<WalkSettings>
  /** Item sizes and model URLs. */
  catalog?: ItemCatalog
  /** The selection to share with other views. */
  selection?: SelectionStore
  /** Wall and grid snapping for items. */
  placement?: PlacementSettings
  /** Where the Draco decoder files are served, for compressed models. */
  dracoPath?: string
  /** Replaces the GLB loader, for tests. */
  loadModel?: ModelLoader
}

export type View3DEvents = {
  cameraMode: CameraMode
  /** An item's model could not be loaded. It is shown as a box instead. */
  itemError: ItemLoadError
}

/** How far, in pixels, the pointer may travel for a press to still count as a click. */
const CLICK_SLOP = 3

/** Height of a wall that is lowered because it stands between the camera and a room, in metres. */
export const LOWERED_WALL_HEIGHT = 0.1

/** Smallest side length of the ground grid, in metres. Each cell is one metre. */
const MIN_GRID_SIZE = 20
/** The grid sits just below the floors so the two never share a plane. */
const GRID_HEIGHT = -0.01
const ORBIT_FOV = 50
const WALK_FOV = 70
const CAMERA_MOVE_SECONDS = 0.4
/** The longest step a single frame may take, so a stalled tab does not jump the walker. */
const MAX_FRAME_SECONDS = 0.1
const DEFAULT_CAMERA_POSITION = new Vector3(8, 8, 10)

/**
 * The 3D view of a `Floorplan`: walls and floors, lit, with an orbit camera and a walk-through
 * camera. It draws on demand, and only runs a frame loop while the camera is moving.
 */
export class View3D {
  readonly canvas: HTMLCanvasElement
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(ORBIT_FOV, 1, 0.05, 500)
  readonly theme: View3DTheme
  readonly walkSettings: WalkSettings
  readonly catalog: ItemCatalog
  readonly selection: SelectionStore
  readonly placement: PlacementSettings

  private readonly host: HTMLElement
  private readonly floorplan: Floorplan
  private readonly renderer: WebGLRenderer
  private readonly controls: OrbitControls
  private readonly planScene: PlanScene
  private readonly itemScene: ItemScene
  private readonly library: ModelLibrary
  private readonly disposeLoader: () => void
  private readonly raycaster = new Raycaster()
  private readonly resizeObserver: ResizeObserver
  private readonly emitter = new Emitter<View3DEvents>()
  private readonly cleanups: (() => void)[] = []
  private grid: GridHelper

  private mode: CameraMode = 'orbit'
  private walk: WalkState = { x: 0, y: 0, yaw: 0, pitch: 0 }
  /** Where the orbit camera was when walk mode was entered. */
  private orbitBeforeWalk: { position: Vector3; target: Vector3 } | null = null
  private readonly heldKeys = new Set<string>()
  private lookDrag: { pointerId: number; x: number; y: number } | null = null
  /** An item being dragged across the floor in orbit mode. */
  private itemDrag: { pointerId: number; id: string; offset: Point; rotation: number } | null = null
  /** A press on empty space, which clears the selection if it ends without moving. */
  private press: { pointerId: number; x: number; y: number } | null = null

  private tween: Tween | null = null
  private frame: number | null = null
  private lastFrameTime: number | null = null
  /** Set when a plan is loaded, so the camera frames it the next time the view is shown. */
  private fitPending = false
  private visible = false
  private disposed = false

  constructor(options: View3DOptions) {
    this.host = options.host
    this.floorplan = options.floorplan
    this.theme = { ...defaultView3DTheme, ...options.theme }
    this.walkSettings = { ...defaultWalkSettings, ...options.walk }
    this.catalog = options.catalog ?? new ItemCatalog()
    this.selection = options.selection ?? new SelectionStore()
    this.placement = options.placement ?? { ...defaultPlacementSettings }

    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.canvas = this.renderer.domElement
    this.canvas.tabIndex = 0
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.outline = 'none'
    this.canvas.style.touchAction = 'none'
    this.host.appendChild(this.canvas)

    this.scene.background = new Color(this.theme.background)
    this.scene.add(new AmbientLight(0xffffff, 1.1))
    const sun = new DirectionalLight(0xffffff, 2)
    sun.position.set(6, 12, 8)
    this.scene.add(sun)
    // A weaker light from the other side, so walls facing away from the sun are not all one tone.
    const fill = new DirectionalLight(0xffffff, 0.6)
    fill.position.set(-8, 6, -5)
    this.scene.add(fill)

    this.grid = this.createGrid(MIN_GRID_SIZE)
    this.scene.add(this.grid)

    this.planScene = new PlanScene(this.floorplan, this.theme)
    this.scene.add(this.planScene.group)

    if (options.loadModel) {
      this.library = new ModelLibrary(options.loadModel)
      this.disposeLoader = () => {}
    } else {
      const loader = createGltfLoader(options.dracoPath)
      this.library = new ModelLibrary(loader.load)
      this.disposeLoader = loader.dispose
    }
    this.itemScene = new ItemScene(this.floorplan, this.catalog, this.library, {
      placeholder: this.theme.itemPlaceholder,
      selected: this.theme.itemSelected,
      overlap: this.theme.itemOverlap,
    })
    this.itemScene.setSelection(this.selection.current)
    this.scene.add(this.itemScene.group)

    this.camera.position.copy(DEFAULT_CAMERA_POSITION)
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.target.set(0, 0, 0)
    // Keep the camera above the floor.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.minDistance = 1
    this.controls.maxDistance = 200
    this.controls.addEventListener('change', this.invalidate)
    this.controls.update()

    this.cleanups.push(
      this.planScene.on('rebuild', () => {
        this.updateGrid()
        this.invalidate()
      }),
      this.itemScene.on('update', this.invalidate),
      this.itemScene.on('error', (error) => this.emitter.emit('itemError', error)),
      this.selection.on('change', (selection) => {
        this.itemScene.setSelection(selection)
        this.invalidate()
      }),
      this.floorplan.on('change', ({ kind }) => {
        if (kind !== 'load') return
        if (this.visible && this.mode === 'orbit') this.fit({ animate: false })
        else this.fitPending = true
      }),
    )
    // In the capture phase, so a press on an item is seen before the orbit controls start orbiting.
    this.canvas.addEventListener('pointerdown', this.onPointerDownFirst, { capture: true })
    this.cleanups.push(() =>
      this.canvas.removeEventListener('pointerdown', this.onPointerDownFirst, { capture: true }),
    )
    this.listen('pointerdown', this.onPointerDown)
    this.listen('pointermove', this.onPointerMove)
    this.listen('pointerup', this.onPointerEnd)
    this.listen('pointercancel', this.onPointerEnd)
    this.listen('keydown', this.onKeyDown)
    this.listen('keyup', this.onKeyUp)
    this.listen('blur', this.onBlur)

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.host)
    this.resize()
  }

  get cameraMode(): CameraMode {
    return this.mode
  }

  /** Whether the view is shown, which a host of zero size is not. */
  get isVisible(): boolean {
    return this.visible
  }

  /** The point on the plan the orbit camera looks at, or where the walker stands. */
  get focusPoint(): Point {
    if (this.mode === 'walk') return { x: this.walk.x, y: this.walk.y }
    return toPlan(this.controls.target)
  }

  /** How many different model files have been asked for so far. */
  get loadedModelCount(): number {
    return this.library.size
  }

  /** Whether an item's model is showing, rather than a stand-in box. */
  hasItemModel(id: string): boolean {
    return this.itemScene.hasModel(id)
  }

  /** Switches between orbiting the plan and walking through it. The camera glides across. */
  setCameraMode(mode: CameraMode): void {
    if (this.disposed || mode === this.mode) return
    this.finishTween()
    this.mode = mode
    this.heldKeys.clear()
    this.lookDrag = null
    this.itemDrag = null
    this.press = null
    if (mode === 'walk') this.enterWalk()
    else this.leaveWalk()
    this.canvas.style.cursor = mode === 'walk' ? 'grab' : ''
    this.emitter.emit('cameraMode', mode)
  }

  /**
   * Frames the whole plan, keeping the direction the camera looks from. An empty plan gets the
   * default view. Does nothing in walk mode.
   */
  fit(options: { animate?: boolean } = {}): void {
    if (this.disposed || this.mode !== 'orbit') return
    this.finishTween()
    this.fitPending = false
    const { position, target } = this.framing()
    if (options.animate === false || prefersReducedMotion()) {
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.controls.update()
      this.invalidate()
      return
    }
    const fromPosition = this.camera.position.clone()
    const fromTarget = this.controls.target.clone()
    this.startTween({
      step: (k) => {
        this.camera.position.lerpVectors(fromPosition, position, k)
        this.controls.target.lerpVectors(fromTarget, target, k)
        this.controls.update()
      },
    })
  }

  on<Name extends keyof View3DEvents>(
    name: Name,
    listener: Listener<View3DEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  /** Releases the WebGL context, listeners and the canvas. The view cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    for (const cleanup of this.cleanups) cleanup()
    this.controls.removeEventListener('change', this.invalidate)
    this.controls.dispose()
    this.planScene.dispose()
    this.itemScene.dispose()
    this.library.dispose()
    this.disposeLoader()
    this.grid.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
    this.emitter.clear()
  }

  // Camera modes

  private enterWalk(): void {
    this.orbitBeforeWalk = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
    }
    this.controls.enabled = false

    // Start in the largest room, or in the middle of the plan when there is no room, looking
    // the way the orbit camera was looking.
    const rooms = this.floorplan.rooms
    const largest = rooms.reduce<(typeof rooms)[number] | null>(
      (best, room) => (best === null || room.area > best.area ? room : best),
      null,
    )
    const bounds = boundingBox(this.floorplan.corners)
    const start =
      largest?.centroid ??
      (bounds
        ? { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 }
        : { x: 0, y: 0 })
    const looking = this.controls.target.clone().sub(this.camera.position)
    const heading = toPlan(looking)
    this.walk = {
      x: start.x,
      y: start.y,
      yaw: Math.atan2(heading.y, heading.x),
      pitch: 0,
    }

    const pose = this.walkPose()
    this.glideTo(pose.position, pose.quaternion, WALK_FOV)
  }

  private leaveWalk(): void {
    const orbit = this.orbitBeforeWalk ?? this.framing()
    this.orbitBeforeWalk = null
    this.controls.target.copy(orbit.target)
    const aim = new PerspectiveCamera()
    aim.position.copy(orbit.position)
    aim.lookAt(orbit.target)
    this.glideTo(orbit.position, aim.quaternion, ORBIT_FOV, () => {
      this.controls.enabled = true
      this.controls.update()
    })
  }

  /** Moves the camera to a position, direction and field of view over a short time. */
  private glideTo(position: Vector3, quaternion: Quaternion, fov: number, done?: () => void): void {
    const fromPosition = this.camera.position.clone()
    const fromQuaternion = this.camera.quaternion.clone()
    const fromFov = this.camera.fov
    this.startTween({
      step: (k) => {
        this.camera.position.lerpVectors(fromPosition, position, k)
        this.camera.quaternion.slerpQuaternions(fromQuaternion, quaternion, k)
        this.camera.fov = fromFov + (fov - fromFov) * k
        this.camera.updateProjectionMatrix()
      },
      done,
    })
  }

  /** The camera position and direction for the current walk state. */
  private walkPose(): { position: Vector3; quaternion: Quaternion } {
    const { x, y, yaw, pitch } = this.walk
    const position = new Vector3(...toScene({ x, y }, this.walkSettings.eyeHeight))
    // A camera with no rotation looks along scene -z, which is the plan's +y: a heading of 90°.
    const quaternion = new Quaternion().setFromEuler(new Euler(pitch, yaw - Math.PI / 2, 0, 'YXZ'))
    return { position, quaternion }
  }

  private applyWalkPose(): void {
    const { position, quaternion } = this.walkPose()
    this.camera.position.copy(position)
    this.camera.quaternion.copy(quaternion)
  }

  /** Where the orbit camera should be to see the whole plan from its current direction. */
  private framing(): { position: Vector3; target: Vector3 } {
    const bounds = boundingBox(this.floorplan.corners)
    if (!bounds) return { position: DEFAULT_CAMERA_POSITION.clone(), target: new Vector3() }

    // Frame the box around the walls, not just their outline on the floor, so tall walls fit.
    const height = Math.max(0, ...this.floorplan.walls.map((wall) => wall.height))
    const centre = { x: (bounds.min.x + bounds.max.x) / 2, y: (bounds.min.y + bounds.max.y) / 2 }
    const target = new Vector3(...toScene(centre, height / 2))
    const radius = Math.max(
      Math.hypot(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, height) / 2,
      1.5,
    )
    // The narrower of the vertical and horizontal half-angles decides how far back to stand.
    const vertical = (ORBIT_FOV * Math.PI) / 360
    const horizontal = Math.atan(Math.tan(vertical) * this.camera.aspect)
    const distance = Math.min(
      (radius / Math.sin(Math.min(vertical, horizontal))) * 1.15,
      this.controls.maxDistance,
    )
    const direction = this.camera.position.clone().sub(this.controls.target)
    if (direction.lengthSq() === 0) direction.copy(DEFAULT_CAMERA_POSITION)
    direction.normalize()
    return { position: target.clone().addScaledVector(direction, distance), target }
  }

  // Tweens and the frame loop

  private startTween(tween: Omit<Tween, 'startTime'>): void {
    if (prefersReducedMotion()) {
      tween.step(1)
      tween.done?.()
      this.invalidate()
      return
    }
    this.tween = { ...tween, startTime: null }
    this.invalidate()
  }

  /** Jumps a running tween to its end, so the next move starts from a settled camera. */
  private finishTween(): void {
    const tween = this.tween
    if (!tween) return
    this.tween = null
    tween.step(1)
    tween.done?.()
  }

  /** Asks for a frame. Several requests before the next frame draw once. */
  private readonly invalidate = (): void => {
    if (this.disposed || this.frame !== null) return
    this.frame = requestAnimationFrame(this.onFrame)
  }

  private readonly onFrame = (time: number): void => {
    this.frame = null
    const seconds =
      this.lastFrameTime === null
        ? 0
        : Math.min((time - this.lastFrameTime) / 1000, MAX_FRAME_SECONDS)
    this.lastFrameTime = time

    const tween = this.tween
    const input = walkInput(this.heldKeys)
    if (tween) {
      tween.startTime ??= time
      const progress = Math.min(1, (time - tween.startTime) / (CAMERA_MOVE_SECONDS * 1000))
      tween.step(easeInOut(progress))
      if (progress >= 1 && this.tween === tween) {
        this.tween = null
        tween.done?.()
      }
    } else if (this.mode === 'walk' && isMoving(input)) {
      this.walk = stepWalk(this.walk, input, seconds, this.walkSettings)
      this.applyWalkPose()
    }

    this.render()

    // Keep the loop going only while something is still moving.
    if (this.tween || (this.mode === 'walk' && isMoving(input))) this.invalidate()
    else this.lastFrameTime = null
  }

  private render(): void {
    if (this.disposed || !this.visible) return
    this.updateCutaway()
    this.renderer.render(this.scene, this.camera)
  }

  /** Lowers the walls that stand between the orbit camera and a room, and raises the rest. */
  private updateCutaway(): void {
    const lowered =
      this.mode === 'orbit' ? wallsFacingCamera(this.floorplan, toPlan(this.camera.position)) : null
    for (const mesh of this.planScene.wallMeshes) {
      const { id, height } = mesh.userData as WallMeshData
      mesh.scale.y = lowered?.has(id) ? Math.min(1, LOWERED_WALL_HEIGHT / height) : 1
    }
  }

  // The grid

  private createGrid(size: number): GridHelper {
    const grid = new GridHelper(size, size, this.theme.gridMajor, this.theme.gridMinor)
    grid.position.y = GRID_HEIGHT
    grid.userData.size = size
    return grid
  }

  /** Grows or shrinks the grid so it always reaches two metres past the plan. */
  private updateGrid(): void {
    let reach = 0
    for (const corner of this.floorplan.corners) {
      reach = Math.max(reach, Math.abs(corner.x), Math.abs(corner.y))
    }
    const size = Math.max(MIN_GRID_SIZE, 2 * Math.ceil(reach + 2))
    if (size === this.grid.userData.size) return
    this.scene.remove(this.grid)
    this.grid.dispose()
    this.grid = this.createGrid(size)
    this.scene.add(this.grid)
  }

  // Input

  private listen<Name extends keyof HTMLElementEventMap>(
    name: Name,
    handler: (event: HTMLElementEventMap[Name]) => void,
  ): void {
    this.canvas.addEventListener(name, handler)
    this.cleanups.push(() => this.canvas.removeEventListener(name, handler))
  }

  /** Runs before the orbit controls. A press on an item starts dragging it instead of orbiting. */
  private readonly onPointerDownFirst = (event: PointerEvent): void => {
    if (this.mode !== 'orbit' || event.button !== 0 || this.tween) return
    const id = this.itemUnder(event)
    if (!id) {
      this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
      return
    }
    const item = this.floorplan.getItem(id)
    const floor = this.floorPointUnder(event)
    if (!item || !floor) return
    this.controls.enabled = false
    this.canvas.setPointerCapture(event.pointerId)
    this.selection.set({ kind: 'item', id })
    this.itemDrag = {
      pointerId: event.pointerId,
      id,
      offset: { x: item.position.x - floor.x, y: item.position.y - floor.y },
      rotation: item.rotation,
    }
    this.canvas.style.cursor = 'grabbing'
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.focus({ preventScroll: true })
    if (this.mode !== 'walk') return
    this.canvas.setPointerCapture(event.pointerId)
    this.lookDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    this.canvas.style.cursor = 'grabbing'
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.mode === 'orbit') {
      this.onOrbitPointerMove(event)
      return
    }
    const drag = this.lookDrag
    if (!drag || drag.pointerId !== event.pointerId || this.mode !== 'walk') return
    this.walk = lookBy(this.walk, event.clientX - drag.x, event.clientY - drag.y, this.walkSettings)
    drag.x = event.clientX
    drag.y = event.clientY
    // While the camera is still gliding into place, the turn is picked up when it arrives.
    if (!this.tween) {
      this.applyWalkPose()
      this.invalidate()
    }
  }

  private onOrbitPointerMove(event: PointerEvent): void {
    const drag = this.itemDrag
    if (drag?.pointerId === event.pointerId) {
      const item = this.floorplan.getItem(drag.id)
      const floor = this.floorPointUnder(event)
      if (!item || !floor) return
      const placed = placeItem(
        {
          position: { x: floor.x + drag.offset.x, y: floor.y + drag.offset.y },
          rotation: drag.rotation,
        },
        this.catalog.sizeOf(item.catalogKey),
        this.floorplan,
        event.altKey ? { ...this.placement, enabled: false } : this.placement,
      )
      this.floorplan.updateItem(drag.id, { position: placed.position, rotation: placed.rotation })
      return
    }
    const press = this.press
    if (press?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_SLOP)
        this.press = null
      return
    }
    // Hovering, with no button held.
    if (event.buttons === 0) this.canvas.style.cursor = this.itemUnder(event) ? 'grab' : ''
  }

  private readonly onPointerEnd = (event: PointerEvent): void => {
    if (this.itemDrag?.pointerId === event.pointerId) {
      this.itemDrag = null
      this.controls.enabled = true
      if (this.canvas.hasPointerCapture(event.pointerId)) {
        this.canvas.releasePointerCapture(event.pointerId)
      }
      this.canvas.style.cursor = 'grab'
      return
    }
    if (this.press?.pointerId === event.pointerId) {
      // A click on empty space, walls or floors clears the selection.
      this.press = null
      if (event.type === 'pointerup') this.selection.set(null)
      return
    }
    if (this.lookDrag?.pointerId !== event.pointerId) return
    this.lookDrag = null
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId)
    }
    if (this.mode === 'walk') this.canvas.style.cursor = 'grab'
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.mode === 'orbit') {
      this.onOrbitKeyDown(event)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.setCameraMode('orbit')
      return
    }
    if (!isWalkKey(event.code)) return
    event.preventDefault()
    this.heldKeys.add(event.code)
    this.invalidate()
  }

  /** `R` turns the selected item a quarter, `Delete` removes it, `Escape` clears the selection. */
  private onOrbitKeyDown(event: KeyboardEvent): void {
    const selected = this.selection.current
    if (selected?.kind !== 'item') return
    const item = this.floorplan.getItem(selected.id)
    if (!item) return
    switch (event.key) {
      case 'r':
      case 'R':
        this.floorplan.updateItem(item.id, { rotation: item.rotation + Math.PI / 2 })
        break
      case 'Delete':
      case 'Backspace':
        this.selection.set(null)
        this.floorplan.removeItem(item.id)
        break
      case 'Escape':
        this.selection.set(null)
        break
      default:
        return
    }
    event.preventDefault()
  }

  /** The id of the item under the pointer, if any. */
  private itemUnder(event: PointerEvent): string | null {
    this.aimRay(event)
    for (const hit of this.raycaster.intersectObjects(this.itemScene.group.children, true)) {
      let object: typeof hit.object | null = hit.object
      while (object && (object.userData as Partial<ItemObjectData>).kind !== 'item') {
        object = object.parent
      }
      if (object) return (object.userData as ItemObjectData).id
    }
    return null
  }

  /** Where the pointer's ray meets the floor, on the plan. */
  private floorPointUnder(event: PointerEvent): Point | null {
    this.aimRay(event)
    return floorPointFromRay(this.raycaster.ray.origin, this.raycaster.ray.direction)
  }

  private aimRay(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(pointer, this.camera)
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.heldKeys.delete(event.code)
  }

  private readonly onBlur = (): void => {
    this.heldKeys.clear()
  }

  // Size

  private readonly resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.host
    this.visible = width > 0 && height > 0
    this.planScene.setActive(this.visible)
    this.itemScene.setActive(this.visible)
    if (!this.visible) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    if (this.fitPending && this.mode === 'orbit') this.fit({ animate: false })
    // Drawn at once, not on the next frame, so a resized canvas is never shown empty.
    this.render()
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
