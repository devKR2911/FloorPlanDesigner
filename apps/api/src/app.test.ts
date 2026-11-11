import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import type { Database } from './db/schema.js'

// Validation runs before any query, so these requests must be answered without touching the
// database. A database that throws on use proves that.
const untouchableDb = new Proxy(
  {},
  {
    get(_target, property) {
      throw new Error(`Database was used (${String(property)})`)
    },
  },
) as Database

const app = createApp(untouchableDb)

const postPlan = (body: string) =>
  app.request('/api/plans', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })

describe('request validation', () => {
  it('rejects a plan whose document is not in the plan format', async () => {
    const response = await postPlan(JSON.stringify({ name: 'Flat', document: { version: 1 } }))

    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string; issues: { path: unknown[] }[] }
    expect(body.error).toBe('Invalid request')
    expect(body.issues.map((issue) => issue.path.join('.'))).toEqual([
      'document.corners',
      'document.walls',
      'document.items',
    ])
  })

  it('rejects a plan without a name', async () => {
    const document = { version: 1, corners: [], walls: [], items: [] }
    const response = await postPlan(JSON.stringify({ document }))

    expect(response.status).toBe(400)
  })

  it('rejects a body that is not JSON', async () => {
    const response = await postPlan('{ not json')

    expect(response.status).toBe(400)
  })

  it('rejects a plan id that is not a uuid', async () => {
    const response = await app.request('/api/plans/not-a-uuid')

    expect(response.status).toBe(400)
  })

  it('answers 404 with JSON for an unknown route', async () => {
    const response = await app.request('/api/nope')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })
})
