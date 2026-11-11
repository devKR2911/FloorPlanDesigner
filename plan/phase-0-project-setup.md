# Phase 0: project setup

Status: done. Implemented and checked on 2026-11-10, committed on 2026-11-11.

Back to the [project plan](project-setup-plan.md).

## Goal

A thin slice that works end to end: the web app shows an empty 3D scene from the engine, and a plan can be saved to and loaded from Postgres. There are no walls, editor or furniture yet.

## Layout

```
FloorPlanDesigner/
 ├─ packages/
 │   ├─ floorplan-engine/   @floorplandesigner/engine   npm library
 │   └─ shared/             @floorplandesigner/shared   API types, Zod schemas
 ├─ apps/
 │   ├─ web/                @floorplandesigner/web      React app
 │   └─ api/                @floorplandesigner/api      Hono backend
 ├─ plan/                   planning documents
 ├─ docker-compose.yml      local Postgres
 ├─ pnpm-workspace.yaml
 ├─ tsconfig.base.json
 ├─ eslint.config.js, .prettierrc, .gitignore, .env.example
 └─ package.json            scripts: dev, build, test, typecheck, lint
```

Dependencies run one way: `engine ← shared ← web, api`.

## Steps

1. **Get tools ready**: Node 26.13.0 through nvm, pnpm, Docker running, git.
2. **Root workspace**: the files above, plus `git init`. No commits unless asked.
3. **`packages/floorplan-engine`**
   - Built with Vite library mode, with two entry points: `.` (the engine) and `./schema` (the plan format, with no Three.js import).
   - `three` is a peer dependency. `zod` is a normal dependency, used by the schema entry.
   - `src/schema/`: `planSchema` and the `Plan` type (format version, corners, walls, items), plus a validation test.
   - `src/core/events.ts`: a small typed event emitter.
   - `src/engine.ts`: the `FloorplanEngine` class with `load()`, `export()`, `on()` and `dispose()`. In Phase 0 it draws only a scene with camera, orbit controls, lights and a ground grid.
4. **`packages/shared`**
   - Built with `tsc`. It imports `planSchema` from `@floorplandesigner/engine/schema`.
   - `src/plans.ts`: schemas for a saved plan record and for create and update requests.
   - `src/catalog.ts`: schema for a catalogue item (key, name, category, model file, thumbnail, size, placement type).
5. **`apps/api`**
   - Hono on Node, Drizzle ORM with `pg`, Zod validation from the shared package, `tsx` for development.
   - `src/db/schema.ts`: one `plans` table (`id` uuid, `name`, `document` jsonb, `created_at`, `updated_at`). There is no owner column yet; login later adds it with one migration.
   - Routes: `GET /api/health`, and list, get, create, update and delete under `/api/plans`.
   - `src/app.ts` exports the app type so the web app gets a typed client.
   - Drizzle migrations, with `db:generate` and `db:migrate` scripts.
6. **`apps/web`**
   - Vite, React 19, Tailwind 4, shadcn/ui, lucide-react, TanStack Query.
   - `src/lib/api-client.ts`: the Hono typed client. The Vite dev server proxies `/api` to the backend, so no CORS setup is needed.
   - `src/features/plans/`: query hooks for listing, loading and saving plans.
   - `src/features/editor/EngineCanvas.tsx`: mounts `FloorplanEngine` and disposes it on unmount.
   - UI state uses React `useState` and context.
   - `src/catalog/manifest.json` (empty for now), `public/models/`, and `public/draco/`, which a script fills by copying the decoder from the installed `three` package.

## Assumptions

These were proposed on 2026-11-10 and not objected to.

- **Saving:** one temporary Save button, with the plan id kept in the URL so a reload fetches the plan back. The real plan screens come in Phase 6.
- **Ports:** web on 5173, backend on 3000, Postgres on 5434 (changed from 5432, which was taken).
- **pnpm:** version pinned in `package.json` (installed with npm, since Node 26 has no Corepack).
- **git:** `git init` with `main` as the branch, and no commits.
- **shadcn/ui:** default style with the neutral base colour, and only the Button component for now.
- **Routing:** no router library yet; it comes with the plan list screens.

## Not in Phase 0

No wall drawing, no 2D editor, no furniture or model downloads, no login, and no publishing to npm.

## How it was checked

- `pnpm install`, then `pnpm typecheck`, `pnpm test` (26 tests), `pnpm lint`, `pnpm format:check` and `pnpm build` all pass across the workspace.
- The engine's built `schema` entry contains no Three.js code, and the main entry imports `three` without bundling it.
- `docker compose up -d` and `pnpm --filter @floorplandesigner/api db:migrate` create the `plans` table.
- `pnpm dev` starts the web app and the backend. In headless Chrome, the 3D scene shows a grid that can be orbited.
- Saving a plan from the web app creates one row in Postgres, a second save updates that row, and after a page reload the plan is loaded back from the backend.
- `curl` against `/api/health` and every `/api/plans` route returns the expected responses, and an invalid plan body is rejected with a 400.

## Where the result differs from the plan

- **Postgres port is 5434, not 5432.** A Postgres 17 installed on this machine already listens on 5432, and another project's container uses 5433.
- **TypeScript is 6.0.x, not 7.** The lint tooling (`typescript-eslint`) does not support 7 yet.
- **pnpm 12.18.0 is installed with npm into the Node 26 directory, not through Corepack.** Node 26 no longer ships Corepack. The version is still pinned in `package.json`.
- **shadcn/ui uses the Nova preset** with the Radix base and neutral colour. The current CLI requires a preset; Nova is its default. It added the Geist font.
- **`lucide-react` is held at 1.70.x.** Version 1.71.0 was published the same day and pnpm's release-age policy rejects it. Loosen the range after a few days.
- **Updates use `PATCH /api/plans/:id`**, since the request may change the name, the document, or both.
- **The backend also depends on the engine's `schema` entry** for the `Plan` type of the `document` column. The web app has a type-only dependency on the backend for the typed client.
- **Engine type definitions are written by `tsc`**, alongside the Vite library build.

## Commits

Six commits on `main`, in this order: the plan, workspace tooling, the engine package, the shared package, the backend, and the web app with the lockfile.
