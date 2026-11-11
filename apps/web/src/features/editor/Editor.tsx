import { createEmptyPlan, type FloorplanEngine } from '@floorplandesigner/engine'
import type { PlanRecord } from '@floorplandesigner/shared'
import { Save } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { usePlans, useSavePlan } from '@/features/plans/queries'
import { writePlanIdToUrl } from '@/lib/plan-url'
import { EngineCanvas } from './EngineCanvas'

interface EditorProps {
  /** The saved plan to open, or `null` to start a new one. */
  initialPlan: PlanRecord | null
}

export function Editor({ initialPlan }: EditorProps) {
  const [engine, setEngine] = useState<FloorplanEngine | null>(null)
  const [planId, setPlanId] = useState(initialPlan?.id ?? null)
  const [name, setName] = useState(initialPlan?.name ?? 'Untitled plan')
  // Kept from the first render: later saves must not reload the plan over the working copy.
  const [initialDocument] = useState(() => initialPlan?.document ?? createEmptyPlan())
  const plans = usePlans()
  const save = useSavePlan()

  useEffect(() => {
    engine?.load(initialDocument)
  }, [engine, initialDocument])

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
            className="h-8 w-56 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
      <main className="relative min-h-0 flex-1">
        <EngineCanvas onEngineChange={setEngine} className="absolute inset-0" />
      </main>
    </div>
  )
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString()
}
