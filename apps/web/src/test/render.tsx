import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createAppRouter } from '@/router'

function Providers({ children }: { children: ReactNode }) {
  // No retries, so a failure shows at once instead of after the usual waits.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}

/** Renders the whole app at an address, with its real routes and a history kept in memory. */
export function renderApp(path = '/') {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  const view = render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
  return { ...view, router, user: userEvent.setup() }
}

/** Renders one piece of the app inside a router, for components that contain links. */
export function renderInRouter(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(
    <Providers>
      {/* The test router is not the one the app registered its types for. */}
      <RouterProvider router={router as never} />
    </Providers>,
  )
  return { ...view, user: userEvent.setup() }
}

/** Renders a component that needs no router. */
export function renderPlain(ui: ReactNode) {
  return { ...render(<Providers>{ui}</Providers>), user: userEvent.setup() }
}
