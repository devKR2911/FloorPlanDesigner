import type { FloorplanEngine } from '@floorplandesigner/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChangeTracker } from './change-tracker'

/**
 * Tracks whether the engine's plan has changes that are not saved. Loading a plan does not
 * count as a change. A save calls `begin()` when it takes its copy of the plan, and
 * `markSaved()` with the result when it has succeeded.
 */
export function useUnsavedChanges(engine: FloorplanEngine | null) {
  const tracker = useRef(new ChangeTracker())
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!engine) return
    return engine.floorplan.on('change', ({ kind }) => {
      if (kind === 'load') return
      tracker.current.change()
      setDirty(true)
    })
  }, [engine])

  const begin = useCallback(() => tracker.current.begin(), [])
  const markSaved = useCallback((revision: number) => {
    tracker.current.markSaved(revision)
    setDirty(tracker.current.dirty)
  }, [])

  return { dirty, begin, markSaved }
}
