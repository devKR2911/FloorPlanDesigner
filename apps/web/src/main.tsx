import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from './components/ui/tooltip'
import { ApiError } from './lib/api-client'
import { router } from './router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx answer will not change on retry; only retry network and server errors.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
