# Phase 3: 3D view

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All seven steps are done. About 1,900 lines were added across the engine's `view3d/` folder, the model's `wall-footprints.ts` and the web app, 690 of them tests; the estimate was 1,400 to 1,900.

### What was checked

- `pnpm typecheck`, `pnpm test` (182 tests, 169 in the engine), `pnpm lint`, `pnpm format:check` and `pnpm build` pass. The `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover every join case in the design, the wall and floor geometry, the scene following the model and waiting while hidden, the cutaway rule, and walk movement.
- In headless Chrome, driven through the DevTools protocol:
  - a room drawn with the mouse in 2D gives four wall meshes and one floor in 3D, with closed corners in the screenshot;
  - an L-shaped plan with a 0.4 m wall, a 0.1 m inner wall and two T-junctions shows clean joins from above;
  - the 3D scene holds no meshes while the 2D view is shown, and is built once on switching;
  - a wall's thickness and height changed in the inspector show in its 3D mesh;
  - removing a wall removes its mesh and the room's floor;
  - orbiting changes which walls are lowered, and Fit frames the plan;
  - walk mode puts the camera at 1.6 m with a 70° field of view and all walls standing, `W` held for one second moves 1.5 m, dragging turns the view, typing `W` in the plan-name field moves nothing, and `Escape` returns the camera to the exact orbit position with the toolbar back on Orbit;
  - a saved plan comes back after a reload with the same walls and floors;
  - no console errors.
- Two things in the browser check were done by script, not by hand: the L-shaped plan was built through the `Floorplan` API, and the inspector fields were filled by setting their values. The Phase 2 check was not rerun in full; drawing a room, selecting a wall, the inspector, saving and reloading were.

### Where the result differs from the plan

- **The mitre limit is measured along the wall:** a corner is cut flat when the mitre would push a wall more than two thicknesses past its corner, which is an angle under about 28°, not 29°.
- **Two more cases keep square cuts.** Nearly straight walls of different thicknesses, whose edges would cross metres away, and a join that would land beyond the far end of a short wall. The second removes most of the twisted outlines the plan listed as a known limit.
- **Fit frames the walls, not the floor outline.** The first version cut off the tops of the far walls, so the framing now includes the wall height and aims at half that height.
- **A wall straight under the camera is not lowered.** Looking from directly above a wall, the camera is on neither side of it.
- **Looking round in walk mode follows the pointer,** as if the scene were grabbed: dragging right turns left. Walk mode starts facing the way the orbit camera was facing.
- **Fit is disabled in walk mode,** and after a load the fit runs when the 3D view is next shown, since a hidden view has no size to frame for.
- **Camera moves are instant when the system asks for reduced motion.**
- **The scene has a second, weaker light** from the opposite side, so walls facing away from the sun are not all one tone.
- **`PlanScene` owns the wait-while-hidden rule** and emits `rebuild`, which made it testable without WebGL. One more small file, `triangulate.ts`, is shared by the wall and floor builders.
- **`View3D` takes walk settings** (speed, eye height, look speed) as an option, though the engine does not pass them through yet.

### Known rough edges

- With no collision, walking into a wall puts the camera inside it and you see out through its far face.
- In a small room, walk mode can start facing a wall at close range, with no floor in view.

### Open questions, as decided

All six defaults were implemented as written: walls in the way lowered to 0.1 m, drag to look and `W` `A` `S` `D` to move, no collision, eye height 1.6 m at 1.5 m/s with a 70° field of view, flat colours, and scene `z` as plan `-y`.

## Goal

The 3D view shows the plan: every wall as a solid at its real thickness and height, joined cleanly at the corners, and a floor in every room. It follows the model, so an edit in the 2D editor is in the 3D view when you switch to it. The camera has two modes: orbit around the plan, and walk through it at eye height.

Editing stays in 2D. The 3D view is for looking in this phase.

## What the reference project does

The `blueprint3d` folders named in the project plan are no longer on this machine, so this section is from the Phase 1 and 2 notes and from memory, not from a fresh read.

- **Walls:** each side of a wall is a separate flat plane, built from the room's half-edges. The join points come from the two neighbouring walls of the same room loop, so walls that border no room, and junctions of three or more walls, do not join cleanly.
- **Floors:** one flat shape per room, from the room's corners.
- **Camera:** its own orbit controls. Wall sides that face away from the camera are hidden so you can see into a room. There is no walk-through mode.

What we keep: floors as one shape per room, and getting near walls out of the way in orbit mode. What changes: walls are solids built per corner, not per room, so every junction joins cleanly whether or not a room is there; the join geometry is pure functions with tests; and there is a walk-through mode.

## Design

### Where it lives

```
packages/floorplan-engine/src/
 ├─ model/
 │   └─ wall-footprints.ts   new, pure: each wall's outline on the floor, joined at corners
 ├─ view3d/                  new
 │   ├─ coordinates.ts       plan (x, y) ↔ scene (x, y, z), the only place this mapping lives
 │   ├─ wall-geometry.ts     footprint + height → BufferGeometry
 │   ├─ floor-geometry.ts    room polygon → BufferGeometry
 │   ├─ plan-scene.ts        keeps the wall and floor meshes in step with the Floorplan
 │   ├─ wall-cutaway.ts      pure: which walls stand between the camera and a room
 │   ├─ first-person.ts      pure: walking and looking, from keys, drag and elapsed time
 │   ├─ tween.ts             a small tween for camera moves
 │   ├─ view3d.ts            View3D: renderer, lights, grid, camera modes, render loop
 │   └─ index.ts
 └─ engine.ts                creates a View3D instead of owning the renderer itself
```

`wall-footprints.ts` has no Three.js and sits in the model, so the `./model` entry stays free of Three.js and the 2D editor can use the same outlines later. `wall-cutaway.ts` and `first-person.ts` are plain maths with no DOM. The geometry builders use Three.js classes that work in Node without WebGL, so all of these are unit-tested.

### Coordinates

Plan `(x, y)` maps to scene `(x, height, -y)`. Phase 1's note said plan `y` becomes scene `z`; with that mapping the 3D view would be a mirror image of the 2D plan, because the plan's `y` runs up the page and the scene's `z` runs towards the viewer. Negating it keeps a room that is on the left in 2D on the left in 3D.

Saved items already store a scene-style position (`y` is height). How their `x` and `z` relate to plan coordinates is decided in Phase 4; `coordinates.ts` is where it will be written down.

### `wall-footprints.ts`: clean joins

`wallFootprints(corners, walls)` returns, for each wall, its outline on the floor as a counter-clockwise polygon, with each edge labelled `front`, `back`, `end` or `join`.

At every corner the walls are sorted by direction, and each neighbouring pair is joined:

- **One wall at the corner:** a square end.
- **Two or more:** the facing edges of each neighbouring pair meet at one point, where the two edge lines cross (a mitre). Each wall's outline also passes through the corner point itself, so the outlines of all the walls at a junction fit together with no gap and no overlap, for any number of walls and any mix of thicknesses.
- **Walls in a straight line** (a wall split by a T-junction): no crossing point exists, so each keeps its own square edge. With different thicknesses this leaves a step, which is correct.
- **Very sharp angles:** a mitre grows into a long spike as the angle closes. When the spike would be longer than twice the wall thickness (angles under about 29°), the corner is cut flat instead (a bevel).

Test cases: a lone wall; an L at 90° and at other angles; an L with two thicknesses; two walls in line with the same and with different thicknesses; a T-junction; a four-way crossing; a sharp angle that bevels; and for every case, that the outlines at a junction do not overlap and their areas add up to the expected total.

Known limit: a wall shorter than its own join (a very short wall between two sharp corners) can produce a twisted outline. It is drawn as it comes; the 2D editor's snapping makes this hard to produce by accident.

### `wall-geometry.ts` and `floor-geometry.ts`

- **Walls:** the footprint is extruded from the floor to the wall's height: a top face and one vertical face per outline edge. Faces are grouped by label (`front`, `back`, `top`, and ends with joins), so a later phase can colour the two sides of a wall separately. The `join` faces are inside the solid where walls of equal height meet, and show correctly where a taller wall meets a shorter one. There is no bottom face.
- **Floors:** one flat shape per room at height 0, triangulated by Three.js. It uses the room's centreline polygon, not the inset `interior` from Phase 1: the walls stand on the floor and cover the strip under them, and the floor stays whole under a wall that is cut away (below). `interior` stays in use for the 2D fill.
- **Openings** for doors and windows are Phase 5; the wall builder is one function taking the footprint and height, which is where openings will be added.

Tests: vertex and face counts for a simple wall, the bounding box matches thickness, length and height, every face normal points outwards, and a floor's area matches the room's area.

A room inside a room still has no hole in the outer floor (decided in Phase 1). Both floors lie in the same plane with the same colour, so nothing shows in this phase.

### `plan-scene.ts`: following the model

`PlanScene` owns a group of wall meshes and a group of floor meshes and listens to `floorplan.on('change')`.

- **Every change rebuilds all walls and floors.** Plans have tens of walls, and a full rebuild is far simpler than tracking which walls a corner move touched. Old geometries are disposed; the two materials are shared and kept.
- **Nothing is rebuilt while the 3D view is hidden.** Editing happens in 2D with the 3D host at zero size. A change then only marks the scene as out of date, and the rebuild happens once when the view is shown again. Dragging a corner in 2D costs the 3D view nothing.
- Each mesh carries its wall or room id, which Phase 4 will need for picking.

Materials: one off-white matte material for walls and one warm light grey for floors, both from a small theme object like the 2D editor's. No textures.

### Camera: orbit mode

The existing `OrbitControls`, with two additions.

- **`fit()`** frames the whole plan: the target moves to the centre of the plan's bounding box and the distance follows its size. It runs once after a plan is loaded. An empty plan keeps today's default view.
- **Wall cutaway.** A wall with a room on one side only, seen from its outside, would hide the room. Such a wall is lowered to a 0.1 m stub while the camera is on its outer side, and stands at full height again when the camera moves round. The test is one dot product per wall on each camera move, and lowering is a vertical scale on the mesh, so no geometry is rebuilt. Walls with a room on both sides, or on neither, always stand.

The ground grid stays, moved just below the floor so the two do not flicker, and grows to cover the plan when the plan is larger than 20 m.

### Camera: walk mode

A first-person camera at eye height.

- **Look:** drag on the canvas. **Move:** `W` `A` `S` `D` or the arrow keys, at 1.5 m/s, or 3 m/s with `Shift`. **Leave:** `Escape`, or the toolbar.
- Eye height 1.6 m, field of view 70° (orbit mode keeps 50°). Looking up and down is limited to just short of straight up and down.
- Entering walk mode places the camera at the centre of the largest room, or at the plan's centre when there is no room. Leaving returns to the orbit position you came from.
- All walls stand at full height.
- **No collision with walls in this phase.** There are no doors until Phase 5, so collision would lock you in the room you start in. Collision is revisited with doors.
- Keys are listened to on the canvas, which takes focus, as in the 2D editor. Typing in a form field never moves the camera.

Movement is a pure function of the current position, the look angles, the held keys and the elapsed time, so it is tested without a browser: forward follows the look direction, strafing is sideways to it, height never changes, and diagonal movement is not faster.

### Tween and render loop

Switching camera mode and `fit()` move the camera over about 0.4 s with a small built-in tween, as the project plan intended instead of an animation library.

Rendering stays on demand: a frame is drawn when the model, the camera or the size changes. A `requestAnimationFrame` loop runs only while a tween is in progress or a movement key is held, and stops afterwards.

### `View3D` and engine changes

The renderer, scene, lights, grid, controls and resize handling move out of `engine.ts` into `View3D`, which the engine creates on the `view3d` host and exposes as `engine.view3d`, the counterpart of `engine.editor`.

```ts
engine.view3d.cameraMode             // 'orbit' | 'walk'
engine.view3d.setCameraMode('walk')
engine.view3d.fit()
engine.view3d.on('cameraMode', ...)
engine.view3d.dispose()              // called by engine.dispose()
```

`FloorplanEngineOptions` gains an optional `view3dTheme` for the wall, floor and background colours. `load()`, `export()` and the events are unchanged.

### Web app changes

- In the 3D view, the toolbar shows a camera toggle (Orbit, Walk) and the Fit button, which now works in both views. `view3d.on('cameraMode')` keeps the toggle in step when `Escape` leaves walk mode.
- A one-line hint per camera mode, as the 2D modes have.
- No new shadcn components.

## Steps

1. `wall-footprints.ts` in the model, with its tests.
2. `coordinates.ts`, `wall-geometry.ts` and `floor-geometry.ts`, with tests.
3. `View3D` taken out of `engine.ts`, and `PlanScene`: walls and floors appear and follow the model, with the rebuild deferred while hidden. `fit()`.
4. Wall cutaway in orbit mode, with tests.
5. Walk mode, the tween and the camera mode API, with tests.
6. Web app: the camera toggle, Fit in 3D, hints.
7. Browser check, then this file and the project plan are updated with the result.

Estimated size: 1,400 to 1,900 lines including about 500 of tests. One go-ahead covers all seven steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass; the `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover every join case above, the geometry builders, the cutaway rule and walk movement.
- In headless Chrome:
  - draw a room in 2D, switch to 3D, and the scene has four wall meshes and one floor, visible in a screenshot with closed corners;
  - an L-shaped room and a T-junction with two thicknesses show no gaps or overlaps at the joins;
  - change a wall's thickness and height in the inspector, and the 3D wall follows;
  - delete a wall in 2D, and the wall and the room's floor are gone in 3D;
  - orbit round the room, and the walls nearest the camera drop to stubs and come back;
  - enter walk mode, move and look, press `Escape`, and the camera returns to where it was;
  - with the 3D view hidden, editing in 2D triggers no 3D rebuild, and one rebuild happens on switching;
  - save, reload, and the same walls and floors are drawn.
- The Phase 2 browser check still passes.

## Not in this phase

- Textures, wall paint per side, and shadows (polish, Phase 7 or later). The face groups are there for it.
- Door and window openings (Phase 5), furniture and GLB loading (Phase 4).
- Selecting or editing anything in 3D, and showing the 2D selection in 3D.
- Collision in walk mode, pointer lock, and touch controls for walking.
- Ceilings, roofs, several storeys, holes in floors.
- Using the joined outlines in the 2D editor. The 2D walls are still plain bands, which leaves a small notch at the outside of each corner; switching the 2D drawing to the footprints is a small follow-up.

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Walls in the way are lowered to a 0.1 m stub**, so the plan's outline stays readable. The alternatives are hiding them completely, as the reference does, or leaving them standing. It is one constant either way.
2. **Walk mode uses drag to look and `W` `A` `S` `D` to move**, without capturing the mouse pointer. Pointer capture feels more like a game but takes the cursor away from the toolbar.
3. **No collision until doors exist** (Phase 5).
4. **Walk defaults:** eye height 1.6 m, 1.5 m/s, field of view 70°.
5. **Flat colours only:** off-white walls, warm light grey floors, no shadows.
6. **Scene `z` is plan `-y`**, so 3D is not a mirror image of 2D. This differs from the note in the Phase 1 plan.
