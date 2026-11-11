import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { EditorScreen, NotFoundScreen } from '@/features/editor/EditorScreen'
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
  component: function EditorRoute() {
    const { planId } = editorRoute.useParams()
    return <EditorScreen planId={planId} />
  },
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([planListRoute, editorRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
