# Units

Status: done. Planned and implemented on 2026-11-13, not yet committed.

## Result

All five steps are done, in about 880 lines added, 500 of them tests.

### What was checked

- `pnpm typecheck`, `pnpm test` (508 tests: 372 engine, 13 shared, 22 backend, 101 web), `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` (15 tests, one of them new) pass. The existing unit tests passed without changes.
- In headless Chrome, on a plan made for the check and deleted afterwards:
  - a new plan is in metres with the 0.1 m and 0.05 m steps; a 4 × 3 m room drawn in it is saved with no `units` field;
  - the toolbar toggle switches to feet: the corner step and the door and window step become 0.0254 m, the furniture step stays 0.1 m, the grid shows 1 ft squares with 3 in lines, the wall labels read `13' 1 1/2"` and the room area `129 ft²`;
  - the switch is saved by itself (`units: "imperial"`), and the saved corners and walls are identical to before it;
  - a wall drawn in feet mode from off-grid points is 71 in long with both ends on whole inches; a door dragged along its wall lands on 126 in;
  - a wall's fields read 0 ft 5.875 in and 8 ft 2.375 in; typing 8 ft 0 in sets the height to 2.4384, and 2 ft 8 in sets a door's width to 0.8128; 0 ft 0 in is marked invalid and changes nothing;
  - one Undo after typing the door width puts back 0.9;
  - switching back to metres and one Undo returns to feet, with the snap steps following both ways;
  - the plan is still in feet after a reload, and the fields are in feet in the 3D view too;
  - the New plan dialog shows the Units switch on Metres.
- Screenshots of the feet plan with the wall panel and of the dialog were looked at.

### Not checked by eye

- The two distances shown while dragging a door in feet mode: they use the same formatter as the wall labels, but no screenshot was taken mid-drag.
- A metre plan was not compared pixel by pixel with a picture from before the change; the grid lines are covered by the `gridLines` tests.
- Furniture on its 0.1 m step was read from the engine's setting, not shown by a drag: the test drag ended against a wall, where the wall snap decides the position.

### Where the result differs from the plan

- **The unit reaches the fields through a React context** (`units-context.ts`) instead of a prop on every inspector, so the existing inspector tests run unchanged in metres.
- **A metre plan is saved without the `units` field**, not with `units: "metric"`. Plans saved before and after this change are then identical, and the existing tests that compare whole documents did not need touching.
- **The toolbar toggle has browser titles, not styled tooltips**, like the other text buttons since the properties panel.
- **The engine's snap steps follow the plan's unit on every change**, including a loaded plan and an undo, not only on `setUnits()`. `engine.ts` has no unit test (it needs WebGL); this is covered by the browser check and the end-to-end test.
- **An end-to-end test that was already failing was repaired.** The door test in `openings.spec.ts` failed before this work started: adding a door opens the properties panel, the canvas narrows, and the test read the door's place on screen before the editor had followed. `onScreen` in `e2e/support.ts` now waits for the editor to match the canvas. The app was not at fault.

### Open questions, as decided

New plans choose their unit in the dialog, starting on metres; the grid follows the unit (1 ft squares, 3 in lines, whole-inch snapping); feet and inches show to the nearest ⅛ inch; no furniture size is shown; a unit switch is one undo step.

Back to the [future plan](future-plan.md), where this is item A6.

## Goal

Each plan has a display unit: **metres** or **feet**. In feet mode the wall labels read `9' 10"`, room areas read `129 ft²`, the wall, door and window fields take feet and inches, and the grid and snapping work in whole inches.

The unit is display only:

- **Every value is saved in metres**, as today, whichever unit is chosen.
- **Every calculation is in metres**, as today. Feet and inches are worked out only at the moment a value is shown or typed.
- **The plan saves one extra field**, the display unit, so a plan opens in the unit it was last viewed in.

**Furniture stays in metres** in both modes: its sizes, its snapping and its calculations do not change.

What does not change: the saved measurements, the database table, the backend routes, the 3D view, and how a metre plan looks and behaves.

## Decisions made on 2026-11-13

- Save only in metres. (Saving centimetres or inches per plan was considered and dropped as too complex: it needed a new plan format, conversion on every open and save, and a unit check by everything that reads a plan later.)
- The display unit is saved in the plan. It can move to the user's settings when login exists.
- Feet are typed in two number boxes, one for feet and one for inches.
- Furniture is not converted.
- The New plan dialog has a metres / feet switch, set to metres.

## Design

### Where the code lives

| Part                                   | Place                                                               |
| -------------------------------------- | ------------------------------------------------------------------- |
| The `units` field in the plan          | `packages/floorplan-engine/src/schema/plan.ts`                      |
| Formatting, feet and inches, grid      | `packages/floorplan-engine/src/model/units.ts` (new)                |
| The plan's unit, and switching it      | `model/floorplan.ts`, `engine.ts`                                   |
| Labels and grid                        | `editor/renderer.ts`, `editor/room-labels.ts`                       |
| The unit switch in the New plan dialog | `apps/web/src/features/plans/PlanDialogs.tsx`, `PlanListScreen.tsx` |
| Toolbar control and fields             | `apps/web/src/features/editor/`                                     |

### The plan format

One optional field is added, and the version stays 1:

```jsonc
{
  "version": 1,
  "units": "imperial", // or "metric"; missing means "metric"
  "corners": [
    { "id": "c1", "x": 0, "y": 0 },
    { "id": "c2", "x": 3.048, "y": 0 },
  ],
  "walls": [{ "id": "w1", "start": "c1", "end": "c2", "thickness": 0.1524, "height": 2.4384 }],
}
```

Every plan saved so far has no `units` field and opens as a metre plan, unchanged. There is no migration, and the backend needs no change: it validates with the same schema and stores the document as it is.

A whole inch is exactly 0.0254 m, so values typed in feet and inches survive saving and reopening exactly.

### `model/units.ts`

```ts
export type UnitSystem = 'metric' | 'imperial'

export function formatLength(metres: number, units?: UnitSystem): string
export function formatArea(squareMetres: number, units?: UnitSystem): string
/** Splits a length for the two boxes: whole feet, and inches to the nearest ⅛. */
export function toFeetAndInches(metres: number): { feet: number; inches: number }
export function fromFeetAndInches(feet: number, inches: number): number
/** Snap steps and grid lines for walls, doors and windows, in metres. */
export function unitGrid(units: UnitSystem): UnitGrid
```

`formatLength` and `formatArea` exist today with one argument; they move here and keep `metric` as the default. These functions are the only place feet and inches are worked out.

| Value  | Metres (as today) | Feet                                                                                     |
| ------ | ----------------- | ---------------------------------------------------------------------------------------- |
| Length | `3.00 m`          | To the nearest ⅛ inch, dropping parts that are zero: `9' 10"`, `10'`, `6"`, `9' 10 1/8"` |
| Area   | `12.0 m²`         | Whole square feet: `129 ft²`                                                             |

Rounding carries properly: 11.97 inches shows as `1'`, never `0' 12"`.

**Grid and snapping** (all steps are held in metres)

| Setting                           | Metres (as today) | Feet              |
| --------------------------------- | ----------------- | ----------------- |
| Corner snap step                  | 0.1 m             | 1 in (0.0254 m)   |
| Door and window step along a wall | 0.05 m            | 1 in              |
| Major grid lines                  | 1 m               | 1 ft              |
| Minor grid lines, when zoomed in  | 0.1 m             | 3 in              |
| Furniture placement step          | 0.1 m             | 0.1 m (unchanged) |

In a feet plan, furniture therefore does not land on the grid lines; it still snaps flush to walls within 0.2 m, which is what matters when placing it.

### Engine

- `Floorplan` holds `units` (default `metric`), sets it from a loaded plan, writes it in `export()`, and gets `setUnits(units)`, which emits a change of kind `units`.
- Switching the unit changes the plan, so it is autosaved like any other change and is one undo step. No measurement changes: a 3.00 m wall stays 3.00 m and is shown as `9' 10 1/8"`.
- `engine.units` and `engine.setUnits()` pass through to the floor plan. On a change the engine swaps the corner and opening snap steps for the ones in `unitGrid`, and the editor redraws. A snap step given explicitly in the engine's options still wins.
- `renderer.ts`: the four `formatLength` calls (wall lengths, the draw preview, the two distances while dragging a door or window) and the area label use the plan's unit.
- `drawGrid` assumes a 0.1 step and finds major lines by testing for whole numbers. It changes to count lines by index from a `{ minor, major }` pair, which gives the same lines in metres and correct ones for 3 in / 1 ft.
- The 3D view shows no numbers; its grid stays at 1 m squares.

### Web app

- **New plan dialog:** under the name field, a two-way switch labelled "Units" with the options "Metres" and "Feet", set to metres each time the dialog opens. The new plan is created with the chosen unit in its document, so the editor opens in it. The dialog is shared with Rename, which does not show the switch; the unit of an existing plan is changed in the editor.
- **Duplicate** keeps the unit of the plan it copies, since it copies the whole document.
- **Toolbar control:** a two-way toggle, `m` and `ft`, next to the 2D/3D toggle, with the tooltip "Units: metres" / "Units: feet and inches". It reads `engine.units` and calls `engine.setUnits()`.
- **`LengthField`** replaces `MetreField` in the wall and opening inspectors (thickness, height, width, sill):
  - metres: the number field as it is today;
  - feet: two number boxes, "ft" and "in".
    - Feet: whole numbers, arrows step by 1, minimum 0.
    - Inches: arrows step by 1, decimals allowed for part inches (`2.375`), shown to at most three decimals.
    - Changing either box commits both together, as metres. A total below the minimum, or one the model refuses, marks both boxes invalid; leaving the field puts the real value back.
    - An empty box counts as 0 while the other holds a value.
    - Inches of 12 or more are accepted and carried into feet when the field is left (`14` becomes 1 ft 2 in).
- **Room inspector:** the area in the plan's unit.
- **Item inspector:** unchanged (open question 4).

### What gets a test

- **Schema:** a plan without `units` is read as metric; an unknown unit is refused; `units` survives load and export.
- **`units.ts`:** formatting (zero parts dropped, the ⅛ rounding, the carries at 12 inches and at a whole foot, values under an inch, area); the feet-and-inches split and its round trip; `unitGrid`.
- **Floor plan and history:** `setUnits` emits one change and moves nothing; undo and redo of a unit switch; a load sets the unit.
- **Editor:** in a feet plan a dragged corner and a door land on whole inches, and a piece of furniture still lands on 0.1 m.
- **Renderer:** grid line positions for both units, from a small exported helper.
- **Web:** `LengthField` in both units (commits 3 ft 6 in as 1.0668 m, an empty box as 0, the carry of 14 in on blur, a too-small value marked invalid, restore on blur); the toggle; the room area in ft²; the New plan dialog starts on metres, creates a plan with `units: 'imperial'` when Feet is chosen, and shows no switch when renaming.
- **End to end:** create a plan with Feet chosen in the dialog and find the editor in feet; draw a room, set a wall thickness of 0 ft 8 in, wait for the save, and read the plan back from the backend: `units` is `imperial` and the thickness is `0.2032`. Reload and find the editor still in feet.

## Steps

| #   | Step                                                                                        | Size (lines, with tests) |
| --- | ------------------------------------------------------------------------------------------- | ------------------------ |
| 1   | `model/units.ts`: formatting, feet and inches, `unitGrid`; move the two formatters; tests   | 230                      |
| 2   | `units` in the plan schema and the floor plan, `setUnits`, engine wiring, snap steps; tests | 190                      |
| 3   | Renderer: labels and areas by unit; grid lines from `{ minor, major }`; tests               | 100                      |
| 4   | Web: the New plan switch, the toolbar toggle, `LengthField`, the room area; tests           | 330                      |
| 5   | End-to-end test; browser check; record the result                                           | 70                       |

About 920 lines, a little over half of them tests. One go-ahead covers all five steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` pass.
- The existing unit and end-to-end tests pass without changes, and a metre plan's screenshot matches today's.
- In headless Chrome, on plans made for the check (your own plans are not touched):
  - the New plan dialog shows the switch on metres; a plan created with Feet opens in feet, and one created without touching the switch opens in metres;
  - switching to feet in the toolbar changes every wall label, the room area and the wall and door fields, shows 1 ft grid squares, and is saved by itself; one Undo switches back;
  - no corner, wall or opening value in the saved plan changes when the unit is switched;
  - a wall drawn in feet mode has a length in whole inches, and its label shows no fraction;
  - dragging a door shows its two distances in feet and inches;
  - 8 ft 0 in as a wall height and 2 ft 8 in as a door width are saved as 2.4384 and 0.8128; a door width of 0 ft 0 in is marked invalid and changes nothing;
  - a sofa added to the feet plan moves in 0.1 m steps, as in a metre plan;
  - the plan is still in feet after a reload, while another plan stays in metres.
- A plan drawn in metres (walls of 3.00 m and 4.00 m) reads `9' 10 1/8"` and `13' 1 1/2"` after switching to feet.

## Not in this phase

- **Furniture in feet,** by decision.
- **The unit as a user setting:** planned for when login exists (D2).
- **Centimetres or millimetres** as a display option.
- **The 3D grid** stays in 1 m squares.
- **Typing a wall's length** (A1, parked). When it comes back it will use `LengthField`.

## Open questions

Each has the default that will be implemented unless you say otherwise.

1. **New plans.** Decided on 2026-11-13: the New plan dialog has a metres / feet switch, set to metres.
2. **The grid in feet mode.** Default: 1 ft squares with 3 in lines, and walls, doors and windows snap to whole inches. Without this, a wall drawn in feet mode would read like `9' 10 1/8"`.
3. **Precision shown in feet mode.** Default: the nearest ⅛ inch, fractions hidden when zero. The alternative is whole inches, which hides up to half an inch on plans drawn in metres.
4. **Furniture size on screen.** Default: nothing new; the item panel shows no size today. The alternative is a read-only size line in metres.
5. **Undoing a unit switch.** Default: it is one undo step, since it changes the plan.
