import type { PlanSummary } from '@floorplandesigner/shared'
import { useNavigate } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { describeError } from '@/lib/api-client'
import { PlanCard } from './PlanCard'
import { DeletePlanDialog, PlanNameDialog } from './PlanDialogs'
import { useCreatePlan, useDeletePlan, useDuplicatePlan, usePlans, useRenamePlan } from './queries'

/** The name filter is shown once the list is longer than this. */
const FILTER_FROM = 6

const gridClass = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4'

/** The app's first screen: every saved plan, with ways to create, rename, copy and delete. */
export function PlanListScreen() {
  const plans = usePlans()
  const navigate = useNavigate()
  const create = useCreatePlan()
  const rename = useRenamePlan()
  const duplicate = useDuplicatePlan()
  const remove = useDeletePlan()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<PlanSummary | null>(null)
  const [deleting, setDeleting] = useState<PlanSummary | null>(null)
  const [filter, setFilter] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Floor Plan Designer'
  }, [])

  const all = plans.data ?? []
  const needle = filter.trim().toLowerCase()
  const shown = needle ? all.filter((plan) => plan.name.toLowerCase().includes(needle)) : all

  function openCreate() {
    create.reset()
    setCreating(true)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-sm font-semibold">Floor Plan Designer</h1>
        {/* With no plans yet, the welcome below has the one button to make the first. */}
        {all.length > 0 && (
          <Button className="ml-auto" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            New plan
          </Button>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-6">
        {notice && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-sm text-destructive"
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

        {plans.isPending ? (
          <ul aria-label="Loading plans" aria-busy="true" className={gridClass}>
            {Array.from({ length: 6 }, (_, index) => (
              <li key={index} className="overflow-hidden rounded-xl border">
                <div className="aspect-[8/5] animate-pulse bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : plans.isError ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center text-sm">
            <p role="alert" className="text-destructive">
              Could not load your plans: {describeError(plans.error)}
            </p>
            <Button variant="outline" disabled={plans.isFetching} onClick={() => plans.refetch()}>
              {plans.isFetching ? 'Trying…' : 'Try again'}
            </Button>
          </div>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <h2 className="text-lg font-semibold">No plans yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Draw the walls of a room, add doors, windows and furniture, and walk through it in 3D.
            </p>
            <Button onClick={openCreate}>
              <Plus data-icon="inline-start" />
              New plan
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-sm font-medium">
                {all.length === 1 ? '1 plan' : `${all.length} plans`}
              </h2>
              {all.length > FILTER_FROM && (
                <Input
                  type="search"
                  aria-label="Filter plans by name"
                  placeholder="Filter by name"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  className="ml-auto h-8 w-56"
                />
              )}
            </div>
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No plan has “{filter.trim()}” in its name.
              </p>
            ) : (
              <ul className={gridClass}>
                {shown.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onRename={() => {
                      rename.reset()
                      setRenaming(plan)
                    }}
                    onDuplicate={() =>
                      duplicate.mutate(plan, {
                        onSuccess: () => setNotice(null),
                        onError: (error) =>
                          setNotice(`Could not duplicate “${plan.name}”: ${describeError(error)}`),
                      })
                    }
                    onDelete={() => setDeleting(plan)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {creating && (
        <PlanNameDialog
          title="New plan"
          description="Give the plan a name. You can change it later."
          initialName="Untitled plan"
          submitLabel="Create"
          pending={create.isPending}
          error={
            create.isError ? `Could not create the plan: ${describeError(create.error)}` : null
          }
          chooseUnits
          onClose={() => setCreating(false)}
          onSubmit={(name, units) =>
            create.mutate(
              { name, units },
              {
                onSuccess: (plan) =>
                  navigate({ to: '/plans/$planId', params: { planId: plan.id } }),
              },
            )
          }
        />
      )}

      {renaming && (
        <PlanNameDialog
          title="Rename plan"
          description="The drawing is not changed."
          initialName={renaming.name}
          submitLabel="Rename"
          pending={rename.isPending}
          error={
            rename.isError ? `Could not rename the plan: ${describeError(rename.error)}` : null
          }
          onClose={() => setRenaming(null)}
          onSubmit={(name) =>
            rename.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) })
          }
        />
      )}

      {deleting && (
        <DeletePlanDialog
          plan={deleting}
          onClose={() => setDeleting(null)}
          onConfirm={() => {
            const plan = deleting
            setDeleting(null)
            remove.mutate(plan, {
              onSuccess: () => setNotice(null),
              onError: (error) =>
                setNotice(`Could not delete “${plan.name}”: ${describeError(error)}`),
            })
          }}
        />
      )}
    </div>
  )
}
