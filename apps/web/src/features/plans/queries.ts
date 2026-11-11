import type { Plan } from '@floorplandesigner/engine/schema'
import type { PlanRecord, PlanSummary } from '@floorplandesigner/shared'
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, toApiError } from '@/lib/api-client'

export const planKeys = {
  all: ['plans'] as const,
  list: () => [...planKeys.all, 'list'] as const,
  detail: (id: string) => [...planKeys.all, 'detail', id] as const,
}

async function listPlans(): Promise<PlanSummary[]> {
  const response = await api.plans.$get()
  if (!response.ok) throw await toApiError(response)
  return (await response.json()).plans
}

async function getPlan(id: string): Promise<PlanRecord> {
  const response = await api.plans[':id'].$get({ param: { id } })
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

export interface SavePlanInput {
  /** Id of the plan to update, or `null` to create a new plan. */
  id: string | null
  name: string
  document: Plan
}

async function savePlan({ id, name, document }: SavePlanInput): Promise<PlanRecord> {
  const response =
    id === null
      ? await api.plans.$post({ json: { name, document } })
      : await api.plans[':id'].$patch({ param: { id }, json: { name, document } })
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

/** Lists saved plans, most recently updated first. */
export function usePlans() {
  return useQuery({ queryKey: planKeys.list(), queryFn: listPlans })
}

/** Loads one saved plan. Pass `null` to load nothing. */
export function usePlan(id: string | null) {
  return useQuery({
    queryKey: planKeys.detail(id ?? ''),
    queryFn: id === null ? skipToken : () => getPlan(id),
    // The editor holds the working copy, so a background refetch must not replace it.
    staleTime: Infinity,
  })
}

/** Creates a plan, or updates it when the input has an id. */
export function useSavePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: savePlan,
    onSuccess: (record) => {
      queryClient.setQueryData(planKeys.detail(record.id), record)
      return queryClient.invalidateQueries({ queryKey: planKeys.list() })
    },
  })
}
