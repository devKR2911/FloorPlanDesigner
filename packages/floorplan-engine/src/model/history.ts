import { Emitter, type Listener } from '../core/events.js'
import type { Plan } from '../schema/plan.js'
import type { Floorplan, FloorplanChange } from './floorplan.js'

export interface HistoryOptions {
  /** How many steps back are kept. */
  limit?: number
  /** Edits to the same wall, item or opening this close together, in milliseconds, are one step. */
  joinWindow?: number
  /** The clock, in milliseconds. Replaced in tests. */
  now?: () => number
}

export type HistoryEvents = {
  /** A step was recorded, undone or redone, or the history was cleared. */
  change: undefined
}

/**
 * One state of the plan. `plan` is `null` only for the state a gesture is still changing; the
 * copy is taken when the gesture ends.
 */
interface State {
  id: number
  plan: Plan | null
}

/**
 * Undo and redo for a `Floorplan`, by keeping copies of the plan.
 *
 * Every change to the plan becomes a step, with two exceptions that make one step out of many
 * changes: everything between `begin()` and `end()`, such as one drag, and a run of edits to the
 * same wall, item or opening made close together, such as typing a number.
 *
 * Loading a plan clears the history.
 */
export class History {
  private readonly limit: number
  private readonly joinWindow: number
  private readonly now: () => number
  private readonly emitter = new Emitter<HistoryEvents>()
  private readonly stopWatching: () => void

  private past: State[] = []
  private future: State[] = []
  private current: State
  private nextId = 1
  /** How many `begin()` calls are waiting for their `end()`. */
  private depth = 0
  /** Whether the gesture that is open has changed the plan yet. */
  private gestureChanged = false
  /** The last edit that later edits may join, and when it was made. */
  private lastEdit: { kind: string; target: string; time: number } | null = null
  private restoring = false

  constructor(
    private readonly floorplan: Floorplan,
    options: HistoryOptions = {},
  ) {
    this.limit = options.limit ?? 100
    this.joinWindow = options.joinWindow ?? 1000
    this.now = options.now ?? (() => Date.now())
    this.current = { id: this.nextId++, plan: floorplan.export() }
    this.stopWatching = floorplan.on('change', this.onChange)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /**
   * A number that names the state the plan is in. It changes with every change to the plan, and
   * undo and redo bring back the number of the state they return to. So the plan is as it was
   * saved exactly when this equals the position noted at the save.
   */
  get position(): number {
    return this.current.id
  }

  /** Starts a gesture: every change until the matching `end()` is one step. */
  begin(): void {
    if (this.depth === 0) this.gestureChanged = false
    this.depth++
  }

  /** Ends a gesture. Does nothing without a matching `begin()`. */
  end(): void {
    if (this.depth === 0) return
    this.depth--
    if (this.depth === 0 && this.gestureChanged) {
      this.gestureChanged = false
      this.current.plan = this.floorplan.export()
      this.emitter.emit('change', undefined)
    }
  }

  /** Goes back one step. Returns whether there was one. Does nothing in the middle of a gesture. */
  undo(): boolean {
    return this.step(this.past, this.future)
  }

  /** Goes forward one step, after an undo. Returns whether there was one. */
  redo(): boolean {
    return this.step(this.future, this.past)
  }

  on<Name extends keyof HistoryEvents>(
    name: Name,
    listener: Listener<HistoryEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  dispose(): void {
    this.stopWatching()
    this.emitter.clear()
  }

  private step(from: State[], to: State[]): boolean {
    if (this.depth > 0) return false
    const target = from.pop()
    if (!target) return false
    to.push(this.current)
    this.current = target
    this.lastEdit = null
    this.restoring = true
    try {
      this.floorplan.restore(target.plan)
    } finally {
      this.restoring = false
    }
    this.emitter.emit('change', undefined)
    return true
  }

  private readonly onChange = (change: FloorplanChange): void => {
    if (this.restoring) return
    if (change.kind === 'load') {
      this.past = []
      this.future = []
      this.lastEdit = null
      this.current = { id: this.nextId++, plan: this.floorplan.export() }
      this.emitter.emit('change', undefined)
      return
    }

    if (this.depth > 0) {
      // The first change of a gesture starts its step; the rest of the gesture belongs to it.
      // The copy of where the gesture ends up is taken in `end()`.
      if (!this.gestureChanged) this.record(null)
      else this.current.id = this.nextId++
      this.gestureChanged = true
      this.lastEdit = null
      return
    }

    const time = this.now()
    const joins =
      change.target !== undefined &&
      this.lastEdit !== null &&
      this.lastEdit.kind === change.kind &&
      this.lastEdit.target === change.target &&
      time - this.lastEdit.time <= this.joinWindow
    if (joins) this.current = { id: this.nextId++, plan: this.floorplan.export() }
    else this.record(this.floorplan.export())
    this.lastEdit =
      change.target === undefined ? null : { kind: change.kind, target: change.target, time }
    this.emitter.emit('change', undefined)
  }

  /**
   * Makes the state before this change a step to go back to, and starts a new state with
   * `plan` as its copy. The copy of the earlier state was taken when that state was reached,
   * so the change that has just happened is not in it.
   */
  private record(plan: Plan | null): void {
    this.past.push(this.current)
    if (this.past.length > this.limit) this.past.shift()
    this.future = []
    this.current = { id: this.nextId++, plan }
  }
}
