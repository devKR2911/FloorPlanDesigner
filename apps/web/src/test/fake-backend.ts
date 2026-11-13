import type { PlanRecord } from '@floorplandesigner/shared'
import { vi } from 'vitest'

/** A one-pixel PNG, for plans that have a picture. */
export const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='

const emptyDocument = {
  version: 1 as const,
  corners: [],
  walls: [],
  items: [],
  openings: [],
  rooms: [],
}

/**
 * Stands in for the backend in component tests: it keeps plans in memory and answers the same
 * requests with the same shapes. Install it with `installFakeBackend()` before rendering.
 */
export class FakeBackend {
  plans: PlanRecord[] = []
  /** Every request made, as "METHOD /path". */
  requests: string[] = []
  /** When true, requests fail as they do when the backend cannot be reached. */
  offline = false
  /** While set, every request waits for it, so a test can look at the loading state. */
  gate: Promise<void> | null = null
  /** A status to answer the next request to change something with, once. */
  failNextWrite: number | null = null
  private nextId = 1

  /** Adds a plan as if it had been saved earlier. Later plans are more recently changed. */
  add(name: string, extra: Partial<PlanRecord> = {}): PlanRecord {
    const number = this.nextId++
    const time = new Date(Date.UTC(2026, 10, 11, 10, 0, number)).toISOString()
    const plan: PlanRecord = {
      id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
      name,
      document: emptyDocument,
      thumbnail: null,
      createdAt: time,
      updatedAt: time,
      ...extra,
    }
    this.plans.push(plan)
    return plan
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : null
    const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
    const path = new URL(request?.url ?? String(input), 'http://localhost').pathname
    this.requests.push(`${method} ${path}`)
    if (this.gate) await this.gate
    if (this.offline) throw new TypeError('Failed to fetch')

    const rawBody = init?.body ?? (request ? await request.text() : undefined)
    const body = typeof rawBody === 'string' && rawBody ? (JSON.parse(rawBody) as object) : {}
    const json = (status: number, data: unknown) =>
      new Response(data === null ? null : JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      })

    if (method !== 'GET' && this.failNextWrite !== null) {
      const status = this.failNextWrite
      this.failNextWrite = null
      return json(status, { error: 'The backend refused' })
    }

    const id = /^\/api\/plans\/([^/]+)$/.exec(path)?.[1]
    if (path === '/api/plans' && method === 'GET') {
      const summaries = [...this.plans]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ id, name, thumbnail, createdAt, updatedAt }) => ({
          id,
          name,
          thumbnail,
          createdAt,
          updatedAt,
        }))
      return json(200, { plans: summaries })
    }
    if (path === '/api/plans' && method === 'POST') {
      return json(201, this.add('', { ...(body as Partial<PlanRecord>) }))
    }
    const plan = this.plans.find((other) => other.id === id)
    if (!id || !plan) return json(404, { error: 'Plan not found' })
    if (method === 'GET') return json(200, plan)
    if (method === 'PATCH') {
      Object.assign(plan, body, { updatedAt: new Date(Date.UTC(2026, 10, 12)).toISOString() })
      return json(200, plan)
    }
    if (method === 'DELETE') {
      this.plans = this.plans.filter((other) => other !== plan)
      return json(204, null)
    }
    return json(404, { error: 'Not found' })
  }
}

/** Replaces `fetch` with a fake backend for the current test. */
export function installFakeBackend(): FakeBackend {
  const backend = new FakeBackend()
  vi.stubGlobal('fetch', backend.fetch)
  return backend
}
