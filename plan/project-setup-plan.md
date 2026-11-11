# 3D Floor Plan Manager: project plan

Last updated: 2026-11-11.

## Phases

Each phase has its own file. A phase starts only after its own go-ahead.

| Phase | Title                                                            | Status      |
| ----- | ---------------------------------------------------------------- | ----------- |
| 0     | [Project setup](phase-0-project-setup.md)                        | Done        |
| 1     | [Engine data model](phase-1-engine-data-model.md)                | Done        |
| 2     | [2D plan editor](phase-2-2d-editor.md)                           | Not started |
| 3     | [3D view](phase-3-3d-view.md)                                    | Not started |
| 4     | [Catalogue and furniture](phase-4-catalogue-and-furniture.md)    | Not started |
| 5     | [Doors and windows](phase-5-doors-and-windows.md)                | Not started |
| 6     | [Plan list, save and load screens](phase-6-plan-screens.md)      | Not started |
| 7     | [Undo and redo, polish, wider tests](phase-7-undo-and-polish.md) | Not started |
| 8     | [Login](phase-8-login.md)                                        | Not started |

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

1. **Publishing.** Whether the engine is published publicly or kept private. Not needed until we publish.

Answered on 2026-11-10:

- **Package names:** the `@floorplandesigner` scope, giving `@floorplandesigner/engine`, `@floorplandesigner/shared`, `@floorplandesigner/web` and `@floorplandesigner/api`.
- **Node version:** 26.13.0 (the current LTS), installed through nvm and pinned with an `.nvmrc` file. The nvm default stays on 22.19.0 so other projects are unaffected.
- **Postgres:** runs through Docker Compose, not the Homebrew Postgres that is also installed.
- **Sibling folders:** `blueprint3d`, `reference/blueprint3d` and `3d-floorplan-manager` stay where they are. Nothing from them is moved or copied into this repository.

## Running the project

The shell defaults to Node 22, so switch first:

```sh
nvm use            # reads .nvmrc and selects Node 26.13.0
pnpm db:up         # starts Postgres in Docker and waits until it is healthy
pnpm --filter @floorplandesigner/api db:migrate
pnpm dev           # web on http://localhost:5173, backend on http://localhost:3000
```

Other scripts: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm format`, `pnpm db:down`.

The repository is on GitHub at `devKR2911/FloorPlanDesigner`.

## Known issue outside this project

`~/.npmrc` has a mistyped line, `prefix=‘~/.npm-global` (a curly quote). It makes global npm installs create a folder named `‘~` in the current directory; one already exists in `../blueprint3d`. It was left untouched.
