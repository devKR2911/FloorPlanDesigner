import { useState } from 'react'
import { Editor } from '@/features/editor/Editor'
import { usePlan } from '@/features/plans/queries'
import { newPlanHref, readPlanIdFromUrl } from '@/lib/plan-url'

export function App() {
  const [initialPlanId] = useState(readPlanIdFromUrl)
  const plan = usePlan(initialPlanId)

  if (initialPlanId !== null && plan.isPending) {
    return <Message>Loading plan…</Message>
  }

  if (plan.isError) {
    return (
      <Message>
        <p role="alert">Could not open this plan: {plan.error.message}</p>
        <a href={newPlanHref()} className="underline underline-offset-4">
          Start a new plan
        </a>
      </Message>
    )
  }

  return <Editor initialPlan={plan.data ?? null} />
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      {children}
    </div>
  )
}
