import type { Wall } from '@floorplandesigner/engine'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface WallInspectorProps {
  wall: Readonly<Wall>
  onChange: (changes: { thickness?: number; height?: number }) => void
  onDelete: () => void
}

/** Edits the selected wall's size. Values are in metres. */
export function WallInspector({ wall, onChange, onDelete }: WallInspectorProps) {
  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Wall</span>
      <MetreField
        label="Thickness"
        value={wall.thickness}
        onCommit={(thickness) => onChange({ thickness })}
      />
      <MetreField label="Height" value={wall.height} onCommit={(height) => onChange({ height })} />
      <Button variant="ghost" size="icon-sm" aria-label="Delete wall" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  )
}

function MetreField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        aria-label={`${label} in metres`}
        // Uncontrolled, so typing is not fought by the model's rounded value; `key` resets it per wall.
        defaultValue={value}
        min={0.01}
        step={0.01}
        className="h-7 w-20"
        onChange={(event) => {
          const next = event.target.valueAsNumber
          if (Number.isFinite(next) && next > 0) onCommit(next)
        }}
      />
      <span className="text-muted-foreground">m</span>
    </label>
  )
}
