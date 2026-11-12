import type { Opening } from '@floorplandesigner/engine'
import { ArrowLeftRight, FlipVertical2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MetreField } from './MetreField'

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
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{door ? 'Door' : 'Window'}</h2>
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
      <div className="mt-1 flex flex-col gap-2">
        {door && (
          <>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              onClick={() => onChange({ hinge: opening.hinge === 'start' ? 'end' : 'start' })}
            >
              <ArrowLeftRight data-icon="inline-start" />
              Hinge on the other side
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="justify-start"
              title="Open to the other side (F)"
              onClick={() => onChange({ swing: opening.swing === 'front' ? 'back' : 'front' })}
            >
              <FlipVertical2 data-icon="inline-start" />
              Open to the other side
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" className="justify-start" onClick={onDelete}>
          <Trash2 data-icon="inline-start" />
          {door ? 'Delete door' : 'Delete window'}
        </Button>
      </div>
    </div>
  )
}
