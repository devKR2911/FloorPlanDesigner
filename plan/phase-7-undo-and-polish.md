# Phase 7: undo and redo, polish, wider tests

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All ten steps are done, in all three parts. About 2,550 lines were added, about 1,800 of them tests and test helpers, including 670 in the new `e2e/` folder; the estimate was 2,600 to 3,200 with about half tests. Parts A and B came out smaller than estimated, at about 750 lines of code between them.

### What was added from outside

Six development dependencies, as planned: `@electric-sql/pglite` in the backend; `jsdom` and three Testing Library packages in the web app; and `@playwright/test` in a new workspace package, `e2e`. Playwright drives the installed Chrome, so no browser was downloaded. pnpm again reported agent skills from `@tanstack/react-router` awaiting approval; they were not approved.

### What was checked

- `pnpm typecheck`, `pnpm test` (428 tests: 312 in the engine, 82 in the web app, 21 in the backend, 13 in the shared package), `pnpm lint`, `pnpm format:check` and `pnpm build` pass.
- `pnpm e2e` passes: 13 tests in about 40 seconds. It created its own database, `floorplandesigner_e2e`, and the working database had the same three plans before and after.
- **Undo, by unit tests:** one step per drag however many moves it took; inspector edits joined, and not joined across time, across things or across an undo; redo; a new change clearing redo; the 100-step limit; load clearing the history and restore not; ids kept; every kind of change undone exactly; and in the 2D interaction, one step per wall drawn, a corner drag with its merge as one step, and the chain ended by an undo.
- **In the browser, by the new suite:** a room drawn by mouse undone step by step with the button and redone with the keys; the keys left alone in a text field; a change saved by itself; a reload finding it; undoing back to the saved state showing "Saved"; leaving saving first; a failed save reported, with the leave prompt and its Stay; furniture added to free spots, snapped to a wall, turned and deleted; a model loaded once and dragged in 3D; a door refused without a wall, slid to the exact end of its wall, flipped and resized; walking out through a door and being stopped by a wall; and the plan list from empty to created, renamed, duplicated and deleted.
- **By eye:** 2D corners close without a notch. In orbit mode, walls and furniture cast shadows on the floor and on the ground outside. Shadows were not looked at in walk mode.
- **The build:** the plan list loads a 579 kB file (184 kB gzipped) and the editor's 771 kB is fetched when a plan is opened; before, one 1.34 MB file was fetched for everything. The `/draco/` copy is gone, leaving the set of decoder files Three.js brings.
- **Draco:** Three.js's decoder was loaded from its default place in the running app, the way a compressed model would load it. No compressed model was available, so decoding one was not tried.

### Where the result differs from the plan

- **Closing the tab still asks whenever something is unsaved.** The plan said the prompt would remain only for a failed save. That holds inside the app, where leaving waits for the save. Closing the tab cannot wait, so the browser's prompt shows in the two seconds before a change is saved, as well as after a failure.
- **Shadows have plain edges, not soft ones.** Three.js 0.187 has removed the soft shadow type the plan had in mind.
- **A drawn room takes five undos, not four.** The first click of a chain places a corner with no wall yet, and that is a step.
- **The header's New plan button shows only once there are plans,** so it is also absent while the list is loading or has failed to load.
- **A change now says which wall, item or opening was edited,** in a new `target` field on the model's change event. Undo needs it to join a run of edits to one thing.
- **The browser suite is its own workspace package,** `e2e`, with Playwright as its dependency, not a dependency of the root.
- **The engine always has a Draco loader ready.** Before, it had one only when given a `dracoPath`.
- **The unsaved-changes class from Phase 6 is removed.** The history's position replaces it.
- **Not carried into the browser suite:** sliding a door in 3D, the name filter and splitting a wall. The first was checked by script in Phase 5; the other two are covered by component and unit tests.

### Known rough edges

- Undo history does not survive a reload, as planned.
- A slow drag with a pause of more than two seconds is saved in the middle of the drag.
- The plan list's own file is still 579 kB. It holds React, the router, the dialogs and the icons.
- `pnpm e2e` needs the local Postgres running and ports 3100 and 5273 free.

### Open questions, as decided

All six defaults were implemented as written: autosave replacing the Save button, the three parts done in one go, PGlite for backend tests, Playwright with the installed Chrome, the six polish items, and 100 undo steps cleared on load.

## Goal

Three things, in this order:

1. **Undo and redo** for every change to a plan, and with them **autosave**, which earlier phases held back until mistakes could be undone.
2. **Polish:** a short, fixed list of rough edges from Phases 3 to 6.
3. **Tests that live in the repository** for the backend routes, the web app's screens, and the whole app in a browser. Until now the browser checks were scripts written for each phase and thrown away.

This is the broadest phase so far. It is planned as three parts that can be approved together or one at a time.

## Part A: undo, redo and autosave

### How undo works

Undo keeps copies of the plan, not a log of commands. Phase 1 noted that `floorplan.export()` gives a cheap copy for this; a plan is a few kilobytes of plain data, and restoring a copy cannot get out of step the way replaying commands can.

A new `History` class in the engine, exposed as `engine.history`:

```ts
engine.history.undo()
engine.history.redo()
engine.history.canUndo // and canRedo
engine.history.on('change', ...) // after every undo, redo and recorded step
engine.history.position          // an id for the state the plan is in now
```

- **One step per action.** A drag fires a change on every pointer move, but it must undo as one step. The 2D interaction and the 3D view mark the start and end of each gesture (`history.begin()` on pointer down, `history.end()` on release), and everything between is one step. A change outside a gesture is its own step.
- **Typing in an inspector** changes the model on every keystroke. Changes to the same wall, opening or item within one second of each other join into one step.
- **Restoring** uses a new `floorplan.restore(plan)`, which reports the change as `restore`, not `load`. The views redraw but do not re-frame the plan, and the selection survives if what was selected still exists.
- **Limits.** The last 100 steps are kept. Loading a plan clears the history. The camera, the view and the selection are not part of undo.
- **Drawing walls:** undo while a chain of walls is being drawn removes the last wall and ends the chain.

### In the web app

- **Keys:** `Ctrl+Z` undoes; `Ctrl+Shift+Z` and `Ctrl+Y` redo; `Cmd` on a Mac. They are ignored while the caret is in a text field, where the browser's own undo applies.
- **Toolbar:** Undo and Redo buttons, greyed out when there is nothing to undo or redo.
- **Unsaved changes** follow `history.position`: the plan is unsaved when its position differs from the one that was last saved. Undoing back to the saved state makes it clean again, which the counter from Phase 6 cannot do.

### Autosave

- A change is saved two seconds after the last one, and at once when the tab is hidden or the editor is left.
- The status reads "Saving…" then "Saved". The Save button goes; `Ctrl+S` saves immediately.
- Leaving the editor no longer asks, since leaving saves. The prompt remains for one case: the last save failed, and leaving would lose changes.
- A failed save is retried on the next change, and the status says what went wrong.

## Part B: polish

A fixed list. Anything not on it is in "Not in this phase".

1. **2D walls join cleanly.** The 2D editor draws each wall as a plain band, which leaves a notch at the outside of every corner. It switches to the joined outlines the 3D view has used since Phase 3.
2. **New furniture lands in a free spot.** An item added from the panel goes to the nearest place to the view's centre where it overlaps nothing, not on top of what is already there.
3. **Shadows in the 3D view.** The sun casts soft shadows from walls and furniture onto the floor. The shadow area follows the size of the plan. Phase 3 left this for now.
4. **One "New plan" button on an empty list,** in the welcome, not also in the header.
5. **The plan list loads without the 3D code.** The editor, the engine and Three.js move to a part of the bundle that is fetched when a plan is opened. Today one 1.34 MB file is fetched even to show the list.
6. **One copy of the Draco decoder.** The web build has two: the one Three.js bundles by default and the one copied into `/draco/` since Phase 0. The copy script and the `dracoPath` setting in the web app are removed, and Three.js's own copy is used. The engine keeps its `dracoPath` option for other apps. This is confirmed to work before the script is removed; if it does not, the bundled copy is dropped instead.

## Part C: tests in the repository

### Backend routes

Today's backend tests only check that bad requests are refused. The routes themselves have never been tested: list order, create, read, rename, save, delete, and the 404s.

They are tested against **PGlite**, a real Postgres that runs inside the test process. The project's own migrations are applied to it, so the tests also prove the migrations work from scratch. No Docker and no local database are needed, and `pnpm test` stays self-contained.

- One new development dependency: `@electric-sql/pglite`.
- The `Database` type widens from "Postgres over the `pg` driver" to "any Postgres Drizzle can talk to", so the same routes run on both.

### Web app screens

Component tests with **Vitest, jsdom and Testing Library**, with the backend replaced by a fake `fetch`:

- the plan list: loading, empty, error with retry, the cards, the filter, and the create, rename and delete dialogs;
- the editor header: renaming, cancelling a rename, and each save status;
- the opening inspector: a refused value turns red and resets.

The editor's canvases need WebGL, so the editor itself is covered by the browser tests below, not here.

- Four new development dependencies: `jsdom`, `@testing-library/react`, `@testing-library/user-event` and `@testing-library/jest-dom`.

### The whole app in a browser

An end-to-end suite with **Playwright**, in a new `e2e/` folder, run by `pnpm e2e`. It is not part of `pnpm test`, because it needs a browser and takes about a minute.

- It drives the installed Chrome, so no browser is downloaded.
- **It never touches your plans.** It starts its own backend against a separate database, `floorplandesigner_e2e`, on the same local Postgres, created and migrated when the suite starts. The first version of a Phase 6 check would have deleted every plan in the working database; this removes that risk for good.
- It replaces the per-phase scripts with the same checks, kept: draw a room; walls, doors and furniture in 2D and 3D; walk mode; the plan list; saving and reloading; undo and redo; autosave.
- One new development dependency: `@playwright/test`.

## Steps

**Part A**

1. `History` in the engine, `floorplan.restore()`, gesture marks in the 2D interaction and the 3D view; tests.
2. Web app: the keys, the toolbar buttons, unsaved changes from `history.position`.
3. Autosave, the changed status and leave prompt.

**Part B**

4. 2D walls from the joined outlines; a free spot for new furniture; tests for both.
5. Shadows in the 3D view.
6. The single New plan button; the split bundle; the single Draco decoder.

**Part C**

7. Backend route tests on PGlite.
8. Web app component tests.
9. The Playwright suite and its own database.
10. A full run of everything, then this file and the project plan are updated with the result.

Estimated size: 2,600 to 3,200 lines, about half of them tests: roughly 800 for Part A, 500 for Part B and 1,500 for Part C. One go-ahead covers all ten steps and the six development dependencies, or each part can be approved on its own.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass; the `./model` and `./schema` entries still do not load Three.js.
- `pnpm e2e` passes, and the working database has the same plans before and after it.
- Unit tests for undo cover: one step per drag, joined inspector edits, redo, a new change clearing redo, the 100-step limit, load clearing the history, restore keeping the selection, and every kind of change (walls, corners, openings, items) undoing exactly.
- In the browser, through the new suite: draw a room, add a door and a sofa, undo each in turn back to an empty plan, redo them all; undo to the saved state and see "Saved"; change something, wait, reload, and find it saved; make the backend fail and see the status and the leave prompt.
- The build output shows the list's first load without Three.js, and one set of Draco files.
- Shadows are judged by eye from screenshots, in orbit and walk mode.

## Not in this phase

- Textures, wall paint and floor materials.
- Furniture that knows about doors, furniture that blocks the walker, and a hint when a room has no door.
- Showing doors and windows on walls that are lowered in orbit mode.
- Arrow keys to nudge the selection, multi-selection, and copy and paste.
- Touch gestures: pinch to zoom, and walking on a touch screen.
- Wall-mounted and ceiling items, deferred from Phase 5.
- Detecting that a plan was changed in another tab.
- Running the tests on every push (continuous integration). The scripts will be ready for it.

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Autosave replaces the Save button.** The alternative is to keep saving manual and add undo only. Autosave is what earlier phases were waiting for, but it does change how the editor feels.
2. **The phase is done in one go,** all three parts. It can instead be three go-aheads, A then B then C, with a commit after each.
3. **PGlite for backend tests.** The alternative is the Docker Postgres, which would make `pnpm test` need the database running.
4. **Playwright for the browser suite,** using the installed Chrome. The alternative is to keep the hand-written scripts and move them into the repository, with no new dependency but more code to maintain.
5. **The polish list is the six items above.** Say if one of the items under "Not in this phase" matters more to you than one of these.
6. **Undo keeps 100 steps** and is cleared when a plan is loaded. It does not survive a page reload.
