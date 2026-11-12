# Properties panel

Status: done. Planned and implemented on 2026-11-12, not yet committed.

Back to the [future plan](future-plan.md), where this is item A0.

## Result

All five steps are done, in about 330 lines changed across the web app, 110 of them the new panel test.

### What was checked

- `pnpm typecheck`, `pnpm test` (451 tests, 88 in the web app, 5 of them new for the panel), `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` (13 tests) pass. The existing unit and end-to-end tests passed without changes.
- In headless Chrome at 1300 × 850, on a room with a door, a window and a sofa:
  - with nothing selected the panel shows the empty state, in 2D and in 3D;
  - a wall, a door, a window and an item each show their fields and actions in both views, with the same values;
  - typed in 2D: a wall thickness of 0.3 and a door width of 1 changed the plan; typed in 3D: a wall height of 3 and a door width of 0.8 did too; "Open to the other side" and "Turn a quarter" worked in both;
  - a door width of 9 m was refused: the field was marked invalid and the door kept its width;
  - the canvas stayed 804 pixels wide through every selection and clearing, and the 2D view did not move;
  - the Properties toggle removed the panel and the canvas grew to 1060 pixels;
  - Delete item in 2D and Delete wall in 3D removed them and cleared the selection, and Undo brought the wall back.
- Screenshots of the item selected in each view were looked at.

### Where the result differs from the plan

- **Each inspector keeps its own heading**, instead of the panel drawing it. The opening inspector's existing test looks for "Door" and "Window" inside the inspector, and keeping the heading there left that test untouched.
- **The 3D hint text still wraps** onto two lines at 1300 pixels wide with both panels open; it is the longest of the hints. The 2D hints fit on one line, where before they were squeezed by the inspector.
- **Delete in the panel goes through the model** (`removeWall`, `removeOpening`, `removeItem`) for all three, so it works the same in either view.
- **"Turn a quarter" and "Open to the other side" show their key** (R, F) as a browser title, not a styled tooltip, now that the buttons carry their own text.

### Open questions, as decided

Always shown with a toggle; a wall selected in 2D keeps its fields in 3D; 256 pixels wide; action buttons with text.

## Goal

The fields that edit the selected wall, door, window or item move from the toolbar into a panel on the right of the editor, in both the 2D and the 3D view. Nothing new can be edited: the panel holds exactly what the three inspectors hold today.

## Why

- The toolbar holds the furniture toggle, undo and redo, the view toggle, the tools, Fit, a line of hint text and an inspector in one 44-pixel row. With an inspector showing, the hint text wraps and is squeezed.
- A row has no room for more fields. Configuring furniture (item C1 in the future plan: size, colour, height above the floor) and typing a wall's length (A1) both need somewhere to put them. The panel is that place.

## What exists today

All of this is in `apps/web/src/features/editor/`; the engine is not involved.

| Component          | Shown when                     | Fields                                                                                                      |
| ------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `WallInspector`    | A wall is selected, in 2D only | Thickness, Height (metres); Delete                                                                          |
| `OpeningInspector` | A door or window is selected   | Width, Height; Sill for a window; "Hinge on the other side" and "Open to the other side" for a door; Delete |
| `ItemInspector`    | An item is selected            | The item's name; Rotation (degrees); "Turn a quarter"; Delete                                               |

Each is a single row with `ml-auto`, rendered inside the toolbar in `Editor.tsx`. The wall inspector sits inside the 2D-only block; the other two are outside it, so they already show in both views. The selection is one store shared by both views, so a wall selected in 2D stays selected after switching to 3D, though nothing shows it.

`WallInspector` and `OpeningInspector` each have their own `MetreField`. The opening's refuses a value that does not fit and puts the real one back on blur; the wall's does neither.

## Design

### Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ ‹ Plans   New Plan                               Saved at 10:42   │  EditorHeader, unchanged
├───────────────────────────────────────────────────────────────────┤
│ Furniture  ↶ ↷  2D 3D  tools  Fit   hint text          Properties │  toolbar: inspectors gone,
├────────────┬─────────────────────────────────────┬────────────────┤  a toggle added at the right
│ Catalogue  │                                     │ Wall           │
│ w-60       │              canvas                 │                │
│            │                                     │ Thickness      │
│            │                                     │ [ 0.15 ] m     │
│            │                                     │ Height         │
│            │                                     │ [ 2.50 ] m     │
│            │                                     │                │
│            │                                     │ [ Delete wall ]│
└────────────┴─────────────────────────────────────┴────────────────┘
```

- The panel is an `aside` of 256 pixels (`w-64`) with a left border, the mirror of the catalogue panel on the left, and scrolls on its own if its content is taller than the window.
- It is always present while it is open, with or without a selection, so the canvas does not change width when something is clicked. With nothing selected it says "Select a wall, door, window or item to edit it."
- A **Properties** toggle button at the right end of the toolbar hides and shows it, matching the **Furniture** toggle at the left end. It starts open.

### Panel content

A heading names what is selected, then the fields are stacked one per row, label above the field, and the actions sit at the bottom.

| Selection | Heading         | Fields              | Actions                                                      |
| --------- | --------------- | ------------------- | ------------------------------------------------------------ |
| Wall      | "Wall"          | Thickness, Height   | Delete wall                                                  |
| Door      | "Door"          | Width, Height       | Hinge on the other side, Open to the other side, Delete door |
| Window    | "Window"        | Width, Height, Sill | Delete window                                                |
| Item      | The item's name | Rotation (degrees)  | Turn a quarter, Delete item                                  |

In the panel the action buttons have room for their text as well as their icon ("Turn a quarter", "Delete wall"), instead of icon-only buttons with tooltips. Their accessible names stay exactly as they are, so the tests keep finding them.

### Code changes

| File                                              | Change                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PropertiesPanel.tsx` (new)                       | The `aside`, the heading, the empty state, and the choice of inspector for the selection. Takes the selected wall, opening or item and the change and delete callbacks, so `Editor.tsx` keeps owning the engine calls.               |
| `MetreField.tsx` (new)                            | One shared field, taken from `OpeningInspector`: label above, input, "m", the `aria-invalid` marking and the reset on blur. The wall fields gain the reset on blur; they never refuse a positive value, so nothing else changes.     |
| `WallInspector.tsx`                               | Column layout; uses the shared field; the Delete button gets its text.                                                                                                                                                               |
| `OpeningInspector.tsx`                            | Column layout; uses the shared field; the two door buttons and Delete get their text.                                                                                                                                                |
| `ItemInspector.tsx`                               | Column layout; the name moves to the panel heading.                                                                                                                                                                                  |
| `Editor.tsx`                                      | The three inspectors leave the toolbar. A `propertiesOpen` state and its toggle button are added. `PropertiesPanel` goes after the canvas inside `main`. Deleting a wall calls `floorplan.removeWall()`, which works in either view. |
| `OpeningInspector.test.tsx`                       | Still passes as it is, since it finds fields by role and name. One test is added for the panel: the empty state, and the right inspector for each kind of selection.                                                                 |
| `e2e/tests/openings.spec.ts`, `furniture.spec.ts` | No change expected: they find "Width in metres", "Rotation in degrees" and "Open to the other side" by label. The e2e viewport is 1400 wide, which leaves 884 pixels of canvas with both panels open.                                |

### What does not change

- What can be edited, the values' limits, and the keyboard shortcuts (`R`, `F`, `Delete`, `Escape`).
- The engine, the plan format, the backend.
- The 2D hint text and the camera hint text stay in the toolbar, with more room than before.

## Steps

1. `MetreField.tsx`, and the three inspectors switched to a column layout that uses it.
2. `PropertiesPanel.tsx` with its test.
3. `Editor.tsx`: remove the inspectors from the toolbar, add the toggle and the panel.
4. Checks, below.
5. Record the result here, and tick item A0 in the future plan.

Estimated size: 200 to 250 lines changed, most of it moved. One go-ahead covers all five steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm build` and `pnpm e2e` pass.
- In headless Chrome, at 1300 × 850:
  - with nothing selected, the panel shows the empty state in 2D and in 3D;
  - selecting a wall in 2D shows Thickness and Height, and typing a thickness changes the wall;
  - switching to 3D with the wall still selected keeps the wall's fields, and a height typed there changes the wall;
  - selecting a door, a window and an item, in 2D and again in 3D, shows the right fields, and each field and button still does what it did;
  - selecting and clearing a selection does not move the plan on screen (the canvas keeps its width);
  - the Properties toggle hides and shows the panel, and the canvas takes the freed width;
  - the toolbar's hint text fits on one line with both panels open.
- A screenshot of each state is looked at, not only the values read back.

## Not in this change

- Any new field: a wall's length (A1), an item's size, colour or height above the floor (C1), units (A6).
- Selecting a wall by clicking it in the 3D view.
- A floating or resizable panel, and remembering whether the panel was open between visits.
- Narrow screens: below about 1000 pixels the two panels crowd the canvas. Both can be hidden by hand; hiding them automatically is left for the touch work (A7).

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Always shown, with a toggle,** and not appearing only when something is selected. A panel that comes and goes would shift the plan sideways on every click.
2. **A wall selected in 2D keeps its fields in the 3D view.** It costs nothing, since the selection is already shared, and it makes the panel behave the same in both views. Walls still cannot be clicked in 3D.
3. **256 pixels wide.** The catalogue is 240. A narrower panel would cramp the door's two buttons with their text.
4. **Action buttons with text** in the panel, instead of the icon-only buttons the toolbar needed.
