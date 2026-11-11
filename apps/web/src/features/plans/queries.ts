import { createEmptyPlan, type Plan } from '@floorplandesigner/engine/schema'
import type { PlanRecord, PlanSummary } from '@floorplandesigner/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

async function createPlan(input: {
  name: string
  document?: Plan
  thumbnail?: string | null
}): Promise<PlanRecord> {
  const response = await api.plans.$post({
    json: {
      name: input.name,
      document: input.document ?? createEmptyPlan(),
      thumbnail: input.thumbnail ?? null,
    },
  })
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

async function updatePlan(
  id: string,
  changes: { name?: string; document?: Plan; thumbnail?: string | null },
): Promise<PlanRecord> {
  const response = await api.plans[':id'].$patch({ param: { id }, json: changes })
  if (!response.ok) throw await toApiError(response)
  return response.json()
}

async function deletePlan(id: string): Promise<void> {
  const response = await api.plans[':id'].$delete({ param: { id } })
  if (!response.ok) throw await toApiError(response)
}

/** Lists saved plans, most recently updated first. */
export function usePlans() {
  return useQuery({ queryKey: planKeys.list(), queryFn: listPlans })
}

/** Loads one saved plan, afresh each time a screen starts using it. */
export function usePlan(id: string) {
  return useQuery({
    queryKey: planKeys.detail(id),
    queryFn: () => getPlan(id),
    // The editor holds the working copy, so a background refetch must not replace it...
    staleTime: Infinity,
    // ...and a copy from an earlier visit must not be shown in place of the saved plan.
    gcTime: 0,
  })
}

/** Creates a plan: an empty one, unless a document is given. */
export function useCreatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createPlan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.list() }),
  })
}

/** Saves a plan's drawing and its picture for the plan list. */
export function useSavePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; document: Plan; thumbnail: string | null }) =>
      updatePlan(id, changes),
    onSuccess: (record) => {
      queryClient.setQueryData(planKeys.detail(record.id), record)
      return queryClient.invalidateQueries({ queryKey: planKeys.list() })
    },
  })
}

/** Renames a plan, leaving its drawing alone. */
export function useRenamePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updatePlan(id, { name }),
    onSuccess: (record) => {
      // An open editor shows the new name, without its working copy being replaced.
      queryClient.setQueryData<PlanRecord>(
        planKeys.detail(record.id),
        (current) => current && { ...current, name: record.name, updatedAt: record.updatedAt },
      )
      return queryClient.invalidateQueries({ queryKey: planKeys.list() })
    },
  })
}

/** Makes a copy of a plan, named "Copy of …". */
export function useDuplicatePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (plan: PlanSummary) => {
      const original = await getPlan(plan.id)
      return createPlan({
        name: `Copy of ${original.name}`.slice(0, 200),
        document: original.document,
        thumbnail: original.thumbnail,
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.list() }),
  })
}

/**
 * Deletes a plan. It leaves the list at once, and is put back if the backend refuses.
 */
export function useDeletePlan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (plan: PlanSummary) => deletePlan(plan.id),
    onMutate: async (plan) => {
      await queryClient.cancelQueries({ queryKey: planKeys.list() })
      const previous = queryClient.getQueryData<PlanSummary[]>(planKeys.list())
      queryClient.setQueryData<PlanSummary[]>(planKeys.list(), (plans) =>
        plans?.filter((other) => other.id !== plan.id),
      )
      return { previous }
    },
    onError: (_error, _plan, context) => {
      if (context?.previous) queryClient.setQueryData(planKeys.list(), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: planKeys.list() }),
  })
}
