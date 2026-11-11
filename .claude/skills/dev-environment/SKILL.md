---
name: dev-environment
description: How to run FloorPlanDesigner on this machine. Use before running any pnpm, node, docker or dev-server command, when a command fails with "command not found", a wrong Node version, a port in use, or a Postgres connection error, and when starting or restarting the dev server.
---

# Dev environment

The repository's scripts are in `CLAUDE.md`. This skill is the machine-specific part: how to get the right tools on the PATH and the services running.

## Node and pnpm

- The project needs Node 26.13.0 (`.nvmrc`). The shell's default is Node 22 through nvm, left that way on purpose for other projects.
- Interactive shell: `nvm use` in the repository root.
- Non-interactive commands (every Bash tool call): prefix with
  `export PATH="$HOME/.nvm/versions/node/v26.13.0/bin:$PATH"`.
- pnpm 12.x is installed with npm into that Node directory, not through Corepack (Node 26 has none), so it exists only on that PATH.
- `~/.npmrc` contains `prefix=‘~/.npm-global` with a curly quote. A global `npm install -g` without `--prefix` creates a folder called `‘~` in the current directory. Pass `--prefix "$HOME/.nvm/versions/node/v26.13.0"` for global installs, and do not edit the file.

## pnpm policies

- Dependency install scripts are blocked unless listed under `allowBuilds` in `pnpm-workspace.yaml` (`pnpm approve-builds <name>` adds one). `esbuild` is already allowed.
- Packages published within about a day are rejected (`minimumReleaseAge`). Prefer the previous release over adding an exclusion. If the lockfile is rejected after a version change, run `pnpm clean --lockfile` then `pnpm install`.

## Postgres

- Runs in Docker: `pnpm db:up` starts it and waits until healthy; `pnpm db:down` stops it. Docker Desktop must be running first (`docker info` fails otherwise; ask the user to start it).
- Host port **5434**. Port 5432 is a system Postgres 17 (runs as the `postgres` user, invisible to `lsof` without sudo: test ports with `nc -z -G 1 127.0.0.1 <port>`), and 5433 is another project's container. Do not stop either.
- After pulling schema changes: `pnpm --filter @floorplandesigner/api db:migrate`.
- Inspect data: `docker compose exec -T postgres psql -U floorplan -d floorplandesigner -c '<sql>'`.

## Dev server

1. Check nothing holds 3000 or 5173: `nc -z -G 1 127.0.0.1 3000`.
2. Start in the background: `pnpm dev` with `run_in_background`. It builds the packages first, then runs four watchers (`engine`, `shared`, `api`, `web`).
3. Wait for readiness by polling `http://localhost:5173/api/health` until it answers `{"status":"ok","database":"up"}` (up to about 30 s).
4. Edits to the engine or shared packages rebuild `dist/` automatically; the backend restarts itself; the web app hot-reloads.
5. To stop: `pkill -f "concurrently -k -n engine,shared,api,web"`, then kill any leftover `pgrep -fl FloorPlanDesigner` node processes, and confirm the ports are free.

After `git pull`: run `pnpm install`, apply migrations, and restart the dev server so the watchers pick up new packages.

## Full check before calling work done

```sh
pnpm typecheck && pnpm test && pnpm lint && pnpm format:check && pnpm build
```

Then the browser check for UI changes (`browser-check` skill) and `pnpm e2e` when editor flows changed. The e2e suite starts its own servers on its own ports; the dev server may stay running.
