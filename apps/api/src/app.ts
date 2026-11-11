import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { Database } from './db/schema.js'
import { createPlansRoutes } from './routes/plans.js'

export function createApp(db: Database) {
  const app = new Hono()
    .basePath('/api')
    .get('/health', async (c) => {
      try {
        await db.execute(sql`select 1`)
        return c.json({ status: 'ok' as const, database: 'up' as const }, 200)
      } catch {
        return c.json({ status: 'degraded' as const, database: 'down' as const }, 503)
      }
    })
    .route('/plans', createPlansRoutes(db))

  app.notFound((c) => c.json({ error: 'Not found' }, 404))

  app.onError((error, c) => {
    // Hono raises these itself, for example for a body that is not valid JSON.
    if (error instanceof HTTPException) {
      return c.json({ error: error.message || 'Request failed' }, error.status)
    }
    console.error(error)
    return c.json({ error: 'Internal server error' }, 500)
  })

  return app
}

/** The route types, used by the web app to build a typed client. */
export type AppType = ReturnType<typeof createApp>
