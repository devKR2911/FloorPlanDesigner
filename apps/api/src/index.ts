import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { db, pool } from './db/client.js'
import { env } from './env.js'

const app = createApp(db)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`)
})

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0))
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
