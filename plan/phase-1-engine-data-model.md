# Phase 1: engine data model

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All six steps are done. About 1,500 lines were added to the engine package, 780 of them tests; the estimate was 800 to 1,200.

### What was checked

- `pnpm typecheck`, `pnpm test` (96 tests, 83 in the engine), `pnpm lint`, `pnpm format:check` and `pnpm build` pass.
- The new `build.test.ts` follows the imports of the built `schema.js` and `model.js` and confirms neither reaches `three`, and that `index.js` imports `three` without bundling it.
- In headless Chrome, a plan with two rooms sharing a wall was loaded through `FloorplanEngine`, round-tripped unchanged through `export()`, and `engine.floorplan.rooms` listed both rooms counter-clockwise with the shared wall reporting a room on each side.
- The Phase 0 browser check still passes: grid, orbit, save, update, reload.

### Where the result differs from the plan

- **Duplicate walls are now rejected by the plan schema** as well as by the model, so a loaded plan can never hold two walls between the same corners. Room detection relies on this.
- **Change events** carry `{ kind: 'load' | 'corners' | 'walls', roomsChanged }` rather than a separate `rooms` kind: `roomsChanged` is true when the set of room ids changed.
- **A corner dropped on a wall moves perpendicular onto it**, not to the nearest corner-like position, so a wall stays straight after a split.
- **A split keeps the shortened wall's id** and creates one new wall for the other half, so an editor selection survives a split.
- **Room ids** collide only when the plan is not planar (walls crossing without a corner); then a `#2` suffix keeps them unique. Non-planar plans are otherwise unsupported, as planned.
- **The engine's typecheck includes Node types** for the build test; the published declaration build sets `types: []` so no Node globals leak into the library.

### Open questions, as decided

Orphan corners are removed, rooms inside rooms are reported without a hole, and the defaults are 0.15 m thickness, 2.5 m height and 0.05 m tolerance.

## Goal

The engine gets a working floor-plan model: corners joined by walls, with rooms detected from the closed loops. The model is plain TypeScript with no Three.js, fully unit-tested, and is what the 2D editor (Phase 2) and the 3D view (Phase 3) will draw from.

Nothing changes on screen in this phase. The grid is still the only thing rendered.

## What the reference project does

`blueprint3d` was read for reference only; no code is copied. Its model is four mutable classes (`Corner`, `Wall`, `Room`, `HalfEdge`) that hold references to each other and to Three.js meshes. Room detection runs a depth-first search from every corner in every direction looking for the "tightest" cycle, then removes duplicates and clockwise loops. It works, but it is quadratic, hard to test, and tangled with rendering.

We keep three of its ideas and change the rest:

- **Kept:** rooms are the smallest cycles of the planar graph of walls, listed counter-clockwise; a room's identity is derived from its corners; moving a corner onto another corner merges them, and onto a wall splits that wall.
- **Changed:** the model holds no rendering objects, the geometry is pure functions, and room detection is a single planar face walk instead of a search from every corner.

## Design

### Where it lives

```
packages/floorplan-engine/src/
 ├─ schema/            unchanged: the save format
 ├─ model/             new, no Three.js
 │   ├─ geometry.ts    pure 2D maths
 │   ├─ rooms.ts       room detection
 │   ├─ floorplan.ts   the Floorplan class
 │   └─ index.ts
 ├─ core/events.ts     unchanged
 └─ engine.ts          holds a Floorplan
```

A third package entry, `./model`, exposes the model without Three.js, next to `./schema`. The backend does not need it yet, but it keeps the no-Three.js boundary explicit and testable.

### Save format

Unchanged. Corners, walls and items already exist in version 1 of the plan format, and rooms are derived, not stored. No migration.

### Units and defaults

- Coordinates in metres on the floor plane, `x` to the right and `y` away from the viewer. The 3D view maps plan `y` to scene `z` (Phase 3).
- New walls default to 0.15 m thick and 2.5 m high. Both are options on the `Floorplan`.
- `cornerTolerance`, default 0.05 m: two corners closer than this are the same corner, and a corner closer than this to a wall sits on that wall. The editor snaps to coarser distances on top of this (Phase 2).

### `geometry.ts`: pure functions

Small, each with its own tests:

- distance between points; distance from a point to a segment and the closest point on it;
- segment intersection, including the collinear and touching cases;
- signed polygon area, `isClockwise`, centroid, bounding box;
- angle of a vector and the turn angle between two edges, used by room detection;
- point in polygon;
- polygon inset by a per-edge distance, giving the interior outline of a room from the wall centrelines and half-thicknesses. The 3D floors (Phase 3) need this; it is pure geometry, so it is written and tested here.

### `rooms.ts`: room detection

Input: corners and walls. Output: rooms, each an ordered list of corner ids, counter-clockwise.

The algorithm is the standard face walk on a planar graph:

1. Index each corner's neighbours and sort them by angle.
2. Every wall gives two directed half-edges. Walk from each unvisited half-edge: at each corner, leave by the neighbour that is the next one clockwise from the edge we arrived on. Each walk closes a loop and marks its half-edges visited.
3. Loops with negative signed area are faces seen from outside (the outer boundary of each connected group of walls); drop them. The rest are rooms.
4. A room's id is the sorted corner ids joined with `-`, so it stays the same while the corners do, and later phases can attach data (floor texture, name) to it.

Each half-edge is visited once, so this is linear in the number of walls after the sort, and it never produces duplicates, which is what made the reference's version complicated.

Cases that get a test each:

- one square room;
- two rooms sharing one wall (the shared wall has a room on each side);
- an L-shaped room and a room with a collinear corner on one side;
- a wall that dangles into a room or off the outside (no room, but the walls are kept);
- walls that do not close any loop (zero rooms);
- two separate groups of walls (two rooms, two outer faces dropped);
- a room drawn clockwise (still reported counter-clockwise);
- a room inside a room (both reported; the outer room's polygon does not have a hole in this phase; see open questions).

### `floorplan.ts`: the `Floorplan` class

Owns the corners and walls, keeps them consistent, and recomputes rooms when they change.

```ts
const fp = new Floorplan({ cornerTolerance: 0.05, wallThickness: 0.15, wallHeight: 2.5 })
fp.load(plan)                         // validated by planSchema
const a = fp.addCorner(0, 0)          // returns the id; merges into an existing corner within tolerance
const b = fp.addCorner(4, 0)
fp.addWall(a, b)                      // returns the wall id; refuses a == b or a duplicate wall
fp.moveCorner(a, 0.02, 0)             // merges or splits when it lands on something
fp.removeWall(wallId)                 // corners left with no walls are removed too
fp.removeCorner(id)                   // removes its walls as well
fp.updateWall(wallId, { thickness: 0.3 })
fp.corners, fp.walls, fp.rooms        // read-only views
fp.wallsAt(cornerId), fp.roomsOf(wallId)   // adjacency: a wall has at most one room per side
fp.export()                           // a Plan, deep copy
fp.on('change', ({ kind }) => ...)    // kinds: load, corners, walls, rooms
```

Rules the class enforces, each with a test:

- ids are generated by the model (`crypto.randomUUID()`), never by the caller, except on `load()`;
- a wall never joins a corner to itself, and two corners never share two walls;
- adding or moving a corner onto an existing corner (within tolerance) merges them: walls are re-pointed, duplicates removed, and the dropped corner is gone;
- adding or moving a corner onto a wall (within tolerance, not at an end) splits the wall in two, both halves keeping the thickness and height;
- removing a wall removes any corner that is left with no walls;
- removing a corner removes its walls, and then any corner they leave stranded;
- rooms are recomputed after each change in one pass, and `change` fires once per operation, not once per internal step;
- `export()` always passes `planSchema`, including after a merge or split.

Items are stored and exported unchanged in this phase; placing them is Phase 4.

### Engine changes

`FloorplanEngine` gains a `floorplan` property. `load()` delegates to it and `export()` reads from it, so the Phase 0 save path keeps working. The engine listens for `change` and re-renders, which still shows only the grid.

## Steps

1. `geometry.ts` with tests.
2. `rooms.ts` with the test cases above.
3. `Floorplan` class: load and export, add and remove, then merge and split, then adjacency.
4. The `./model` entry and the engine wiring.
5. A check that the `./model` and `./schema` builds contain no Three.js, added to the engine's tests.
6. Update this file with the result and any differences.

Estimated size: 800 to 1,200 lines including tests. One go-ahead covers all six steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint` and `pnpm build` pass.
- The built `model.js` and `schema.js` do not import `three`.
- A plan with two adjacent rooms, loaded and exported through `FloorplanEngine`, round-trips unchanged, and `engine.floorplan.rooms` lists both rooms counter-clockwise.
- The Phase 0 browser check still passes: grid, save, reload.

## Not in this phase

- Drawing or editing in the browser (Phase 2).
- Walls, floors or rooms in 3D (Phase 3).
- Item placement (Phase 4).
- Undo and redo (Phase 7). The model's `export()` gives cheap snapshots, which is how undo will work.
- Curved walls, sloped floors, multiple storeys.

## Open questions

Decisions the plan makes that are easy to change now and costly later. The defaults are what will be implemented unless you say otherwise.

1. **Orphan corners.** Removing a wall also removes corners left with no walls. The alternative is to keep lone corners so the user can start a new wall from them; that makes the editor's job harder later. Default: remove them.
2. **Rooms inside rooms.** A room drawn inside another is reported as a room, and the outer room's polygon ignores the hole. Handling holes properly affects area, floor rendering and the inset. Default: leave holes for later, since the reference does the same and typical plans don't need it.
3. **Defaults** of 0.15 m wall thickness, 2.5 m height and 0.05 m corner tolerance.
