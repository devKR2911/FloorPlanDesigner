import type { Wall } from '@floorplandesigner/engine'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MetreField } from './MetreField'

interface WallInspectorProps {
  wall: Readonly<Wall>
  onChange: (changes: { thickness?: number; height?: number }) => void
  onDelete: () => void
}

/** Edits the selected wall's size. Values are in metres. */
export function WallInspector({ wall, onChange, onDelete }: WallInspectorProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Wall</h2>
      <MetreField
        label="Thickness"
        value={wall.thickness}
        step={0.01}
        onCommit={(thickness) => onChange({ thickness })}
      />
      <MetreField
        label="Height"
        value={wall.height}
        step={0.01}
        onCommit={(height) => onChange({ height })}
      />
      <Button variant="outline" size="sm" className="mt-1 justify-start" onClick={onDelete}>
        <Trash2 data-icon="inline-start" />
        Delete wall
      </Button>
    </div>
  )
}
