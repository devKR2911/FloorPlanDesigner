import { Emitter, type Listener } from './events.js'

/** What is selected: a corner, a wall, an item, or a door or window, by id. */
export type Selection = { kind: 'corner' | 'wall' | 'item' | 'opening' | 'room'; id: string } | null

export type SelectionEvents = {
  change: Selection
}

/** One selection shared by the 2D editor and the 3D view, so both always show the same thing. */
export class SelectionStore {
  private value: Selection = null
  private readonly emitter = new Emitter<SelectionEvents>()

  get current(): Selection {
    return this.value
  }

  /** Changes the selection. Does nothing, and fires nothing, if it is already selected. */
  set(selection: Selection): void {
    if (sameSelection(selection, this.value)) return
    this.value = selection
    this.emitter.emit('change', selection)
  }

  on<Name extends keyof SelectionEvents>(
    name: Name,
    listener: Listener<SelectionEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && a.id === b.id
}
