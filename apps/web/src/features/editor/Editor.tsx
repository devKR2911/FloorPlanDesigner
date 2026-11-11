import {
  createEmptyPlan,
  type CameraMode,
  type EditorMode,
  type FloorplanEngine,
  type Selection,
} from '@floorplandesigner/engine'
import type { PlanRecord } from '@floorplandesigner/shared'
import {
  Armchair,
  Box,
  Footprints,
  Maximize,
  MousePointer2,
  Pencil,
  Rotate3d,
  Save,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useReducer, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { catalog, catalogItem } from '@/features/catalog/catalog'
import { CatalogPanel } from '@/features/catalog/CatalogPanel'
import { usePlans, useSavePlan } from '@/features/plans/queries'
import { writePlanIdToUrl } from '@/lib/plan-url'
import { EngineCanvas, type EditorView } from './EngineCanvas'
import { ItemInspector } from './ItemInspector'
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

const CAMERA_MODES: { value: CameraMode; label: string; icon: typeof Rotate3d; hint: string }[] = [
  {
    value: 'orbit',
    label: 'Orbit',
    icon: Rotate3d,
    hint: 'Drag to orbit, right-drag to pan, scroll to zoom. Drag furniture to move it; R turns it, Delete removes it.',
  },
  {
    value: 'walk',
    label: 'Walk',
    icon: Footprints,
    hint: 'Drag to look around. Move with W A S D or the arrow keys, and hold Shift to go faster. Press Escape to leave.',
  },
]

export function Editor({ initialPlan }: EditorProps) {
  const [engine, setEngine] = useState<FloorplanEngine | null>(null)
  const [view, setView] = useState<EditorView>('2d')
  const [mode, setMode] = useState<EditorMode>('move')
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [selection, setSelection] = useState<Selection>(null)
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [itemError, setItemError] = useState<string | null>(null)
  const [planId, setPlanId] = useState(initialPlan?.id ?? null)
  const [name, setName] = useState(initialPlan?.name ?? 'Untitled plan')
  // Kept from the first render: later saves must not reload the plan over the working copy.
  const [initialDocument] = useState(() => initialPlan?.document ?? createEmptyPlan())
  // Bumped on every model change so the inspector shows current values.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const plans = usePlans()
  const save = useSavePlan()

  // Before the plan is loaded, so its items are drawn at their sizes from the start.
  useEffect(() => engine?.setCatalog(catalog.items), [engine])

  useEffect(() => {
    if (!engine) return
    engine.load(initialDocument)
    engine.editor?.fit()
  }, [engine, initialDocument])

  useEffect(() => {
    if (!engine) return
    // A new engine starts in move mode with nothing selected, matching the initial state here.
    const stops = [
      engine.on('selection', setSelection),
      engine.on('itemError', ({ catalogKey }) => {
        const name = catalogItem(catalogKey)?.name ?? catalogKey
        setItemError(`Could not load the model for “${name}”. It is shown as a box.`)
      }),
      engine.floorplan.on('change', bump),
    ]
    if (engine.editor) stops.push(engine.editor.on('mode', setMode))
    return () => stops.forEach((stop) => stop())
  }, [engine])

  // A new 3D view starts in orbit mode, matching the initial state here.
  useEffect(() => engine?.view3d.on('cameraMode', setCameraMode), [engine])

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
  const selectedItem =
    selection?.kind === 'item' ? (engine?.floorplan.getItem(selection.id) ?? null) : null

  function addItem(key: string) {
    if (!engine) return
    engine.addItem(key)
    // Focus the view showing, so R and Delete work on the new item straight away.
    const canvas = view === '2d' ? engine.editor?.canvas : engine.view3d.canvas
    canvas?.focus({ preventScroll: true })
  }

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={catalogOpen ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={catalogOpen}
              aria-label="Furniture catalogue"
              onClick={() => setCatalogOpen((open) => !open)}
            >
              <Armchair data-icon="inline-start" />
              Furniture
            </Button>
          </TooltipTrigger>
          <TooltipContent>{catalogOpen ? 'Hide' : 'Show'} the furniture catalogue</TooltipContent>
        </Tooltip>
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
            <FitButton onClick={() => engine.editor?.fit()} />
            <span className="text-xs text-muted-foreground">
              {mode === 'draw'
                ? 'Click to place corners. Click the first corner, press Escape or double click to finish. Hold Alt to disable snapping.'
                : mode === 'delete'
                  ? 'Click a wall, corner or item to remove it.'
                  : 'Drag corners, walls and furniture. R turns the selected item. Drag empty space to pan, scroll to zoom.'}
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

        {view === '3d' && engine && (
          <>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-label="Camera"
              value={cameraMode}
              onValueChange={(value) => {
                if (value) engine.view3d.setCameraMode(value as CameraMode)
              }}
            >
              {CAMERA_MODES.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem key={value} value={value} aria-label={`${label} camera`}>
                  <Icon />
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FitButton disabled={cameraMode !== 'orbit'} onClick={() => engine.view3d.fit()} />
            <span className="text-xs text-muted-foreground">
              {CAMERA_MODES.find(({ value }) => value === cameraMode)?.hint}
            </span>
          </>
        )}

        {selectedItem && engine && (
          <ItemInspector
            key={selectedItem.id}
            item={selectedItem}
            name={catalogItem(selectedItem.catalogKey)?.name ?? selectedItem.catalogKey}
            onRotate={(rotation) => engine.floorplan.updateItem(selectedItem.id, { rotation })}
            onDelete={() => engine.floorplan.removeItem(selectedItem.id)}
          />
        )}
      </div>

      {itemError && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-sm text-destructive"
        >
          {itemError}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="ml-auto"
            onClick={() => setItemError(null)}
          >
            <X />
          </Button>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {catalogOpen && <CatalogPanel onAdd={addItem} enabled={engine !== null} />}
        <div className="relative min-w-0 flex-1">
          <EngineCanvas view={view} onEngineChange={setEngine} className="absolute inset-0" />
        </div>
      </main>
    </div>
  )
}

function FitButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Fit plan to view"
          disabled={disabled}
          onClick={onClick}
        >
          <Maximize />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Fit plan to view</TooltipContent>
    </Tooltip>
  )
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString()
}
