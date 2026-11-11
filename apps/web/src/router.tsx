import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouterHistory,
} from '@tanstack/react-router'
import { NotFoundScreen } from '@/components/not-found-screen'
import { ScreenMessage } from '@/components/screen-message'
import { PlanListScreen } from '@/features/plans/PlanListScreen'

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundScreen,
})

const planListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  // Before the plan list existed, the open plan was named by `?plan=<id>`.
  validateSearch: (search: Record<string, unknown>): { plan?: string } =>
    typeof search.plan === 'string' ? { plan: search.plan } : {},
  beforeLoad: ({ search }) => {
    if (search.plan) {
      throw redirect({ to: '/plans/$planId', params: { planId: search.plan }, replace: true })
    }
  },
  component: PlanListScreen,
})

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/plans/$planId',
  // The editor brings the engine and Three.js with it, so it is loaded when first needed and
  // the plan list opens without them.
  component: lazyRouteComponent(() => import('@/features/editor/EditorScreen'), 'EditorScreen'),
})

const routeTree = rootRoute.addChildren([planListRoute, editorRoute])

/** Makes the app's router. Tests pass a history that lives in memory. */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    defaultPendingComponent: () => <ScreenMessage>Loading…</ScreenMessage>,
    ...(history && { history }),
  })
}

export const router = createAppRouter()

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
