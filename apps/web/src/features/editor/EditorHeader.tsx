import { Link } from '@tanstack/react-router'
import { ChevronLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MAX_PLAN_NAME_LENGTH } from '@/features/plans/PlanDialogs'

/** What the header says about saving. */
export type SaveStatus =
  | { kind: 'saving' }
  | { kind: 'error'; message: string; missing: boolean }
  | { kind: 'unsaved' }
  | { kind: 'saved'; at: string }

interface EditorHeaderProps {
  name: string
  /** Renames the plan. Called only with a name that is not empty and has changed. */
  onRename: (name: string) => void
  /** What went wrong with the last rename, if it failed. */
  renameError: string | null
  status: SaveStatus
  canSave: boolean
  onSave: () => void
}

/** The editor's top bar: the way back to the list, the plan's name, and saving. */
export function EditorHeader({
  name,
  onRename,
  renameError,
  status,
  canSave,
  onSave,
}: EditorHeaderProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/">
          <ChevronLeft data-icon="inline-start" />
          Plans
        </Link>
      </Button>
      {/* Keyed by the saved name, so a rename elsewhere, or a refused one, resets the field. */}
      <NameField key={name} name={name} onRename={onRename} />
      <Button disabled={!canSave} onClick={onSave}>
        <Save data-icon="inline-start" />
        Save
      </Button>
      {renameError ? (
        <span role="alert" className="text-sm text-destructive">
          {renameError}
        </span>
      ) : (
        <StatusText status={status} />
      )}
    </header>
  )
}

function NameField({ name, onRename }: Pick<EditorHeaderProps, 'name' | 'onRename'>) {
  const [draft, setDraft] = useState(name)

  function commit() {
    const trimmed = draft.trim()
    if (trimmed === '') setDraft(name)
    else if (trimmed !== name) onRename(trimmed)
  }

  return (
    <input
      aria-label="Plan name"
      value={draft}
      maxLength={MAX_PLAN_NAME_LENGTH}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(name)
          // Blur after the reset has been applied, so the old draft is not committed.
          const field = event.currentTarget
          requestAnimationFrame(() => field.blur())
        }
      }}
      className="h-8 w-56 rounded-lg border border-transparent bg-transparent px-2 text-sm font-medium outline-none hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  )
}

function StatusText({ status }: { status: SaveStatus }) {
  if (status.kind === 'error') {
    return (
      <span role="alert" className="text-sm text-destructive">
        {status.missing ? 'This plan no longer exists, so it cannot be saved. ' : status.message}
        {status.missing && (
          <Link to="/" className="underline underline-offset-4">
            Back to your plans
          </Link>
        )}
      </span>
    )
  }
  return (
    <span role="status" className="text-sm text-muted-foreground">
      {status.kind === 'saving'
        ? 'Saving…'
        : status.kind === 'unsaved'
          ? 'Unsaved changes'
          : `Saved at ${new Date(status.at).toLocaleTimeString()}`}
    </span>
  )
}
