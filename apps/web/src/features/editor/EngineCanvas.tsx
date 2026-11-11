import { FloorplanEngine } from '@floorplandesigner/engine'
import { useEffect, useRef } from 'react'

interface EngineCanvasProps {
  /**
   * Called with the engine once it is mounted, and with `null` when it is disposed.
   * Pass a stable function, such as a state setter; a new function remounts the engine.
   */
  onEngineChange: (engine: FloorplanEngine | null) => void
  className?: string
}

/** Hosts a `FloorplanEngine` in a div that fills its parent, and disposes it on unmount. */
export function EngineCanvas({ onEngineChange, className }: EngineCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const engine = new FloorplanEngine({ view3d: host })
    onEngineChange(engine)

    return () => {
      onEngineChange(null)
      engine.dispose()
    }
  }, [onEngineChange])

  return <div ref={hostRef} className={className} />
}
