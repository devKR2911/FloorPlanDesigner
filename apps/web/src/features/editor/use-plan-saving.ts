import type { FloorplanEngine } from '@floorplandesigner/engine'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSavePlan } from '@/features/plans/queries'

/** How long after the last change the plan is saved, in milliseconds. */
export const AUTOSAVE_DELAY = 2000

/** The size of the picture of the plan that is saved for the plan list, in CSS pixels. */
const THUMBNAIL_SIZE = { width: 320, height: 200 }

/** Where the engine's undo history stands. */
export function useHistoryState(engine: FloorplanEngine | null) {
  const [state, setState] = useState({ canUndo: false, canRedo: false, position: 0 })

  useEffect(() => {
    if (!engine) return
    const { history } = engine
    const read = () =>
      setState({ canUndo: history.canUndo, canRedo: history.canRedo, position: history.position })
    read()
    return history.on('change', read)
  }, [engine])

  return state
}

/**
 * Saves the engine's plan by itself: a short while after each change, and at once when the tab
 * is hidden. The plan is unsaved when the history's position differs from the position that was
 * last saved, so undoing back to the saved state makes it clean again.
 *
 * `position` is the history's current position, from `useHistoryState()`.
 */
export function usePlanSaving(engine: FloorplanEngine | null, planId: string, position: number) {
  const { mutateAsync } = useSavePlan()
  const [savedPosition, setSavedPosition] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<unknown>(null)
  /** The same as `savedPosition`, readable from inside a save that is still running. */
  const saved = useRef<number | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)

  /** Call after loading a plan into the engine: what it holds now is what is saved. */
  const markLoaded = useCallback(() => {
    if (!engine) return
    saved.current = engine.history.position
    setSavedPosition(engine.history.position)
    setError(null)
  }, [engine])

  /** Saves once, after any save that is already on its way. Resolves to whether it worked. */
  const saveOnce = useCallback(async (): Promise<boolean> => {
    if (!engine) return false
    // One save at a time, so an older copy can never arrive after a newer one.
    while (inFlight.current) await inFlight.current
    const savingPosition = engine.history.position
    if (savingPosition === saved.current) return true

    const run = (async () => {
      setSaving(true)
      try {
        await mutateAsync({
          id: planId,
          document: engine.export(),
          // The 3D view's picture, or the 2D plan's if the 3D one cannot be drawn.
          thumbnail:
            engine.view3d.snapshot(THUMBNAIL_SIZE) ??
            engine.editor?.snapshot(THUMBNAIL_SIZE) ??
            null,
        })
        saved.current = savingPosition
        setSavedPosition(savingPosition)
        setError(null)
        return true
      } catch (failure) {
        setError(failure)
        return false
      } finally {
        inFlight.current = null
        setSaving(false)
      }
    })()
    inFlight.current = run
    return run
  }, [engine, planId, mutateAsync])

  /** Saves until nothing is left unsaved, or a save fails. Resolves to whether all is saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (!engine) return true
    let ok = await saveOnce()
    while (ok && engine.history.position !== saved.current) ok = await saveOnce()
    return ok
  }, [engine, saveOnce])

  const dirty = savedPosition !== null && position !== savedPosition

  // Save a short while after the last change. A failed save is not repeated until the plan
  // changes again, since the position it was for is still the current one.
  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void saveOnce(), AUTOSAVE_DELAY)
    return () => clearTimeout(timer)
  }, [dirty, position, saveOnce])

  // Save at once when the tab goes to the background, where timers may be held back.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void saveOnce()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [saveOnce])

  return { dirty, saving, error, flush, markLoaded }
}
