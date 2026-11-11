---
name: browser-check
description: Verify a change to the web app or the engine in headless Chrome against the running dev server. Use after any change that affects what the editor shows or does (2D drawing, 3D view, toolbar, saving), before reporting the change as done, and when a bug report describes something seen on screen.
---

# Browser check

Quick, ad-hoc verification in a real browser, separate from the committed Playwright suite in `e2e/`. Use the e2e suite for regressions; use this to see a change working and to read what the engine holds.

## Setup

- The dev server must be running (`dev-environment` skill); the app is at `http://localhost:5173`.
- Use `playwright-core` with the installed Google Chrome: `chromium.launch({ channel: 'chrome', headless: true })`. Install it in a folder inside the session scratchpad (`npm install playwright-core`), never in the repository.
- Scripts go in the scratchpad too; write screenshots and images there and view them with the Read tool.

## Getting into the editor

- `/` is the plan list; the editor is `/plans/<id>`. Get an id from `GET /api/plans` or click the plan's card.
- Wait for `main canvas` before touching anything. The app opens in the 2D view; the 2D/3D toggle and the Move, Draw walls and Delete buttons are `radio` roles with those accessible names (`page.getByRole('radio', { name: 'Draw walls' })`).
- In development the engine is exposed as `window.__floorplanEngine` (not in production builds). From `page.evaluate` you can read `floorplan.corners/walls/rooms/items/openings`, `editor.mode`, `editor.selection`, `editor.hover`, `editor.viewport`, `view3d.cameraMode`, and call `floorplan.updateWall(...)`, `view3d.snapshot(...)` and so on.

## Clicking at plan coordinates

Convert metres to page pixels through the editor's viewport, then use `page.mouse`:

```js
const screenOf = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const e = window.__floorplanEngine
      const r = e.editor.canvas.getBoundingClientRect()
      const s = e.editor.viewport.toScreen({ x, y })
      return { x: r.left + s.x, y: r.top + s.y }
    },
    [x, y],
  )
```

- **Keep points inside the canvas.** The default view shows about 10 m across and 6 m down at 1200 × 800; after a zoom the visible area shrinks. A click that lands in the toolbar silently does nothing. When a click seems ignored, print the screen position and compare it with the canvas rectangle before suspecting the editor.
- Drags: `mouse.move`, `mouse.down`, several `mouse.move` steps, `mouse.up`. Merges and splits happen on release only.
- In draw mode, `Escape` ends the chain but stays in draw mode; switch to Move with the toolbar button before selecting.
- Keyboard goes to the canvas: `page.locator('main canvas').first().press('Escape')`.

## Reading what is drawn

- Sample a canvas pixel to check a colour: `canvas.getContext('2d').getImageData(x * ratio, y * ratio, 1, 1).data` where `ratio = canvas.width / canvas.clientWidth` (the 2D canvas is drawn at the device pixel ratio).
- The 3D canvas is WebGL; read it with `view3d.snapshot({ width, height })` (a JPEG data URL) rather than `getImageData`.
- Collect `page.on('pageerror')` and console errors and print them at the end. A single 404 for the favicon is normal.

## Afterwards

- Delete any plans the check created or saved, by `DELETE /api/plans/<id>` or `psql`, and leave the user's own plans alone (list names first).
- Report what was checked in one list: the action, the value read from the engine, and whether it matched.
