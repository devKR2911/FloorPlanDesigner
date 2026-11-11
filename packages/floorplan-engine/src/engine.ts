import { Emitter, type Listener } from './core/events.js'
import { PlanEditor, type PlanEditorOptions } from './editor/plan-editor.js'
import { Floorplan, type FloorplanOptions } from './model/floorplan.js'
import type { Plan } from './schema/plan.js'
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
}

export type FloorplanEngineEvents = {
  /** A plan was loaded with `load()`. */
  load: Plan
}

export class FloorplanEngine {
  /** The plan being edited: corners, walls and the rooms detected from them. */
  readonly floorplan: Floorplan
  /** The 2D plan editor, when a `view2d` element was given. Shares `floorplan` with the 3D view. */
  readonly editor: PlanEditor | null
  /** The 3D view: walls and floors drawn from `floorplan`, with its camera modes. */
  readonly view3d: View3D

  private readonly emitter = new Emitter<FloorplanEngineEvents>()
  private disposed = false

  constructor(options: FloorplanEngineOptions) {
    this.floorplan = new Floorplan(options.floorplan)
    this.editor = options.view2d
      ? new PlanEditor({ host: options.view2d, floorplan: this.floorplan, ...options.editor })
      : null
    this.view3d = new View3D({
      host: options.view3d,
      floorplan: this.floorplan,
      ...(options.view3dTheme && { theme: options.view3dTheme }),
    })
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

  /** Releases both views and their listeners. The engine cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.editor?.dispose()
    this.view3d.dispose()
    this.emitter.clear()
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('FloorplanEngine has been disposed')
  }
}
