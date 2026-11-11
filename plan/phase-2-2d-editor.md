# Phase 2: 2D plan editor

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All six steps are done. About 1,900 lines were added across the engine's `editor/` folder and the web app, 430 of them tests, plus the two model additions with their tests; the estimate was 1,500 to 2,000.

### What was checked

- `pnpm typecheck`, `pnpm test` (141 tests, 128 in the engine), `pnpm lint`, `pnpm format:check` and `pnpm build` pass. The `./model` and `./schema` entries still do not load Three.js.
- The interaction tests cover every row of the mode table: drawing a room and closing it, snapping and `Alt`, the rubber band, ending a chain by `Escape`, double click or re-clicking the last corner, joining onto an existing corner, splitting an existing wall, selecting, dragging a corner with merge on release only, dragging a wall on the grid, panning in every mode and with the middle button, deleting by key and by mode, wheel zoom, and a cancelled drag.
- In headless Chrome: switching to 2D and Draw, clicking four points and the first again gives one room of 6 m² with its area label; dragging a corner reshapes it; the inspector changes a wall's thickness; dragging a corner onto another merges into a triangle; Delete mode removes a wall and the room disappears; the wheel zooms around the cursor; dragging empty space pans; `Delete` in the plan-name field removes nothing; the saved plan comes back after a reload; and the 3D view still shows the grid.

### Where the result differs from the plan

- **The app opens in the 2D view**, since that is where editing happens now. The 3D toggle is next to it.
- **Clicking the chain's last corner again also ends the chain.** This is what a double click produces naturally (the second click lands on the corner just placed), so it is the rule rather than a special case.
- **`PlanEditor` has a `setMode()` method** as well as the `mode` setter, because the React lint rules refuse an assignment to a property of a value held in state.
- **The web app wraps the tree in shadcn's `TooltipProvider`**, which the Tooltip component requires.
- **A development-only hook** `window.__floorplanEngine` exposes the engine in `pnpm dev` for browser checks. It is not set in production builds.
- **Dimension labels sit on the side without a room**, so a room's labels read around its outside; a wall with a room on both sides is labelled on its back.
- **The 2D editor starts with a default view** of about 10 m across rather than fitting an empty plan, and `fit()` runs once after a plan is loaded.

### Open questions, as decided

One view at a time with a toggle; grid 0.1 m with 1 m major lines and 8 px snap tolerance; drawing ends on the start corner, `Escape` or double click; walls drawn as bands at their real thickness.

## Goal

Walls can be drawn, moved and deleted on a 2D canvas, with snapping and dimensions. The editor lives in the engine library, drives the `Floorplan` model from Phase 1, and the web app shows it next to the 3D view with a small toolbar. This is the first phase where the plan changes on screen.

The 3D view still shows only the grid; walls in 3D are Phase 3.

## What the reference project does

`blueprint3d`'s floorplanner is two files of about 600 lines: a controller that handles mouse events with three modes (move, draw, delete) and a view that redraws the whole canvas on every change. Its ideas are sound and are kept: mode-based input, a rubber-band wall while drawing, snapping to the axes of the previous corner, and redrawing everything each frame. What changes: our version uses pointer events (mouse, pen and touch alike), keeps the input logic separate from the drawing so it can be unit-tested without a canvas, and supports pan and zoom, which the reference lacks.

## Design

### Where it lives

```
packages/floorplan-engine/src/
 ├─ model/                 Phase 1, with two small additions (below)
 ├─ editor/                new
 │   ├─ viewport.ts        world ↔ screen transform: pan, zoom, fit
 │   ├─ snapping.ts        pure snapping functions
 │   ├─ hit-testing.ts     pure: which corner or wall is under a point
 │   ├─ interaction.ts     the input state machine, no DOM
 │   ├─ renderer.ts        draws the plan with Canvas 2D
 │   ├─ plan-editor.ts     PlanEditor: binds a canvas element to the above
 │   └─ index.ts
 └─ engine.ts              creates the editor when a view2d element is given
```

The editor has no Three.js. `interaction.ts`, `snapping.ts`, `hit-testing.ts` and `viewport.ts` have no DOM either, which is what makes them testable in Node.

### Units and coordinates

- The model's metres are the world coordinates, `x` to the right and `y` up the page, as in the model and its tests. The canvas is flipped so that world `y` increases upwards; the editor hides this behind the viewport.
- Screen tolerances are in CSS pixels and converted to metres by the current zoom, so hitting a corner feels the same at every zoom level.
- Lengths are shown in metres with two decimals (`3.20 m`). Other units are a later addition; the formatter is one function.

### Model additions

Two operations the editor needs that Phase 1 did not have:

- **`moveCorner(id, x, y, { resolve: false })`** moves a corner without merging or splitting, and **`resolveCorner(id)`** applies the merge or split afterwards. A drag updates the position on every pointer move and resolves once on release, so a corner dragged across another corner does not merge with it on the way past.
- **`moveCorners(ids, dx, dy)`** moves several corners together by an offset and resolves each at the end. Dragging a wall moves both its corners as one operation and fires one change event.

Both are added with tests, and the Phase 1 operations keep their behaviour.

### `viewport.ts`

A plain class holding the pan offset and the scale in pixels per metre.

- `toScreen(point)`, `toWorld(point)`, `metresPerPixel`.
- `zoomAt(screenPoint, factor)` keeps the point under the cursor still, clamped between 10 and 400 pixels per metre.
- `panBy(dx, dy)` in pixels.
- `fit(boundingBox, padding)` and a default view of about 10 m across, centred on the origin, for an empty plan.
- Takes the canvas size and the device pixel ratio, so drawing stays sharp on high-density screens.

### `snapping.ts`

Pure functions that take a world point, the model and the tolerance in metres, and return the snapped point plus what it snapped to, so the renderer can show it:

1. **Corner snap:** within tolerance of an existing corner, use that corner. Releasing there merges (the model does this).
2. **Wall snap:** within tolerance of a wall, use the closest point on it. Releasing there splits the wall.
3. **Axis snap:** while drawing from a previous corner, within tolerance of horizontal or vertical from it, align with it. Also align with the `x` or `y` of any other corner, like the reference's `snapToAxis`.
4. **Grid snap:** otherwise, round to the grid step.

They apply in that order; the first that matches wins. Each has tests, and each is switchable (holding `Alt` disables snapping while it is held).

### `hit-testing.ts`

`hitTest(worldPoint, floorplan, tolerance)` returns the nearest corner within tolerance, else the nearest wall within tolerance plus half its thickness, else nothing. Corners win over walls so a shared end stays grabbable.

### `interaction.ts`: the state machine

Takes pointer events already converted to world coordinates and calls the model. It owns:

- **Mode:** `move` (default), `draw`, `delete`.
- **Selection:** one corner or one wall, or nothing.
- **Hover:** what is under the pointer, for highlighting.
- **Drawing state:** the last placed corner, if a chain is in progress.

Behaviour per mode:

| Mode   | Pointer down and drag                                                                                   | Click                                                                                                                                                           | Other                                               |
| ------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| move   | On a corner: drag it (snapping, resolve on release). On a wall: drag both corners. On empty space: pan. | Select what was hit, or clear.                                                                                                                                  | `Delete` removes the selection.                     |
| draw   | Pan on empty space.                                                                                     | Place a corner at the snapped point and join it to the previous one; the chain continues. Clicking the chain's start corner closes the room and ends the chain. | `Escape` ends the chain. Double click also ends it. |
| delete | Pan.                                                                                                    | Remove the corner or wall under the pointer.                                                                                                                    |                                                     |

Common to all modes: wheel zooms around the cursor, `Escape` returns to `move`, and switching mode ends any chain and clears the selection. The rubber-band wall from the last corner to the pointer shows its length while drawing.

Events the editor emits: `mode`, `selection`, `hover` and `viewport`. Model changes still arrive through `floorplan.on('change')`.

### `renderer.ts`

Redraws the whole canvas on each change, pointer move or viewport change, scheduled with `requestAnimationFrame` so several changes in one frame draw once. In drawing order:

1. Grid: lines every metre, with a fainter line every 0.1 m above 60 pixels per metre, and a marked origin.
2. Rooms: a light fill of each room's interior polygon, with its area at the centroid (`16.0 m²`).
3. Walls: each as a filled band at its real thickness, with a minimum of 2 pixels so thin walls stay visible when zoomed out. Hovered and selected walls use accent colours.
4. Dimensions: the length of each wall along its outside, kept upright. The rubber-band wall gets one too.
5. Corners: filled circles with a stroke, larger when hovered or selected.
6. Snap indicator: a small mark showing what the pointer snapped to.

Colours come from a small theme object with defaults, so the app can pass its own.

### `plan-editor.ts`

`PlanEditor` owns a `<canvas>` added to the host element, follows its size with a `ResizeObserver`, listens to pointer, wheel and keyboard events, and connects the viewport, interaction and renderer. Public surface:

```ts
editor.mode = 'draw'            // or 'move' | 'delete'
editor.selection                // { kind: 'corner' | 'wall', id } | null
editor.fit()                    // frame the whole plan
editor.snapping = { grid: 0.1 } // tolerances and the grid step
editor.on('selection', ...)
editor.dispose()
```

Keyboard events are listened to on the canvas, which gets `tabindex="0"` so it can take focus, not on `document`, so typing in an app form field never deletes a wall.

### Engine changes

`FloorplanEngineOptions` gains `view2d?: HTMLElement`. When given, the engine creates a `PlanEditor` on it, exposed as `engine.editor`, and disposes it with the rest. The 2D editor and the 3D view share the one `Floorplan`, so an edit shows in both.

Hosts of zero size (a hidden tab) are skipped on resize, as the 3D view already does, so the app can keep both views mounted and show one at a time.

### Web app changes

- `EngineCanvas` takes a `view` prop (`'2d' | '3d'`) and hosts both elements, showing one. Both stay mounted so switching is instant and nothing is reloaded.
- A toolbar in the header: a 2D / 3D toggle, and in 2D the mode buttons Move, Draw walls and Delete (lucide icons), plus Fit. The active mode is React state fed to `engine.editor.mode`, and `editor.on('mode')` keeps it in sync when `Escape` changes it.
- A small inspector for a selected wall: thickness and height inputs calling `floorplan.updateWall`.
- Three shadcn components added: `ToggleGroup` (modes and the view toggle), `Tooltip`, `Input`.
- Save works as before; the document now has walls in it.

## Steps

1. Model additions: `moveCorner` with `resolve: false`, `resolveCorner`, `moveCorners`; tests.
2. `viewport.ts`, `snapping.ts`, `hit-testing.ts`; tests.
3. `interaction.ts` with tests that drive it with synthetic pointer events against a real `Floorplan`: draw a room by clicks, close it, drag a corner onto another and see the merge, drag a wall, delete, `Escape`.
4. `renderer.ts` and `plan-editor.ts`; the engine's `view2d` option.
5. Web app: both views in `EngineCanvas`, the toolbar, the wall inspector, the three shadcn components.
6. Browser check and update this file with the result.

Estimated size: 1,500 to 2,000 lines including tests. One go-ahead covers all six steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass; the `./model` and `./schema` entries still do not load Three.js.
- Interaction tests cover every row of the mode table above.
- In headless Chrome: switch to 2D, choose Draw, click four points and the first again, and `engine.floorplan.rooms` has one room shown with its area; drag a corner and the dimensions update; drag a corner onto another and the room becomes a triangle; delete a wall and the room disappears; the wheel zooms around the cursor and dragging empty space pans.
- Save the drawn plan, reload the page, and the same walls are drawn.
- Keyboard: `Delete` in a form field does not remove a wall.

## Not in this phase

- Walls, floors and rooms in 3D (Phase 3).
- Items in 2D: furniture is Phase 4.
- Curved walls, wall thickness drawn per side, room names, imperial units, printing.
- Multi-selection and rubber-band selection; undo and redo (Phase 7). Every edit is already one model operation, which is what undo will snapshot.
- Touch gestures beyond single pointer: pinch zoom is a later addition.

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **2D and 3D as a toggle, not side by side.** One view at a time, switched in the header. Side by side is easy to add later since both stay mounted.
2. **Grid step 0.1 m**, with 1 m major lines. Snap tolerance 8 pixels for corners and walls, 6 pixels for axis alignment.
3. **Drawing ends by clicking the start corner, `Escape` or double click.** The chain does not end on its own after one wall.
4. **Walls are drawn as bands at their real thickness** rather than single lines, so thick and thin walls look different. Reference draws fixed-width lines.
