import {
  createEmptyPlan,
  type EditorMode,
  type FloorplanEngine,
  type Selection,
} from '@floorplandesigner/engine'
import type { PlanRecord } from '@floorplandesigner/shared'
import { Box, Maximize, MousePointer2, Pencil, Save, Square, Trash2 } from 'lucide-react'
import { useEffect, useReducer, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePlans, useSavePlan } from '@/features/plans/queries'
import { writePlanIdToUrl } from '@/lib/plan-url'
import { EngineCanvas, type EditorView } from './EngineCanvas'
import { WallInspector } from './WallInspector'

interface EditorProps {
  /** The saved plan to open, or `null` to start a new one. */
  initialPlan: PlanRecord | null
}

const MODES: { value: EditorMode; label: string; icon: typeof MousePointer2 }[] = [
  { value: 'move', label: 'Move and select', icon: MousePointer2 },
  { value: 'draw', label: 'Draw walls', icon: Pencil },
  { value: 'delete', label: 'Delete', icon: Trash2 },
]

export function Editor({ initialPlan }: EditorProps) {
  const [engine, setEngine] = useState<FloorplanEngine | null>(null)
  const [view, setView] = useState<EditorView>('2d')
  const [mode, setMode] = useState<EditorMode>('move')
  const [selection, setSelection] = useState<Selection>(null)
  const [planId, setPlanId] = useState(initialPlan?.id ?? null)
  const [name, setName] = useState(initialPlan?.name ?? 'Untitled plan')
  // Kept from the first render: later saves must not reload the plan over the working copy.
  const [initialDocument] = useState(() => initialPlan?.document ?? createEmptyPlan())
  // Bumped on every model change so the inspector shows current values.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const plans = usePlans()
  const save = useSavePlan()

  useEffect(() => {
    if (!engine) return
    engine.load(initialDocument)
    engine.editor?.fit()
  }, [engine, initialDocument])

  useEffect(() => {
    if (!engine?.editor) return
    // A new editor starts in move mode with nothing selected, matching the initial state here.
    const { editor } = engine
    const stops = [
      editor.on('mode', setMode),
      editor.on('selection', setSelection),
      engine.floorplan.on('change', bump),
    ]
    return () => stops.forEach((stop) => stop())
  }, [engine])

  const canSave = engine !== null && name.trim() !== '' && !save.isPending

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!engine || !canSave) return
    save.mutate(
      { id: planId, name, document: engine.export() },
      {
        onSuccess: (record) => {
          setName(record.name)
          if (planId === null) {
            setPlanId(record.id)
            writePlanIdToUrl(record.id)
          }
        },
      },
    )
  }

  let status: string
  if (save.isPending) status = 'Saving…'
  else if (save.isError) status = `Could not save: ${save.error.message}`
  else if (save.isSuccess) status = `Saved at ${formatTime(save.data.updatedAt)}`
  else if (initialPlan) status = `Loaded, last saved at ${formatTime(initialPlan.updatedAt)}`
  else status = 'Not saved yet'

  const selectedWall =
    selection?.kind === 'wall' ? (engine?.floorplan.getWall(selection.id) ?? null) : null

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <span className="text-sm font-semibold">Floor Plan Designer</span>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            aria-label="Plan name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={200}
            className="h-8 w-48 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button type="submit" disabled={!canSave}>
            <Save data-icon="inline-start" />
            Save
          </Button>
        </form>
        <span
          role={save.isError ? 'alert' : 'status'}
          className={save.isError ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {status}
        </span>
        {plans.data && (
          <span className="ml-auto text-sm text-muted-foreground">
            {plans.data.length === 1 ? '1 saved plan' : `${plans.data.length} saved plans`}
          </span>
        )}
      </header>

      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="View"
          value={view}
          onValueChange={(value) => value && setView(value as EditorView)}
        >
          <ToggleGroupItem value="2d" aria-label="2D plan">
            <Square />
            2D
          </ToggleGroupItem>
          <ToggleGroupItem value="3d" aria-label="3D view">
            <Box />
            3D
          </ToggleGroupItem>
        </ToggleGroup>

        {view === '2d' && engine?.editor && (
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Tool"
              value={mode}
              onValueChange={(value) => {
                if (value) engine.editor?.setMode(value as EditorMode)
              }}
            >
              {MODES.map(({ value, label, icon: Icon }) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={value} aria-label={label}>
                      <Icon />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent>{label}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Fit plan to view"
                  onClick={() => engine.editor?.fit()}
                >
                  <Maximize />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit plan to view</TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground">
              {mode === 'draw'
                ? 'Click to place corners. Click the first corner, press Escape or double click to finish. Hold Alt to disable snapping.'
                : mode === 'delete'
                  ? 'Click a wall or corner to remove it.'
                  : 'Drag corners and walls. Drag empty space to pan, scroll to zoom.'}
            </span>
            {selectedWall && (
              <WallInspector
                key={selectedWall.id}
                wall={selectedWall}
                onChange={(changes) => engine.floorplan.updateWall(selectedWall.id, changes)}
                onDelete={() => engine.editor?.deleteSelection()}
              />
            )}
          </>
        )}
      </div>

      <main className="relative min-h-0 flex-1">
        <EngineCanvas view={view} onEngineChange={setEngine} className="absolute inset-0" />
      </main>
    </div>
  )
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString()
}
