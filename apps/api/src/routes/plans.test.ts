import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import type { PlanRecord, PlanSummary } from '@floorplandesigner/shared'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { plans, schema } from '../db/schema.js'

// The routes run against a real Postgres that lives in this process, set up by the project's
// own migrations. So these tests also prove that the migrations work from an empty database.
const db = drizzle(new PGlite(), { schema })
const app = createApp(db)

beforeAll(async () => {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
})

beforeEach(async () => {
  await db.delete(plans)
})

const emptyDocument = { version: 1, corners: [], walls: [], items: [], openings: [] }
const roomDocument = {
  ...emptyDocument,
  corners: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 4, y: 0 },
  ],
  walls: [{ id: 'w', start: 'a', end: 'b', thickness: 0.15, height: 2.5 }],
  rooms: [],
}
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
const unknownId = '00000000-0000-4000-8000-000000000000'

function send(method: string, path: string, body?: unknown) {
  return app.request(`/api/plans${path}`, {
    method,
    ...(body !== undefined && {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })
}

async function create(name: string, extra: object = {}): Promise<PlanRecord> {
  const response = await send('POST', '', { name, document: emptyDocument, ...extra })
  expect(response.status).toBe(201)
  return (await response.json()) as PlanRecord
}

async function list(): Promise<PlanSummary[]> {
  const response = await send('GET', '')
  expect(response.status).toBe(200)
  return ((await response.json()) as { plans: PlanSummary[] }).plans
}

describe('health', () => {
  it('reports the database as up', async () => {
    const response = await app.request('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'up' })
  })
})

/**
 * Waits long enough for the clock to move on, so plans changed one after the other get different
 * times. Without it two quick changes can share a millisecond and the list order is arbitrary.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5))
}

describe('creating and reading plans', () => {
  it('starts with no plans', async () => {
    expect(await list()).toEqual([])
  })

  it('creates a plan and returns it with an id and its times', async () => {
    const plan = await create('  Flat  ', { document: roomDocument })
    expect(plan).toMatchObject({ name: 'Flat', document: roomDocument, thumbnail: null })
    expect(plan.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(plan.createdAt).toBe(plan.updatedAt)
    expect(Number.isNaN(Date.parse(plan.createdAt))).toBe(false)
  })

  it('stores a plan saved before doors and windows existed with an empty list of them', async () => {
    const older = { version: 1, corners: [], walls: [], items: [] }
    const plan = await create('Old', { document: older })
    expect(plan.document.openings).toEqual([])
  })

  it('reads a plan back by its id', async () => {
    const plan = await create('Flat', { document: roomDocument, thumbnail: png })
    const response = await send('GET', `/${plan.id}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(plan)
  })

  it('lists plans without their documents, the most recently changed first', async () => {
    const first = await create('First', { thumbnail: png })
    await tick()
    const second = await create('Second')
    expect((await list()).map((plan) => plan.name)).toEqual(['Second', 'First'])

    // Renaming the older plan makes it the most recently changed.
    await tick()
    await send('PATCH', `/${first.id}`, { name: 'First, renamed' })
    const plansNow = await list()
    expect(plansNow.map((plan) => plan.id)).toEqual([first.id, second.id])
    expect(plansNow[0]).toEqual({
      id: first.id,
      name: 'First, renamed',
      thumbnail: png,
      createdAt: first.createdAt,
      updatedAt: expect.any(String) as string,
    })
    expect(plansNow[0]).not.toHaveProperty('document')
  })
})

describe('updating plans', () => {
  it('renames a plan without touching its drawing or picture', async () => {
    const plan = await create('Flat', { document: roomDocument, thumbnail: png })
    const response = await send('PATCH', `/${plan.id}`, { name: 'Home' })
    expect(response.status).toBe(200)
    const updated = (await response.json()) as PlanRecord
    expect(updated).toMatchObject({ name: 'Home', document: roomDocument, thumbnail: png })
    expect(updated.createdAt).toBe(plan.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(plan.updatedAt))
  })

  it('saves a drawing and its picture without touching the name', async () => {
    const plan = await create('Flat')
    const response = await send('PATCH', `/${plan.id}`, { document: roomDocument, thumbnail: png })
    expect(await response.json()).toMatchObject({
      name: 'Flat',
      document: roomDocument,
      thumbnail: png,
    })
  })

  it('removes the picture when it is set to null', async () => {
    const plan = await create('Flat', { thumbnail: png })
    const response = await send('PATCH', `/${plan.id}`, { thumbnail: null })
    expect(((await response.json()) as PlanRecord).thumbnail).toBeNull()
  })

  it('refuses a drawing that is not a valid plan, and keeps the saved one', async () => {
    const plan = await create('Flat', { document: roomDocument })
    const broken = { ...roomDocument, walls: [{ ...roomDocument.walls[0], end: 'missing' }] }
    const response = await send('PATCH', `/${plan.id}`, { document: broken })
    expect(response.status).toBe(400)
    const stored = (await (await send('GET', `/${plan.id}`)).json()) as PlanRecord
    expect(stored.document).toEqual(roomDocument)
  })
})

describe('deleting plans', () => {
  it('deletes a plan, after which it is gone from the list and cannot be read', async () => {
    const plan = await create('Flat')
    const kept = await create('Kept')
    expect((await send('DELETE', `/${plan.id}`)).status).toBe(204)
    expect((await list()).map((other) => other.id)).toEqual([kept.id])
    expect((await send('GET', `/${plan.id}`)).status).toBe(404)
    expect((await send('DELETE', `/${plan.id}`)).status).toBe(404)
  })
})

describe('plans that do not exist', () => {
  it.each([
    ['GET', undefined],
    ['PATCH', { name: 'Home' }],
    ['DELETE', undefined],
  ])('%s answers 404 with a message', async (method, body) => {
    const response = await send(method, `/${unknownId}`, body)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Plan not found' })
  })

  it('answers 400 for an id that is not one', async () => {
    expect((await send('GET', '/not-an-id')).status).toBe(400)
  })
})
