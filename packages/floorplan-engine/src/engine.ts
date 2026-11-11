import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Emitter, type Listener } from './core/events.js'
import { Floorplan, type FloorplanOptions } from './model/floorplan.js'
import type { Plan } from './schema/plan.js'

export interface FloorplanEngineOptions {
  /** Element that hosts the 3D view. The engine adds a canvas to it and follows its size. */
  view3d: HTMLElement
  /** Tolerances and wall defaults for the floor-plan model. */
  floorplan?: FloorplanOptions
}

export type FloorplanEngineEvents = {
  /** A plan was loaded with `load()`. */
  load: Plan
}

/** Side length of the ground grid, in metres. Each cell is one metre. */
const GRID_SIZE = 20

export class FloorplanEngine {
  /** The plan being edited: corners, walls and the rooms detected from them. */
  readonly floorplan: Floorplan

  private readonly container: HTMLElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 500)
  private readonly controls: OrbitControls
  private readonly grid: GridHelper
  private readonly resizeObserver: ResizeObserver
  private readonly emitter = new Emitter<FloorplanEngineEvents>()
  private readonly stopWatchingFloorplan: () => void
  private disposed = false

  constructor(options: FloorplanEngineOptions) {
    this.container = options.view3d
    this.floorplan = new Floorplan(options.floorplan)
    this.stopWatchingFloorplan = this.floorplan.on('change', this.render)

    this.renderer = new WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const canvas = this.renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    this.container.appendChild(canvas)

    this.scene.background = new Color(0xf4f4f5)
    this.scene.add(new AmbientLight(0xffffff, 1.2))
    const sun = new DirectionalLight(0xffffff, 2)
    sun.position.set(6, 12, 8)
    this.scene.add(sun)

    this.grid = new GridHelper(GRID_SIZE, GRID_SIZE, 0x71717a, 0xd4d4d8)
    this.scene.add(this.grid)

    this.camera.position.set(8, 8, 10)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(0, 0, 0)
    // Keep the camera above the floor.
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.minDistance = 1
    this.controls.maxDistance = 100
    this.controls.addEventListener('change', this.render)
    this.controls.update()

    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(this.container)
    this.resize()
  }

  /**
   * Validates `input` against the plan format and makes it the current plan.
   * Throws a `ZodError` if the input is not a valid plan.
   */
  load(input: unknown): Plan {
    this.assertActive()
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

  /** Releases the WebGL context, listeners and the canvas. The engine cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopWatchingFloorplan()
    this.resizeObserver.disconnect()
    this.controls.removeEventListener('change', this.render)
    this.controls.dispose()
    this.grid.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
    this.emitter.clear()
  }

  private readonly render = (): void => {
    if (this.disposed) return
    this.renderer.render(this.scene, this.camera)
  }

  private readonly resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.container
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.render()
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('FloorplanEngine has been disposed')
  }
}
