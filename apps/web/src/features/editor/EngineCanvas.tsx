import { FloorplanEngine } from '@floorplandesigner/engine'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type EditorView = '2d' | '3d'

interface EngineCanvasProps {
  /** Which view is shown. Both stay mounted, so switching is instant. */
  view: EditorView
  /**
   * Called with the engine once it is mounted, and with `null` when it is disposed.
   * Pass a stable function, such as a state setter; a new function remounts the engine.
   */
  onEngineChange: (engine: FloorplanEngine | null) => void
  className?: string
}

/** Hosts a `FloorplanEngine` with its 2D editor and 3D view, and disposes it on unmount. */
export function EngineCanvas({ view, onEngineChange, className }: EngineCanvasProps) {
  const host2d = useRef<HTMLDivElement>(null)
  const host3d = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!host2d.current || !host3d.current) return

    const engine = new FloorplanEngine({ view3d: host3d.current, view2d: host2d.current })
    if (import.meta.env.DEV) {
      // For browser checks and debugging only; not set in production builds.
      ;(window as unknown as { __floorplanEngine?: FloorplanEngine }).__floorplanEngine = engine
    }
    onEngineChange(engine)

    return () => {
      onEngineChange(null)
      engine.dispose()
    }
  }, [onEngineChange])

  return (
    <div className={cn('relative', className)}>
      <div ref={host2d} className={cn('absolute inset-0', view !== '2d' && 'hidden')} />
      <div ref={host3d} className={cn('absolute inset-0', view !== '3d' && 'hidden')} />
    </div>
  )
}
