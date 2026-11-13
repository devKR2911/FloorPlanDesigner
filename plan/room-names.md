# Room names

Status: done. Planned and implemented on 2026-11-12, not yet committed.

## Result

All six steps are done, in about 640 lines changed, 380 of them tests.

### What was checked

- `pnpm typecheck`, `pnpm test` (474 tests: 350 engine, 13 shared, 21 backend, 90 web), `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` (14 tests, one of them new) pass.
- In headless Chrome, on a 4 × 3 room with a sofa:
  - clicking the area label selects the room (stronger tint), opens the panel, and typing "Living room" shows the name over the area and as the panel heading;
  - the name survives dragging a corner, splitting a wall with a new corner, and dragging the whole room 3 m in steps;
  - one Undo removes a whole typed rename;
  - clicking empty floor clears the selection, and clicking the sofa selects the sofa;
  - removing a wall makes the room and its name vanish while the record stays in the export; Undo brings both back;
  - the name is still there after a reload.

### Where the result differs from the plan

- **A bug outside the plan's list:** the engine clears a selection whose element no longer exists, and its check did not know rooms, so the first name keystroke cleared the selection and closed the panel. Fixed in `engine.ts` (`exists()` now checks `getRoom`); caught by the browser check, not the unit tests, which drive the interaction directly.
- **The anchor refresh keeps names through drags step by step.** A single jump that moves the whole room beyond its own footprint (possible through the API, not the UI) leaves the name behind as a dormant record. Recorded as a known limit; the editor's drags move in small steps, which the tests cover.
- **The inside-point helper** uses candidate points (centroid, triangles of neighbouring corners, edge-to-centroid pulls) judged by distance to the nearest edge, rather than the triangle-fan wording in the plan.
- **The empty panel text** now reads "Select a wall, door, window, item or room to edit it."

### Open questions, as decided

Selection by clicking the label; merged rooms keep both records (older name wins); the name commits per keystroke; the record list is named `rooms` for B1 (materials) to build on.

Back to the [future plan](future-plan.md), where this is item A5.

## Goal

A room can be given a name ("Kitchen"), shown in the 2D view above its area label and editable in the properties panel. Names are saved with the plan and survive the edits a plan normally goes through: moving corners, changing wall sizes, adding doors and furniture.

## The design problem: rooms are derived

Rooms are not stored in the plan; they are detected from the walls, and a room's id is its sorted corner ids. So a name cannot simply hang off the room id: splitting a wall of the room adds a corner and the id changes, and the name would silently fall off.

The same problem was solved for doors and windows with anchors, and names use the same idea: **a name is a record with a point**, and it belongs to whichever room contains that point.

## Design

### Save format

The plan gains an optional fourth list, like `openings` before it, so the format version stays 1 and old plans load unchanged:

```ts
rooms: z.array(
  z.object({
    id: idSchema, // the record's own id, not the derived room id
    name: z.string().trim().min(1).max(60),
    anchor: z.object({ x: z.number(), y: z.number() }), // a point inside the room
  }),
).default([])
```

Duplicate record ids are rejected like other duplicates. Two records may sit in one room (two rooms merged into one); the derived room then takes the older record's name and the other record is kept, dormant, in case the rooms are split apart again.

### Model

- `Room` gains `name?: string`, filled in by `recomputeRooms()`: each record is matched to the detected room whose polygon contains its anchor (`pointInPolygon`, already in the geometry module).
- `floorplan.nameRoom(roomId, name)`: creates or updates the record for that room, with the anchor set to a point inside the room; an empty name deletes the record. Emits a change with a new kind `'rooms'` and `target` set to the record id, so a run of keystrokes joins into **one undo step**, exactly as wall edits do.
- **The anchor point:** the room's centroid when it lies inside the polygon; for an L-shaped room whose centroid falls outside, the centre of the polygon's largest inscribed triangle fan step (a small helper in `geometry.ts`, with its own tests). After edits that keep the room, the record's anchor is refreshed to the room's current anchor point, so a room dragged across the plan keeps its name (mirroring how opening anchors are refreshed).
- A record whose anchor lands in no room (the room was deleted or opened up) stays in the plan, dormant: drawing walls back around that spot brings the name back. `export()` includes the records; `load()` and `restore()` replace them.
- New change kind `'rooms'` is added to `FloorplanChangeKind`. The 3D view's `walkBlocks` reset and the 2D re-render treat it like any other change; nothing geometric moved, so this is cheap.

### 2D view

- The room label becomes two lines: the name (when there is one) above the area, both centred on the label point the area uses today. The `plain` snapshot keeps leaving labels out, so plan-list pictures are unchanged.
- **Selecting a room:** `Selection` gains `kind: 'room'`. In move mode, a click on the room's **label** (its text box with a few pixels of slack, computed by the renderer and shared with the hit-test, the same pattern the parked wall-length plan used for dimension labels) selects the room. Corners, openings, items and walls keep priority; a click inside the room away from the label still clears the selection, so today's behaviour is otherwise untouched.
- A selected room's interior is tinted slightly stronger, so the selection is visible.
- Delete does nothing for a room selection: a room is not a thing that can be deleted, only its walls can.

### Properties panel

A room selection shows:

- heading: the name, or "Room" when it has none;
- a **Name** text field (committing per keystroke like Rotation, 60 characters max, cleared to remove the name);
- the area, read-only ("12.0 m²");
- no delete button.

Selecting a room opens the panel like any other selection. If an edit changes the room's derived id while it is selected, the selection clears, as it does when a selected wall is deleted.

### 3D view

Out of scope: no floating name labels in 3D. A room selected in 2D keeps showing its name field in the panel after switching to 3D, like a wall; rooms cannot be clicked in 3D.

## Steps

1. Schema: the `rooms` list with validation and tests; the inside-point helper in `geometry.ts` with tests (square, L-shape whose centroid is outside).
2. Model: `nameRoom()`, matching records to rooms, anchor refresh, dormancy, the `'rooms'` change kind; tests:
   - name, rename and clear a room, each one undo step for a typing run;
   - the name survives moving a corner, splitting a wall of the room, and merging two of its corners;
   - merging two named rooms shows the older name and keeps both records; redrawing the dividing wall brings both names back;
   - deleting the room keeps the record dormant and `export()` round-trips it;
   - a plan without `rooms` loads as before.
3. Editor: label text box shared between drawing and hit-testing, `kind: 'room'` selection, the stronger tint, label click priority; interaction tests.
4. Web app: the Room section in the properties panel with a panel test; Delete key ignored for rooms.
5. Browser check, full check, `pnpm e2e`, plus one new end-to-end test: draw a room, click its label, type "Kitchen", see "Kitchen" above the area, reload the plan and it is still there.
6. Record the result here and mark A5 done in the future plan.

Estimated size: 400 to 500 lines including tests. One go-ahead covers all six steps.

## How it will be checked

- All workspace checks and the end-to-end suite pass.
- In headless Chrome, on a 4 × 3 room with a door and a sofa:
  - clicking the area label selects the room, opens the panel, and typing "Kitchen" shows "Kitchen" over "12.0 m²";
  - dragging a corner, splitting a wall with a new corner, and dragging the whole room elsewhere all keep the name;
  - undo after typing removes the whole name in one step;
  - deleting a wall (room gone) hides the name; undo brings the room and its name back;
  - saving and reloading keeps the name; the plan-list picture is unchanged by names;
  - clicking inside the room away from the label still clears the selection, and clicking the sofa still selects the sofa even over the label.

## Not in this change

- Names in the 3D view.
- Automatic names ("Room 1") for unnamed rooms.
- Room-level properties beyond the name (floor material is B1, which can reuse these records and their anchors).
- Keeping the label clear of furniture (a known rough edge from Phase 4, unchanged).

## Open questions

Defaults to be implemented unless you say otherwise:

1. **A room is selected by clicking its label**, not anywhere inside it. Clicking empty floor keeps clearing the selection, which dragging and panning rely on. The alternative, double-clicking anywhere in the room, can be added later without conflict.
2. **Merged rooms keep both records**, showing the older name, so splitting them again restores both. The alternative, deleting the losing record at merge time, loses a name invisibly.
3. **The name field commits per keystroke** (undo joins the run), like every other panel field. Commit-on-Enter can come with the wall-length rethink if you prefer it everywhere.
4. **B1 (materials) will build on these records**, so the `rooms` list is named generically rather than `roomNames`.
