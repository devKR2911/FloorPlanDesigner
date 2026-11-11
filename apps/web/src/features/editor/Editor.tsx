import {
  FloorplanError,
  type CameraMode,
  type EditorMode,
  type Floorplan,
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
  Square,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useBlocker } from '@tanstack/react-router'
import { useEffect, useReducer, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { catalog, catalogItem } from '@/features/catalog/catalog'
import { CatalogPanel } from '@/features/catalog/CatalogPanel'
import type { OpeningPreset } from '@/features/catalog/openings'
import { useRenamePlan } from '@/features/plans/queries'
import { ApiError, describeError } from '@/lib/api-client'
import { EditorHeader, type SaveStatus } from './EditorHeader'
import { EngineCanvas, type EditorView } from './EngineCanvas'
import { ItemInspector } from './ItemInspector'
import { OpeningInspector } from './OpeningInspector'
import { useHistoryState, usePlanSaving } from './use-plan-saving'
import { WallInspector } from './WallInspector'

interface EditorProps {
  /** The saved plan to edit. */
  plan: PlanRecord
}

/** Whether a key press is meant for a text field, which has its own undo. */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLTextAreaElement || target.isContentEditable) return true
  return target instanceof HTMLInputElement
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
    hint: 'Drag to orbit, right-drag to pan, scroll to zoom. Drag furniture, doors and windows to move them; R turns an item, F flips a door.',
  },
  {
    value: 'walk',
    label: 'Walk',
    icon: Footprints,
    hint: 'Drag to look around. Move with W A S D or the arrow keys, and hold Shift to go faster. Walls stop you; doorways let you through. Escape leaves.',
  },
]

export function Editor({ plan }: EditorProps) {
  const [engine, setEngine] = useState<FloorplanEngine | null>(null)
  const [view, setView] = useState<EditorView>('2d')
  const [mode, setMode] = useState<EditorMode>('move')
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [selection, setSelection] = useState<Selection>(null)
  const [catalogOpen, setCatalogOpen] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  // Kept from the first render: later saves must not reload the plan over the working copy.
  const [initialDocument] = useState(plan.document)
  // Bumped on every model change so the inspector shows current values.
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const rename = useRenamePlan()
  const history = useHistoryState(engine)
  const { dirty, saving, error, flush, markLoaded } = usePlanSaving(
    engine,
    plan.id,
    history.position,
  )

  // Before the plan is loaded, so its items are drawn at their sizes from the start.
  useEffect(() => engine?.setCatalog(catalog.items), [engine])

  useEffect(() => {
    if (!engine) return
    engine.load(initialDocument)
    markLoaded()
    engine.editor?.fit()
  }, [engine, initialDocument, markLoaded])

  useEffect(() => {
    if (!engine) return
    // A new engine starts in move mode with nothing selected, matching the initial state here.
    const stops = [
      engine.on('selection', setSelection),
      engine.on('itemError', ({ catalogKey }) => {
        const name = catalogItem(catalogKey)?.name ?? catalogKey
        setNotice(`Could not load the model for “${name}”. It is shown as a box.`)
      }),
      engine.floorplan.on('change', bump),
    ]
    if (engine.editor) stops.push(engine.editor.on('mode', setMode))
    return () => stops.forEach((stop) => stop())
  }, [engine])

  // A new 3D view starts in orbit mode, matching the initial state here.
  useEffect(() => engine?.view3d.on('cameraMode', setCameraMode), [engine])

  // Ctrl+S saves now; Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo. Cmd on a Mac.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        void flush()
        return
      }
      // A text field keeps its own undo for what is typed into it.
      if (!engine || isTextField(event.target)) return
      if (key === 'z' && !event.shiftKey) engine.history.undo()
      else if ((key === 'z' && event.shiftKey) || key === 'y') engine.history.redo()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [engine, flush])

  useEffect(() => {
    document.title = `${plan.name} – Floor Plan Designer`
  }, [plan.name])

  // Leaving the editor saves first. It only asks when that save fails, and closing the tab
  // gets the browser's own prompt while something is unsaved, since a page cannot wait there.
  const dirtyNow = useRef(dirty)
  useEffect(() => {
    dirtyNow.current = dirty
  }, [dirty])
  const leaving = useBlocker({
    shouldBlockFn: async () => !(await flush()),
    enableBeforeUnload: () => dirtyNow.current,
    withResolver: true,
  })

  let status: SaveStatus
  if (saving) status = { kind: 'saving' }
  else if (error !== null) {
    status = {
      kind: 'error',
      message: `Could not save: ${describeError(error)}`,
      missing: error instanceof ApiError && error.status === 404,
    }
  } else if (dirty) status = { kind: 'unsaved' }
  else status = { kind: 'saved', at: plan.updatedAt }

  const selectedWall =
    selection?.kind === 'wall' ? (engine?.floorplan.getWall(selection.id) ?? null) : null
  const selectedOpening =
    selection?.kind === 'opening' ? (engine?.floorplan.getOpening(selection.id) ?? null) : null
  const selectedItem =
    selection?.kind === 'item' ? (engine?.floorplan.getItem(selection.id) ?? null) : null

  /** Focuses the view showing, so the keys for the new selection work straight away. */
  function focusView() {
    const canvas = view === '2d' ? engine?.editor?.canvas : engine?.view3d.canvas
    canvas?.focus({ preventScroll: true })
  }

  function addItem(key: string) {
    if (!engine) return
    engine.addItem(key)
    focusView()
  }

  function addOpening({ name, kind, width, height, sill }: OpeningPreset) {
    if (!engine) return
    try {
      engine.addOpening({ kind, width, height, sill })
      setNotice(null)
      focusView()
    } catch (error) {
      if (!(error instanceof FloorplanError)) throw error
      setNotice(
        engine.floorplan.walls.length === 0
          ? `Draw a wall first: a ${name.toLowerCase()} needs a wall to go in.`
          : `No wall has room for a ${name.toLowerCase()}.`,
      )
    }
  }

  /** Applies a change to a door or window. Returns false, changing nothing, if it does not fit. */
  function changeOpening(id: string, changes: Parameters<Floorplan['updateOpening']>[1]) {
    if (!engine) return false
    try {
      engine.floorplan.updateOpening(id, changes)
      return true
    } catch (error) {
      if (!(error instanceof FloorplanError)) throw error
      return false
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader
        name={plan.name}
        onRename={(name) => rename.mutate({ id: plan.id, name })}
        renameError={rename.isError ? `Could not rename: ${describeError(rename.error)}` : null}
        status={status}
      />

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
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Undo"
                disabled={!history.canUndo}
                onClick={() => engine?.history.undo()}
              >
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Redo"
                disabled={!history.canRedo}
                onClick={() => engine?.history.redo()}
              >
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </div>
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
                  ? 'Click a wall, corner, door, window or item to remove it.'
                  : 'Drag corners, walls, doors, windows and furniture. R turns an item, F flips a door. Drag empty space to pan, scroll to zoom.'}
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

        {selectedOpening && engine && (
          <OpeningInspector
            key={selectedOpening.id}
            opening={selectedOpening}
            onChange={(changes) => changeOpening(selectedOpening.id, changes)}
            onDelete={() => engine.floorplan.removeOpening(selectedOpening.id)}
          />
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

      {notice && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-2 border-b bg-destructive/10 px-4 py-1.5 text-sm text-destructive"
        >
          {notice}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss"
            className="ml-auto"
            onClick={() => setNotice(null)}
          >
            <X />
          </Button>
        </div>
      )}

      <main className="flex min-h-0 flex-1">
        {catalogOpen && (
          <CatalogPanel onAdd={addItem} onAddOpening={addOpening} enabled={engine !== null} />
        )}
        <div className="relative min-w-0 flex-1">
          <EngineCanvas view={view} onEngineChange={setEngine} className="absolute inset-0" />
        </div>
      </main>

      <AlertDialog open={leaving.status === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Your changes could not be saved</AlertDialogTitle>
            <AlertDialogDescription>
              {error !== null ? describeError(error) : 'The last save did not go through.'} If you
              leave now, the changes to “{plan.name}” since the last save are lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => leaving.reset?.()}>Stay</AlertDialogCancel>
            <Button variant="outline" onClick={() => leaving.proceed?.()}>
              Leave without saving
            </Button>
            <AlertDialogAction
              disabled={saving}
              onClick={async (event) => {
                // Keep the dialog open until the save has finished.
                event.preventDefault()
                if (await flush()) leaving.proceed?.()
              }}
            >
              Try again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
