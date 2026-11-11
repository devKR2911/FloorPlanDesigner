# Phase 5: doors and windows

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All eight steps are done. About 2,650 lines were added across the engine and the web app, 830 of them tests; the estimate was 2,500 to 3,000. No files were downloaded and no dependencies were added.

### What was checked

- `pnpm typecheck`, `pnpm test` (333 tests: 283 in the engine, 37 in the web app, 8 in the shared package, 5 in the backend), `pnpm lint`, `pnpm format:check` and `pnpm build` pass. The `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover fitting (ends, neighbours, wall height), every rule for following a wall change, the wall faces around holes and the faces inside them, the door and window objects, the 2D gestures (slide, snap, stop at ends and neighbours, jump walls, flip, delete), the ray maths for sliding in 3D, and collision (blocked, sliding, corners, doorway, window, pushed out of a wall, long steps).
- In headless Chrome, driven through the DevTools protocol:
  - with no walls, clicking Door shows "Draw a wall first"; with a room, the door lands in the middle of the nearest wall, selected, with the inspector showing its size;
  - in 2D the door is a gap with its leaf and swing arc, and the window a gap with glazing lines; in 3D the door is a hole with a frame and an open leaf, and the window has see-through glass;
  - dragged past the end of its wall the door stops at 4.425 m, the exact limit; dragged into the window it stops beside it; the window dragged towards another wall jumps to it and snaps to its middle;
  - `F` and the two inspector buttons change the hinge and swing; a width of 1.2 m is applied; a width of 9 m and a height of 2.45 m on a 2.5 m wall are refused, the field turns red, and on leaving it shows the real value again;
  - a corner added on the wall splits it and the door moves to the new half at the matching offset;
  - lowering the wall below the door marks the door red in 2D and takes it out of 3D; raising the wall brings it back;
  - Delete mode removes the window and keeps its wall; removing the door's wall removes the door and clears the selection;
  - in 3D, a press on the door's frame selects it and dragging slides it along the wall without moving the camera; `F` flips it;
  - in walk mode: walking south from the middle of the room goes out through the door to 1.9 m beyond the wall; walking east stops 0.25 m from the window wall's face; walking north stops 0.25 m from a plain wall;
  - saved and reloaded, the openings come back unchanged; a plan stored without an `openings` list loads with none;
  - the Phase 3 and Phase 4 browser checks still pass; no console errors.
- The rooms in the browser checks were built through the `Floorplan` API, and so were the wall split and the wall height changes. Shortening a wall by dragging a corner was checked in unit tests only, not in the browser.

### Where the result differs from the plan

- **An opening keeps its place on the plan, not its distance from the wall's start.** The plan said offsets are kept when a corner is dragged. With that rule, pulling the start corner along the wall would slide every door with it while pulling the end corner would not. Instead each opening remembers where it is on the plan, and after a wall changes it is put back as near to that spot as the wall allows. Moving a whole wall carries its openings along.
- **The wall of the selected door or window stays up in orbit mode.** From the default camera angle the walls nearest the camera are lowered, so a door just added in 3D could not be seen. While it is selected, its wall is not lowered.
- **Door and window objects sit beside the wall meshes,** in their own group, not inside them. Lowering a wall squashes its mesh, which would have squashed the door too; instead they are hidden while their wall is lowered, as planned.
- **In 2D a door's leaf is drawn open at a right angle,** the usual plan symbol, while in 3D it stands open at 80°.
- **`F` changes the hinge side first, then the swing side,** giving four steps round.
- **A dragged opening jumps to another wall** when the pointer is within 0.3 m of it and at least 0.15 m nearer to it than to its own wall. The plan did not give numbers.
- **The walker is steered into a doorway** when a little off line, because the wall's edge at the door is rounded for the walker. It costs a few centimetres of the step.
- **The engine has an `openingSnap` setting** (the 0.05 m step and the snap to the middle), live like the item placement settings.

### Known rough edges

- A door or window on a lowered wall cannot be seen unless it is selected. The lowered stub does show its gap.
- Furniture is not aware of doors: an item can stand in a doorway or in a door's swing without being flagged, and it does not block the walker.
- The gap of an opening in 2D is drawn in the background colour, without the room's tint.
- A room with no door keeps the walker inside it. That is correct, but walk mode gives no hint about it.

### Open questions, as decided

All seven defaults were implemented as written: wall-mounted and ceiling items left out, doors and windows built in code, doors shown open at 80° in 3D, collision included with furniture not blocking, sliding along one wall only in 3D, an opening that stops fitting kept and marked, and the default sizes.

## Goal

Doors and windows can be added to walls. Each one belongs to a wall, slides along it, and cuts a real opening in it: a gap with a door swing or window lines in the 2D editor, and a hole with a frame, a door leaf or glass in the 3D view. They are saved with the plan.

With doors in place, walk mode gets collision: you can no longer walk through walls, only through doorways.

## What the reference project does

The `blueprint3d` folders are not on this machine, so this is from memory, not a fresh read.

- Doors and windows are items of an "in wall" type: loaded models that snap to the nearest wall while dragged in 3D.
- Each wall side is rebuilt with holes cut from the bounding boxes of the items on it.
- The 2D floorplanner does not show doors or windows at all.

What we keep: an opening belongs to one wall and the wall is rebuilt with holes for it. What changes: openings are sized by numbers (width, height, sill), not by a model's bounding box; they are drawn in 2D with the usual plan symbols and edited there; and they follow their wall through splits and moves by rules that are tested.

## Design

### Doors and windows are built in code, not loaded

A door or window here is a few boxes made by the engine: a frame lining the hole, plus a door leaf or a glass pane. This is the recommended default, for three reasons:

- **Any size.** Width, height and sill height are numbers the user can change. A loaded model has one size and distorts when stretched.
- **Any wall thickness.** The frame is built to the wall's own thickness. The kit's doorway models have a fixed depth.
- **No download.** The Kenney kit folder was deleted after Phase 4. Using its door and window models would need it downloaded again.

The alternative, the kit's `doorway` and `wallWindow` models, is listed in the open questions.

### Where it lives

```
packages/floorplan-engine/src/
 ├─ schema/plan.ts               the plan gains an `openings` list
 ├─ model/
 │   ├─ floorplan.ts             opening operations; openings follow wall changes
 │   ├─ wall-openings.ts         new, pure: where an opening may sit, its outline, hit testing
 │   └─ walk-collision.ts        new, pure: moving a walker without crossing walls
 ├─ editor/                      openings drawn, hit, dragged and flipped in 2D
 ├─ view3d/
 │   ├─ wall-geometry.ts         walls built with holes and the faces inside them
 │   ├─ opening-geometry.ts      new: frame, door leaf, window glass
 │   ├─ plan-scene.ts            adds the door and window objects to each wall
 │   └─ view3d.ts                selecting and sliding openings; collision in walk mode
 └─ engine.ts                    addOpening()

apps/web/src/features/
 ├─ catalog/                     a "Doors and windows" section in the panel
 └─ editor/OpeningInspector.tsx  new
```

### Save format

A plan gains a list of openings:

```ts
{
  id: string
  wallId: string
  kind: 'door' | 'window'
  offset: number // metres from the wall's start corner to the opening's centre
  width: number
  height: number
  sill: number // metres from the floor to the bottom of the opening; 0 for doors
  hinge: 'start' | 'end' // doors: which end of the opening the leaf hangs from
  swing: 'front' | 'back' // doors: which side of the wall the leaf opens to
}
```

The list defaults to empty when missing, so plans saved before this phase still load and the format version stays at 1. The schema checks that every opening names a wall that exists.

Defaults: a door is 0.9 m × 2.1 m; a window is 1.2 m × 1.2 m with a 0.9 m sill.

### `wall-openings.ts`: pure rules

- **Clear span.** The stretch of a wall an opening may occupy: the part where both faces of the wall exist after the corner joins from Phase 3, less a 0.05 m margin at each end. It comes from the wall's footprint.
- **Fitting.** An opening must lie inside the clear span, at least 0.05 m from any other opening on the wall, and its top must be at least 0.1 m below the top of the wall. `fitOpening()` moves a requested offset to the nearest place that satisfies this, or reports that there is none.
- **Outline and hit testing.** An opening's rectangle on the plan (its width by the wall's thickness), and which opening is under a point.
- **Nearest wall.** For a point on the plan, the wall it is closest to and how far along, used when dragging.

### `Floorplan`: opening operations

```ts
fp.addOpening({ wallId, kind, offset, width?, height?, sill? }) // returns the id
fp.updateOpening(id, { wallId?, offset?, width?, height?, sill?, hinge?, swing? })
fp.removeOpening(id)
fp.getOpening(id)
fp.openingsOf(wallId)
```

Each fires one `change` event with the new kind `openings`. Adding or updating fits the opening to its wall; a request that cannot fit is refused with a `FloorplanError` and changes nothing.

Openings follow their wall:

- **Wall removed:** its openings are removed with it, in the same change.
- **Wall split** (a corner dropped on it, or a wall drawn into it): each opening stays on whichever half holds its centre, with its offset adjusted. An opening that the new corner lands inside moves along to fit beside it.
- **Wall made shorter or thinner** (a corner dragged): offsets are kept and re-fitted. An opening that no longer fits at all is kept but marked as not fitting: drawn in the warning colour in 2D, and not cut in 3D. Nothing is deleted behind the user's back, so dragging the corner back restores it.
- **Corners merged:** a wall that the merge removes as a duplicate takes its openings with it, as removing it by hand would.

### 3D: walls with holes

`buildWallGeometry()` takes the wall's openings as well as its footprint and height.

- **Faces.** The front and back faces are split into plain rectangles around the holes: full-height strips between openings, and a strip above and below each one. This needs no triangulation library and is tested by area.
- **Inside the hole.** Each hole gets its four inner faces: the two sides, the top, and the bottom (a sill for a window, a threshold at floor level for a door), so the wall reads as solid from every angle.
- The top face and the end and join faces are unchanged.

A lowered wall (the Phase 3 cutaway) keeps its holes, and its doors and windows are hidden while it is lowered.

### 3D: the door and the window

`opening-geometry.ts` builds each as a small group, added to the wall's mesh so it moves and lowers with it:

- **Frame:** 5 cm thick, lining the sides and top of the hole (and the sill for a window), as deep as the wall.
- **Door:** a 4 cm leaf hung on the hinge side, shown open at 80° towards the swing side, so you can see and walk through it.
- **Window:** a glass pane in the middle of the wall's thickness, see-through, with one upright bar.

Three colours are added to the 3D theme: frame, door leaf and glass. No textures.

### 2D editor

- **Drawing.** The opening is a gap in the wall band. A door shows its leaf as a line and its swing as a quarter circle on the swing side. A window shows two thin lines along the wall. Hovered, selected and not-fitting openings use their own colours.
- **Hit testing:** corners first, then openings, then items, then walls.
- **Move mode.** Dragging an opening slides it along its wall. When the pointer comes nearer to another wall, the opening jumps to that wall, if it fits there. The offset snaps to 0.05 m steps and to the middle of the wall; `Alt` turns snapping off. While dragging, the distances from the opening to both ends of the wall are shown.
- **Keys.** `F` steps a door through its four hinge and swing combinations. `Delete` removes the selection.
- **Delete mode:** a click removes the opening under the pointer.

### 3D view

- In orbit mode, a click on a door or window selects it, shared with 2D as items are. `F` and `Delete` work as in 2D.
- Dragging a selected opening slides it along its own wall: the pointer's ray is intersected with the wall's plane. Moving an opening to a different wall is done in 2D.

### Walk mode: collision

`walk-collision.ts` is a pure function: given where the walker is, where the step would take them, and the plan, it returns where they end up.

- The walker is a circle of 0.25 m radius. Walls are solid at their real thickness. A door's opening is a gap; a window's is not.
- A step into a wall slides along it instead of stopping dead.
- A walker who starts inside a wall, for example after the plan was edited, is pushed out to the nearer side.
- Furniture does not block the walker in this phase.

A room with no door now keeps you in it, which is correct. Walk mode still starts in the largest room.

### Engine and web app

```ts
engine.addOpening({ kind: 'door', width: 0.9, height: 2.1 }) // on the wall nearest the view's centre where it fits
```

- **Panel.** The catalogue panel gets a "Doors and windows" section at the top with four presets: Door, Double door (1.6 m), Window, Wide window (2 m). They show line icons, not thumbnails. Clicking one adds it to the nearest wall with room for it and selects it. With no wall that can take it, a short message says so.
- **Inspector.** For a selected opening: width, height, sill height for windows, two flip buttons for doors (hinge side, swing side), and Delete. A value that does not fit is not applied, and the field shows the last valid value.
- The selection gains a fourth kind, `opening`.

## Steps

1. Save format, `wall-openings.ts`, and the `Floorplan` opening operations, including following wall changes; tests.
2. Walls with holes in `wall-geometry.ts`; tests.
3. `opening-geometry.ts` and the door and window objects in `PlanScene`; tests.
4. Openings in the 2D editor: drawing, hit testing, dragging along and between walls, flipping, deleting; tests.
5. Openings in the 3D view: selecting, sliding along the wall, keys.
6. `walk-collision.ts` and its use in walk mode; tests.
7. Web app: the panel section, the opening inspector, the message when nothing fits.
8. Browser check, then this file and the project plan are updated with the result.

Estimated size: 2,500 to 3,000 lines including about 850 of tests. One go-ahead covers all eight steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass; the `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover fitting (ends, neighbours, wall height), every rule for following a wall change, the wall faces around one and several holes, the faces inside a hole, the new 2D gestures, and collision (blocked by a wall, sliding, passing a doorway, blocked by a window, pushed out of a wall).
- A plan saved before this phase, with no `openings` list, still loads.
- In headless Chrome:
  - add a door from the panel and it appears on the nearest wall as a gap with a swing arc in 2D, and as a hole with a frame and an open leaf in 3D;
  - add a window and the room behind it is visible through the glass in 3D;
  - drag the door along its wall and it stops at the ends and at the window; drag it to another wall and it moves there;
  - `F` changes the door's hinge and swing in both views;
  - change width, height and sill in the inspector and both views follow; a width too large for the wall is refused;
  - drop a corner onto a wall with a door and a window, and each stays on its half;
  - drag a corner until a wall is too short for its door, see it marked as not fitting, and drag back to restore it;
  - delete a wall and its openings go with it;
  - in walk mode, walk into a wall and stop, slide along it, walk out through the door, and fail to walk through the window;
  - save, reload, and the openings come back.
- The Phase 2, 3 and 4 browser checks still pass.

## Not in this phase

- Wall-mounted and ceiling catalogue items, such as wall lamps, mirrors and upper cabinets. See the first open question.
- Doors that open and close, sliding doors, door handles, and windows with several panes.
- Openings that are not rectangles, and openings that span two walls or a corner.
- Flagging furniture that blocks a door or stands in its swing.
- Furniture blocking the walker.
- Undo and redo (Phase 7).

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Wall-mounted and ceiling items stay out.** Phase 4 pointed them at this phase, but they need models from the kit, which is deleted, and their own attachment rules. Including them would add about 500 lines and a new download. They can follow as their own small phase.
2. **Doors and windows are built in code**, not loaded from the kit's models, for the reasons above.
3. **Doors are shown open at 80°** in 3D. The alternative is closed, which looks tidier from outside but means walking through a shut door.
4. **Collision is part of this phase**, with furniture not blocking. It is the most separable step: leaving it out saves about 250 lines and keeps today's walk-through-anything behaviour.
5. **In 3D an opening slides along its own wall only**; changing walls is done in 2D.
6. **An opening that stops fitting is kept and marked**, not deleted.
7. **Default sizes:** door 0.9 × 2.1 m, double door 1.6 × 2.1 m, window 1.2 × 1.2 m and wide window 2.0 × 1.2 m, both with a 0.9 m sill.
