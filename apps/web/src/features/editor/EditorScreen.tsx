import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { ScreenMessage } from '@/components/screen-message'
import { usePlan } from '@/features/plans/queries'
import { ApiError, describeError } from '@/lib/api-client'
import { Editor } from './Editor'

const backToPlans = (
  <Link to="/" className="underline underline-offset-4">
    Back to your plans
  </Link>
)

/** Loads the plan named in the address and shows the editor for it. */
export function EditorScreen({ planId }: { planId: string }) {
  const plan = usePlan(planId)

  if (plan.isPending) return <ScreenMessage>Loading plan…</ScreenMessage>

  if (plan.isError) {
    // The backend answers 404 for a plan it does not have, and 400 for an id that is not one.
    const missing = plan.error instanceof ApiError && [400, 404].includes(plan.error.status)
    return (
      <ScreenMessage>
        {missing ? (
          <p role="alert">This plan could not be found. It may have been deleted.</p>
        ) : (
          <>
            <p role="alert">Could not open this plan: {describeError(plan.error)}</p>
            <Button variant="outline" disabled={plan.isFetching} onClick={() => plan.refetch()}>
              {plan.isFetching ? 'Trying…' : 'Try again'}
            </Button>
          </>
        )}
        {backToPlans}
      </ScreenMessage>
    )
  }

  // Keyed by id, so opening another plan starts a fresh editor.
  return <Editor key={plan.data.id} plan={plan.data} />
}

/** Shown for an address that is not a screen of the app. */
export function NotFoundScreen() {
  return (
    <ScreenMessage>
      <p role="alert">Page not found.</p>
      {backToPlans}
    </ScreenMessage>
  )
}
