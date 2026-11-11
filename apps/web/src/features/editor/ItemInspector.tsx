import type { Item } from '@floorplandesigner/engine'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
    <div className="ml-auto flex items-center gap-2 text-sm">
      <span className="font-medium">{name}</span>
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Rotation</span>
        <Input
          // Remounted when the rotation changes elsewhere (a drag, the handle, the R key).
          key={degrees}
          type="number"
          aria-label="Rotation in degrees"
          defaultValue={degrees}
          step={15}
          className="h-7 w-20"
          onChange={(event) => {
            const value = event.target.valueAsNumber
            if (Number.isFinite(value)) onRotate((value * Math.PI) / 180)
          }}
        />
        <span className="text-muted-foreground">°</span>
      </label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Turn a quarter"
            onClick={() => onRotate(item.rotation + Math.PI / 2)}
          >
            <RotateCcw />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Turn a quarter (R)</TooltipContent>
      </Tooltip>
      <Button variant="ghost" size="icon-sm" aria-label="Delete item" onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  )
}
