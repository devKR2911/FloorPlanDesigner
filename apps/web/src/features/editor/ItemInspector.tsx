import type { Item } from '@floorplandesigner/engine'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ItemInspectorProps {
  item: Readonly<Item>
  name: string
  /** Sets the rotation, in radians. */
  onRotate: (rotation: number) => void
  onDelete: () => void
}

/** Shows the selected item and edits its rotation. The field is in degrees. */
export function ItemInspector({ item, name, onRotate, onDelete }: ItemInspectorProps) {
  const degrees = Math.round((item.rotation * 180) / Math.PI)
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{name}</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Rotation</span>
        <span className="flex items-center gap-1.5">
          <Input
            // Remounted when the rotation changes elsewhere (a drag, the handle, the R key).
            key={degrees}
            type="number"
            aria-label="Rotation in degrees"
            defaultValue={degrees}
            step={15}
            className="h-8"
            onChange={(event) => {
              const value = event.target.valueAsNumber
              if (Number.isFinite(value)) onRotate((value * Math.PI) / 180)
            }}
          />
          <span className="text-muted-foreground">°</span>
        </span>
      </label>
      <div className="mt-1 flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          className="justify-start"
          title="Turn a quarter (R)"
          onClick={() => onRotate(item.rotation + Math.PI / 2)}
        >
          <RotateCcw data-icon="inline-start" />
          Turn a quarter
        </Button>
        <Button variant="outline" size="sm" className="justify-start" onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          Delete item
        </Button>
      </div>
    </div>
  )
}
