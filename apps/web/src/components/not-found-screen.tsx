import { Link } from '@tanstack/react-router'
import { ScreenMessage } from './screen-message'

/** A link to the plan list, for screens that have nothing else to offer. */
export function BackToPlans() {
  return (
    <Link to="/" className="underline underline-offset-4">
      Back to your plans
    </Link>
  )
}

/** Shown for an address that is not a screen of the app. */
export function NotFoundScreen() {
  return (
    <ScreenMessage>
      <p role="alert">Page not found.</p>
      <BackToPlans />
    </ScreenMessage>
  )
}
