# Type a wall's length

Status: parked on 2026-11-12, not approved. Nothing was implemented.

Dropped for now because editing one wall's length must change a connected wall too (a closed room cannot change one side alone), and with bending neighbours or mid-typing commits those lengths come out arbitrary. A revision was sketched (commit on Enter, a live preview that highlights every wall whose length would change, keep-square as the only silent behaviour) but the feature's value is to be rethought before any of it is built.

Back to the [future plan](future-plan.md), where this is item A1.

## Goal

A wall can be given an exact length by typing it, in a **Length** field in the properties panel, and a click on a wall's dimension label in the 2D view goes straight to that field. The wall keeps its direction; one end stays where it is and the other moves. In a rectangular room the room stays rectangular.

Today a length can only be set by dragging a corner, to the nearest 0.1 m grid step, and only in the 2D view.

## What exists today

- **Model:** a wall is two corner ids plus thickness and height; its length is not stored, it is the distance between the corners. `moveCorner(id, x, y, { resolve: false })` moves a corner without merging it into another corner or splitting a wall, and `moveCorners(ids, dx, dy)` moves several as one change.
- **Openings follow:** after any corner move, `rehomeOpenings()` keeps each door and window at the same point along its wall, slides it back inside if the wall got shorter, and leaves it marked "does not fit" (red) if there is no room for it.
- **Undo:** each change to the plan is one step, except a drag (between `begin()` and `end()`) and a run of edits to the same wall made within a second of each other, which `History` joins using the change's `target` id. Typing "3", "3.", "3.2" into a field is therefore one step, as long as each keystroke's change carries the wall's id as its `target`.
- **Dimension labels:** `drawDimensions()` writes each wall's centre-line length, with two decimals, beside the wall on the side without a room. Labels shorter than 30 pixels on screen are not drawn. Clicking a label today hits nothing, which clears the selection.
- **Panel:** `WallInspector` shows Thickness and Height through the shared `MetreField`, which commits on every keystroke and marks a refused value as invalid.

## Design

### Which end moves

A wall has a start corner and an end corner, but which is which is invisible to the user. So the panel says which end moves, the 2D view shows it, and a button swaps it:

- When the Length field has focus, the 2D view draws the end that will move as a hollow, highlighted corner with a short arrow along the wall, and the fixed end as a filled corner.
- A **Move the other end** button under the field swaps them. The choice is remembered per wall for as long as the wall stays selected.
- By default the **end** corner moves (the start stays). That is the end the user clicked last when drawing the wall, so it is usually the one they expect to adjust.

### What the connected walls do

When the moving corner is shared with other walls, there are two ways to move it. The plan uses the first unless "Keep corners square" is turned off.

1. **Keep corners square (default):** every other wall at the moving corner that is not in line with the edited wall is moved bodily by the same offset (both its corners move), so it keeps its length and angle. The walls beyond it then stretch or shrink. In a rectangle `A B C D`, making `A–B` longer moves `B` and `C` together: `B–C` slides across, `C–D` gets longer, and the room stays rectangular. A wall in line with the edited one (a straight run split by a corner) does not move its far corner; it simply gets shorter or longer.
2. **Move the corner only:** just the moving corner moves; every wall at it bends to follow, as when the corner is dragged.

A **Keep corners square** checkbox under the field switches between them, on by default.

If keeping corners square would move the fixed corner itself (a triangle, where the neighbour's far end is the edited wall's fixed end), or would move a corner that the edit already moved, that neighbour is left to bend instead. The rule never moves more than the moving corner plus one far corner per neighbour; it does not ripple further through the plan.

### Which length is typed

The **centre-line** length: the distance between the two corners, the same number the 2D dimension labels show. Inside lengths (wall face to wall face) are a separate question; see the open questions.

### Limits

A length is refused (the field turns red, nothing changes) when it is:

- not a positive number, or shorter than 0.1 m;
- one that would put the moving corner, or a corner moved with it, within 5 cm of another corner. Merging or splitting while a number is half typed would destroy walls; typing a length never merges or splits.

A length that leaves a door or window with no room is allowed. The opening shows red as it does after a drag, and the user can widen the wall again or move the opening.

### Model: `Floorplan.setWallLength()`

```ts
floorplan.setWallLength(wallId, length, { moving: 'end' | 'start', keepSquare: true })
// returns false, changing nothing, if the length is refused
```

- Works out every corner to move and the offset, checks the limits, then moves them as one change (kind `corners`) with `target: wallId`, so a run of keystrokes is one undo step and openings re-home once.
- Pure geometry helpers for "which corners move, and where" go in a new `model/wall-length.ts`, so they can be tested on their own.

### Engine: the label click and the moving-end marker

- `editor/dimensions.ts` (new): `dimensionLabels(floorplan, viewport)` returns each drawn label's wall id, text, centre and angle. `drawDimensions()` draws from it, and the hit-test uses the same list, so what is clicked is exactly what is drawn.
- In move mode, a click on a label (inside its text box, a few pixels of slack) selects the wall and emits a new `editLength` event with the wall id. It is checked after corners, openings and items, so those keep priority where they overlap a label.
- `PlanEditor.showLengthEdit({ wallId, moving } | null)` asks the renderer to draw the moving-end marker described above; `null` removes it.

### Web app

- `WallInspector` gets **Length** as its first field, then **Move the other end** and **Keep corners square**, then Thickness and Height as today.
- On the editor's `editLength` event, `Editor.tsx` opens the properties panel and focuses the Length field with its text selected, so typing replaces it.
- While the Length field has focus, the inspector tells the 2D editor which end moves; on blur the marker goes.
- The field's value follows the wall: after a drag, an undo, or a change made in the other field, it shows the new length, as Rotation does for items.
- In the 3D view, the Length field works the same for a wall selected in 2D; there is no marker in 3D.

## Steps

1. `model/wall-length.ts` and `Floorplan.setWallLength()`, with tests:
   - a lone wall, from either end;
   - a rectangle with and without keeping corners square: it stays rectangular, with the expected new area;
   - a wall in line with another, where the neighbour just shortens;
   - a triangle, where the neighbour bends;
   - each refused case, leaving the plan unchanged;
   - a door on the wall stays at the same distance from the fixed end, and a door with no room left is marked unfit;
   - three quick edits in a row are one undo step.
2. `editor/dimensions.ts`, the renderer drawing from it, the label hit-test, the `editLength` event and the moving-end marker, with interaction tests for the label click and its priority.
3. Web app: the inspector's new controls, focusing the field from a label click, the marker while the field has focus, and a panel test.
4. Browser check, full check, `pnpm e2e`, and a new end-to-end test: draw a 4 × 3 room, click the 4.00 m label, type 5, and the room is 5 × 3 with an area of 15 m².
5. Record the result here and mark A1 done in the future plan.

Estimated size: 450 to 550 lines including tests. One go-ahead covers all five steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` pass.
- In headless Chrome, on a 4 × 3 room with a door on the long wall:
  - clicking the "4.00 m" label selects the wall, opens the panel, and selects the Length field's text;
  - with the field focused, the 2D view marks the end that will move; **Move the other end** swaps the marker;
  - typing 5 makes the room 5 × 3 (15 m²) with all corners still square, and the door keeps its distance from the fixed end;
  - with **Keep corners square** off, typing 4 again moves only the corner, and the room is no longer a rectangle;
  - typing 0.05 and typing a length that lands on another corner are refused, and the plan is unchanged;
  - one Undo after typing "5.25" restores the previous length in a single step;
  - in the 3D view, with the wall still selected, typing a length changes the room there too.
- Screenshots of the marker and of the resized room are looked at.

## Not in this change

- Typing a length while drawing a new wall (type a number, Enter places the next corner). This is the other half of exact drawing, and would be a good follow-up.
- Inside (face to face) lengths, units other than metres (A6), and angles.
- Editing a label in place on the canvas, rather than in the panel.
- Moving the furniture against a wall when the wall moves (A3).
- Changing several walls' lengths at once (A2).

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Keep corners square on by default.** Most rooms are rectangles, and bending a neighbour is rarely what someone typing an exact length wants. Off, the edit behaves like a corner drag.
2. **The end corner moves by default,** with a button to swap and a marker showing which end it is. The alternative is to grow from the middle, both ends moving by half, which needs no choice but rarely matches how a room is measured.
3. **Centre-line length,** matching the dimension labels. Architects often quote inside lengths; showing both would need the labels to change too, so it is left for the units work (A6).
4. **Clicking a label opens the panel and focuses Length,** rather than an input box drawn over the canvas. It reuses the panel and works the same in every view; in-place editing can come later.
5. **Typing never merges corners or splits walls,** and lengths that would land a corner on another one are refused. Dragging still merges and splits as it does today.
