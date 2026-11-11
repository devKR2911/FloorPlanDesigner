import type { Opening } from '@floorplandesigner/engine'
import { ArrowLeftRight, FlipVertical2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type OpeningChanges = Partial<Pick<Opening, 'width' | 'height' | 'sill' | 'hinge' | 'swing'>>

interface OpeningInspectorProps {
  opening: Readonly<Opening>
  /** Applies the changes. Returns false if they do not fit the wall, and then nothing changed. */
  onChange: (changes: OpeningChanges) => boolean
  onDelete: () => void
}

/** Edits the selected door or window. Lengths are in metres. */
export function OpeningInspector({ opening, onChange, onDelete }: OpeningInspectorProps) {
  const door = opening.kind === 'door'
  return (
    <div className="ml-auto flex items-center gap-2 text-sm">
      <span className="font-medium">{door ? 'Door' : 'Window'}</span>
      <MetreField label="Width" value={opening.width} onCommit={(width) => onChange({ width })} />
      <MetreField
        label="Height"
        value={opening.height}
        onCommit={(height) => onChange({ height })}
      />
      {!door && (
        <MetreField
          label="Sill"
          value={opening.sill}
          min={0}
          onCommit={(sill) => onChange({ sill })}
        />
      )}
      {door && (
        <>
          <IconButton
            label="Hinge on the other side"
            onClick={() => onChange({ hinge: opening.hinge === 'start' ? 'end' : 'start' })}
          >
            <ArrowLeftRight />
          </IconButton>
          <IconButton
            label="Open to the other side"
            onClick={() => onChange({ swing: opening.swing === 'front' ? 'back' : 'front' })}
          >
            <FlipVertical2 />
          </IconButton>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={door ? 'Delete door' : 'Delete window'}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  )
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function MetreField({
  label,
  value,
  min = 0.01,
  onCommit,
}: {
  label: string
  value: number
  min?: number
  onCommit: (value: number) => boolean
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}</span>
      <Input
        type="number"
        aria-label={`${label} in metres`}
        // Uncontrolled, so typing is not fought by the model's value; `key` resets it per opening.
        defaultValue={value}
        min={min}
        step={0.05}
        className="h-7 w-20"
        onChange={(event) => {
          const next = event.target.valueAsNumber
          const valid = Number.isFinite(next) && next >= min && onCommit(next)
          event.target.setAttribute('aria-invalid', String(!valid))
        }}
        onBlur={(event) => {
          // A value that was refused is replaced by the one the opening really has.
          event.target.value = String(value)
          event.target.setAttribute('aria-invalid', 'false')
        }}
      />
      <span className="text-muted-foreground">m</span>
    </label>
  )
}
