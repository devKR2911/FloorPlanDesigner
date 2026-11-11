# Floor Plan Designer

A 3D floor-plan editor: draw walls in 2D, see them in 3D, place furniture, doors and windows, and save plans to Postgres.

## Layout

| Package                     | Name                        | What it is                                                                   |
| --------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| `packages/floorplan-engine` | `@floorplandesigner/engine` | The engine: plan model, 2D editor (Canvas 2D), 3D view (Three.js). No React. |
| `packages/shared`           | `@floorplandesigner/shared` | Zod schemas and types shared by the web app and the backend.                 |
| `apps/api`                  | `@floorplandesigner/api`    | Hono backend, Drizzle ORM, Postgres.                                         |
| `apps/web`                  | `@floorplandesigner/web`    | React 19, Vite, Tailwind 4, shadcn/ui, TanStack Query and Router.            |
| `e2e`                       | `@floorplandesigner/e2e`    | Playwright end-to-end tests. They start their own servers.                   |

Dependencies run one way: `engine ← shared ← web, api`. The engine's `./schema` and `./model` entries must never import Three.js; `build.test.ts` checks this.

## Scripts (run from the root)

- `pnpm dev`: builds the packages, then runs the engine and shared watchers, the backend (port 3000) and the web app (port 5173, which proxies `/api` to the backend).
- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build`: all must pass before work is called done. `pnpm format` fixes formatting.
- `pnpm e2e`: the Playwright suite, on its own ports and database.
- `pnpm db:up` / `pnpm db:down`: local Postgres in Docker, on host port 5434.
- `pnpm --filter @floorplandesigner/api db:generate` and `db:migrate`: Drizzle migrations.

Node version is in `.nvmrc` (26); pnpm version is pinned in `package.json`. Copy `.env.example` to `.env` once. Machine-specific setup is in the `dev-environment` skill.

## Conventions

- **Units:** metres in the plan; world `y` points up the page in the 2D editor and maps to scene `z` in 3D.
- **Database changes:** edit `apps/api/src/db/schema.ts`, run `db:generate`, commit the SQL it writes to `apps/api/drizzle/`, then `db:migrate`.
- **shadcn components:** add with `pnpm dlx shadcn@<pinned version> add <name>` inside `apps/web`. A Tooltip trigger overwrites its child's `data-state`, so toggle styles must also key on `aria-checked`.
- **Catalogue items:** never edit `manifest.json` by hand; see the `add-catalog-item` skill. Only CC0 models; never the reference project's.
- **Checks for UI changes:** unit tests, then a headless Chrome check against `pnpm dev` (the `browser-check` skill), then `pnpm e2e` for anything that touches the editor flows.

## Working rules

- **No implementation without a go-ahead.** Plan, read and check freely; creating or changing project files waits for an explicit yes. Answering design questions is not a go-ahead.
- **One phase per approval.** Work is organised in phases under `plan/`; the `phase` skill describes the workflow.
- **No git commits or pushes unless asked.** When asked, group commits by layer (schema, engine, backend, web app, plan), one subject line each.
- Report outcomes plainly: what passed, what failed with its output, what was skipped.
