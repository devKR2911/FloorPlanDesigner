export type Listener<Payload> = (payload: Payload) => void

/** A small typed event emitter. `Events` maps each event name to its payload type. */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>()

  /** Subscribes to an event and returns a function that unsubscribes. */
  on<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): () => void {
    let set = this.listeners.get(name)
    if (!set) {
      set = new Set()
      this.listeners.set(name, set)
    }
    set.add(listener)
    return () => this.off(name, listener)
  }

  off<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): void {
    this.listeners.get(name)?.delete(listener)
  }

  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const set = this.listeners.get(name) as Set<Listener<Events[Name]>> | undefined
    if (!set) return
    // Copy first, so a listener may unsubscribe while the event is being delivered.
    for (const listener of [...set]) listener(payload)
  }

  clear(): void {
    this.listeners.clear()
  }
}
