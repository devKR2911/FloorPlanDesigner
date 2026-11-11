# 3D Floor Plan Manager: project setup plan

Status: Phase 0 is implemented and checked (2026-11-10). Later phases have not been started and each needs its own go-ahead.

Last updated: 2026-11-10.

## Working preferences

- **No implementation without confirmation.** Planning, reading and checking tools are fine. Creating project files, installing packages and `git init` wait for an explicit go-ahead.
- **One phase per approval.** A go-ahead covers the named phase only. Each later phase needs its own.
- **No git commits unless asked.**

## Decisions and context

These were agreed in the planning discussion on 2026-11-10. Treat them as settled unless reopened.

### Why this project exists

- We evaluated `github.com/charmlinn/blueprint3d-modern` and chose to build our own floor-plan engine on top of Three.js instead of depending on it.
- That repository is a reference for the hard geometry only (room detection, wall joins at corners). It is not a dependency, and no code is copied wholesale.
- Its feature set is the yardstick for scope: roughly 10,000 to 12,000 lines of TypeScript to reach parity.

### Models

- **Do not use the reference project's models.** Its 74 GLB files are hosted on `cdn-images.archybase.com`, not in the repository, and their licence is not stated.
- **Start with CC0 models**, Kenney Furniture Kit first, stored in this project.
- **Replace them over time** with models we make or buy. The catalogue is a manifest file, so swapping a model is a one-line change.
- Model files and thumbnails start as static files served by the web app. They can move to object storage later without changing the catalogue format.

### Tech stack

| Part            | Choice                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Engine library  | TypeScript (strict), Three.js, Canvas 2D for the plan editor, GLB models with the Draco decoder hosted in the project |
| Web app         | Vite, React 19, Tailwind CSS 4, shadcn/ui, lucide-react, TanStack Query                                               |
| Backend         | Node.js and TypeScript with Hono                                                                                      |
| Database        | PostgreSQL, with each plan stored as a `jsonb` document plus normal columns                                           |
| Database access | Drizzle ORM, with migrations                                                                                          |
| Validation      | Zod schemas, shared by the web app and the backend                                                                    |
| Shared package  | API request and response types, Zod schemas, shared logic                                                             |
| Tooling         | pnpm workspaces, Vitest (focused on geometry), ESLint, Prettier, Docker Compose for local Postgres                    |

Choices made by request, replacing earlier suggestions:

- **TanStack Query instead of zustand.** It caches server data. UI state (active tool, 2D or 3D mode, selection) lives in the engine or in React `useState` and context.
- **PostgreSQL instead of IndexedDB** for saving plans.
- **A TypeScript backend with Hono.** NestJS was the alternative and was not chosen.
- **A separate shared package** for types and logic used by both the web app and the backend.
- **Login is deferred** until the frontend features are built. The first database schema has no owner column.

Left out on purpose:

- **Next.js**: the editor runs entirely in the browser.
- **react-three-fiber**: the 3D code stays plain Three.js inside our own engine.
- **Animation libraries**: a small built-in tween for camera moves is enough at first.

### The engine is its own npm library

The 3D code lives in a separate package with no React inside, so it can be published and reused.

| In the engine library                            | In the React app                              |
| ------------------------------------------------ | --------------------------------------------- |
| Floor-plan data model (walls, corners, rooms)    | Screens, toolbars, dialogs                    |
| 3D view (scene, camera, lighting, walls, floors) | Catalogue content and the model files         |
| 2D plan editor on canvas                         | Saving and loading through the backend        |
| Furniture placement, snapping, collisions        | UI state                                      |
| GLB and Draco loading                            | Accounts, sharing, anything business-specific |
| Save format (export and import as JSON)          |                                               |

- **The engine never contains model files** or assumes where they are hosted. The app passes in the URLs.
- **The engine owns the plan save format.** The shared package imports it from the engine, so dependencies run one way and the engine stays publishable on its own.
- **The format is exposed from an entry point that does not load Three.js**, so the backend can validate plans without pulling in 3D code.
- **Three.js is a peer dependency**, so the app and the library share one copy.

Intended usage from the app:

```ts
const engine = new FloorplanEngine({ view3d: el3d, view2d: el2d, dracoPath: '/draco/' })
engine.load(planJson)
engine.addItem({ model: '/models/sofa.glb', placement: 'floor' })
engine.on('change', () => save(engine.export()))
```

## Open questions

1. **Publishing.** Whether the engine is published publicly or kept private. Not needed for Phase 0.

Answered on 2026-11-10:

- **Package names:** the `@floorplandesigner` scope, giving `@floorplandesigner/engine`, `@floorplandesigner/shared`, `@floorplandesigner/web` and `@floorplandesigner/api`.
- **Node version:** 26.13.0 (the current LTS), installed through nvm and pinned with an `.nvmrc` file. The nvm default stays on 22.19.0 so other projects are unaffected.
- **Postgres:** runs through Docker Compose, not the Homebrew Postgres that is also installed.
- **Sibling folders:** `blueprint3d`, `reference/blueprint3d` and `3d-floorplan-manager` stay where they are. Nothing from them is moved or copied into this repository.

## Current state (2026-11-10)

Phase 0 is implemented and checked. Nothing has been committed to git.

### Running the project

The shell defaults to Node 22, so switch first:

```sh
nvm use            # reads .nvmrc and selects Node 26.13.0
pnpm db:up         # starts Postgres in Docker and waits until it is healthy
pnpm --filter @floorplandesigner/api db:migrate
pnpm dev           # web on http://localhost:5173, backend on http://localhost:3000
```

Other scripts: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format`, `pnpm db:down`.

### What was checked

- `pnpm typecheck`, `pnpm test` (26 tests), `pnpm lint`, `pnpm format:check` and `pnpm build` pass.
- The engine's `schema` entry contains no Three.js code, and the main entry imports `three` without bundling it.
- The migration created the `plans` table in Postgres.
- Every route answers as expected through the web dev server's proxy, including a 400 for an invalid plan body.
- In headless Chrome the grid renders and orbits, Save creates one row, a second Save updates that row, and a reload loads the plan back from the backend.

### Where the result differs from the plan

- **Postgres port is 5434, not 5432.** A Postgres 17 installed on this machine already listens on 5432, and another project's container uses 5433.
- **TypeScript is 6.0.x, not 7.** The lint tooling (`typescript-eslint`) does not support 7 yet.
- **pnpm 12.18.0 is installed with npm into the Node 26 directory, not through Corepack.** Node 26 no longer ships Corepack. The version is still pinned in `package.json`.
- **shadcn/ui uses the Nova preset** with the Radix base and neutral colour. The current CLI requires a preset; Nova is its default. It added the Geist font.
- **`lucide-react` is held at 1.70.x.** Version 1.71.0 was published the same day and pnpm's release-age policy rejects it. Loosen the range after a few days.
- **Updates use `PATCH /api/plans/:id`**, since the request may change the name, the document, or both.
- **The backend also depends on the engine's `schema` entry** for the `Plan` type of the `document` column. The web app has a type-only dependency on the backend for the typed client.
- **Engine type definitions are written by `tsc`**, alongside the Vite library build.

### Known issue outside this project

`~/.npmrc` has a mistyped line, `prefix=‘~/.npm-global` (a curly quote). It makes global npm installs create a folder named `‘~` in the current directory; one already exists in `../blueprint3d`. It was left untouched.

## Phase 0: project setup

Approval covers Phase 0 only. The goal is a thin slice that works end to end: the web app shows an empty 3D scene from the engine, and a plan can be saved to and loaded from Postgres. There are no walls, editor or furniture yet.

### Layout

```
FloorPlanDesigner/
 ├─ packages/
 │   ├─ floorplan-engine/   @floorplandesigner/engine   npm library
 │   └─ shared/             @floorplandesigner/shared   API types, Zod schemas
 ├─ apps/
 │   ├─ web/                @floorplandesigner/web      React app
 │   └─ api/                @floorplandesigner/api      Hono backend
 ├─ plan/                   this document
 ├─ docker-compose.yml      local Postgres
 ├─ pnpm-workspace.yaml
 ├─ tsconfig.base.json
 ├─ eslint.config.js, .prettierrc, .gitignore, .env.example
 └─ package.json            scripts: dev, build, test, typecheck, lint
```

Dependencies run one way: `engine ← shared ← web, api`.

### Steps

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

### Assumptions

These were proposed on 2026-11-10 and not objected to.

- **Saving:** one temporary Save button, with the plan id kept in the URL so a reload fetches the plan back. The real plan screens come in a later phase.
- **Ports:** web on 5173, backend on 3000, Postgres on 5434 (changed from 5432, which was taken).
- **pnpm:** version pinned in `package.json` (installed with npm, since Node 26 has no Corepack).
- **git:** `git init` with `main` as the branch, and no commits.
- **shadcn/ui:** default style with the neutral base colour, and only the Button component for now.
- **Routing:** no router library yet; it comes with the plan list screens.

### Not in Phase 0

No wall drawing, no 2D editor, no furniture or model downloads, no login, and no publishing to npm.

## Later phases (each needs its own go-ahead)

1. Engine data model: walls, corners and room detection, with tests.
2. 2D plan editor: draw, move and delete walls, snapping, dimensions.
3. 3D view: walls, floors, corner joins, camera modes.
4. Catalogue and furniture: Kenney CC0 models, manifest, placement and snapping.
5. Doors and windows that cut openings in walls.
6. Plan list, save and load screens in the web app.
7. Undo and redo, polish, wider test coverage.
8. Login, with plans owned by users.

## How Phase 0 was checked

- `pnpm install`, then `pnpm typecheck`, `pnpm test` and `pnpm build` all pass across the workspace.
- The engine's built `schema` entry contains no Three.js code, and the main entry does not bundle `three`.
- `docker compose up -d` and `pnpm --filter @floorplandesigner/api db:migrate` create the `plans` table.
- `pnpm dev` starts the web app and the backend. In the browser, the 3D scene shows a grid that can be orbited.
- Saving a plan from the web app creates a row in Postgres, and after a page reload the plan is loaded back from the backend.
- `curl` against `/api/health` and `/api/plans` returns the expected responses, and an invalid plan body is rejected with a 400.
