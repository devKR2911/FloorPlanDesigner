# Future plan

Status: draft for discussion, written on 2026-11-12. Nothing here is approved or scheduled.

Back to the [project plan](project-setup-plan.md).

## Purpose

Phases 0 to 7 are done. This document lists what could come next, in the order we intend to work: first polish the 2D and 3D features, then move to the user-facing furniture functions (configuring furniture, and an interface for adding furniture to the platform), then accounts and the platform itself.

Each item is a candidate, not a commitment. When we pick one, it gets its own phase file with a detailed plan, following the usual workflow: plan, go-ahead, implement, record.

Sizes are rough: **S** is under a day of work, **M** is one to three days, **L** is more.

## Summary

| Stage | Theme                           | Items | Why this order                                              |
| ----- | ------------------------------- | ----- | ----------------------------------------------------------- |
| A     | 2D editor polish                | 8     | The editor is where every plan starts; small gaps cost most |
| B     | 3D view polish                  | 6     | Makes a finished plan look finished                         |
| C     | Furniture: configure and manage | 6     | The user-facing functions, built on a polished editor       |
| D     | Accounts and platform           | 6     | Needed before others use the app; independent of A to C     |

One item is worth doing before anything else, whatever the order: **D1, continuous integration**. It is small and protects every later change.

## Stage A: 2D editor polish

| #   | Item                                    | What and why                                                                                             | Suggestion                                                                                                                                                 | Size |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A0  | [Properties panel](properties-panel.md) | The fields for the selected wall, door, window or item crowd the toolbar, and there is no room for more. | Move them to a panel on the right, in both views, with no new fields. **Done on 2026-11-12.**                                                              | S    |
| A1  | [Type a wall's length](wall-length.md)  | Exact sizes need careful dragging today.                                                                 | Parked: see the plan file. Changing one wall in a closed room always changes a neighbour; to rethink whether the feature is wanted.                        | M    |
| A2  | Multi-select, copy, paste, nudge        | Only one thing can be selected. Moving a group of furniture, or duplicating a chair, takes many steps.   | Shift-click and drag-box selection; move together; copy, paste and duplicate; arrow keys nudge by the grid step.                                           | L    |
| A3  | Furniture follows its wall              | Moving a wall leaves the items against it behind, and they then show as overlapping.                     | Remember which wall an item was snapped to and carry it when the wall moves.                                                                               | M    |
| A4  | Smarter collisions                      | Items are not checked against doors and door swings; dragging into a collision is only a warning.        | Flag an item in a doorway or a swing. Optionally slide a dropped item to the nearest free place, behind a setting.                                         | M    |
| A5  | [Room names](room-names.md)             | Rooms show only their area.                                                                              | **Done on 2026-11-12.** A name record anchored to a point inside the room, shown over the area label and edited in the properties panel.                   | S    |
| A6  | [Units](units.md)                       | Lengths are metres only.                                                                                 | A display unit per plan: metres or feet and inches. Everything is still saved and calculated in metres; furniture stays in metres. **Done on 2026-11-13.** | M    |
| A7  | Touch in 2D                             | No pinch zoom, so the editor is awkward on a tablet.                                                     | Two-finger pinch and pan in the 2D editor.                                                                                                                 | M    |

## Stage B: 3D view polish

| #   | Item                               | What and why                                                                                       | Suggestion                                                                                                                                               | Size |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1  | Materials: wall paint and floors   | The 3D view is one tone. This is the biggest gap in how a finished plan looks.                     | A colour per wall side and a finish per room floor (a small set of colours and textures), stored in the plan. The wall faces are already grouped for it. | L    |
| B2  | Doors and windows on lowered walls | In orbit mode they vanish with the cut-away wall unless selected.                                  | Show the frame at the lowered height, or draw the opening as an outline.                                                                                 | S    |
| B3  | Tight overlap warning in 3D        | The red box is still the item's full bounding box, though the check now uses the real outline.     | Draw the warning from the footprint, or tint the model itself.                                                                                           | S    |
| B4  | Walk mode                          | Furniture does not block the walker; a room with no door traps the walker with no hint; no touch.  | Furniture footprints as obstacles; a hint when the room has no door; on-screen controls for touch.                                                       | M    |
| B5  | Wall-mounted and ceiling items     | Mirrors, wall lamps, upper cabinets and ceiling lights cannot be placed. The schema has the types. | Placement on a wall face at a height, and on the ceiling; both views; a few starter items.                                                               | L    |
| B6  | Lighting and view options          | One fixed sun.                                                                                     | Time-of-day or a few lighting presets; a toggle for full-height walls instead of the cut-away.                                                           | S    |

## Stage C: furniture, configure and manage

This is the user-related work: changing a placed piece of furniture, and adding furniture to the platform without editing files.

| #   | Item                       | What and why                                                                                         | Suggestion                                                                                                                                                                                                | Size |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| C1  | Configure a placed item    | A placed item can only be moved and turned.                                                          | In the item inspector: resize (width, depth, height, within limits), colour or material where the model allows, and height above the floor. Stored per item in the plan.                                  | M    |
| C2  | Catalogue panel            | Items are added by a click and land mid-view; the list is one long scroll.                           | Drag from the panel onto the canvas, search, collapsible categories, recently used.                                                                                                                       | M    |
| C3  | Catalogue in the database  | The catalogue is a generated file in the web app, so adding an item needs a developer and a rebuild. | Catalogue items and their files served by the backend. The engine already takes definitions through `setCatalog()`.                                                                                       | M    |
| C4  | Interface to add furniture | No way to add a model from the app.                                                                  | An "Add furniture" screen: upload a GLB, name and category, preview in 3D, size and footprint measured automatically (the build script's logic, moved to the backend), thumbnail rendered from the model. | L    |
| C5  | Manage the catalogue       | Follows C4.                                                                                          | Edit, hide and delete items; a hand-drawn footprint for shapes that are not convex; what happens to plans that use a deleted item.                                                                        | M    |
| C6  | More starter content       | 34 items from one kit.                                                                               | More CC0 kits through the existing build, as a stopgap before C4.                                                                                                                                         | S    |

C3 and C4 need somewhere to keep uploaded files, which is the object storage question in Stage D (D4). C4 and C5 also need to know who may add furniture, which depends on accounts (D2).

## Stage D: accounts and platform

| #   | Item                     | What and why                                                                                       | Suggestion                                                                                         | Size |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---- |
| D1  | Continuous integration   | The checks run only when someone remembers. A broken end-to-end test went unnoticed for a day.     | A GitHub Actions workflow: typecheck, lint, tests, build and the end-to-end suite on every push.   | S    |
| D2  | Login and per-user plans | Every plan is visible to anyone who can reach the app. This is the existing Phase 8.               | Accounts, an owner column on plans, routes limited to the owner. A role for who may add furniture. | L    |
| D3  | Export, import and print | A plan cannot leave the app.                                                                       | PNG and PDF of the 2D plan with dimensions; the 3D picture; the plan as a JSON file, in and out.   | M    |
| D4  | File storage             | Models are static files in the web app; uploads (C4) need a real home.                             | Object storage behind the backend, with the catalogue pointing at it.                              | M    |
| D5  | Save conflicts           | With a plan open in two tabs, the last save silently wins.                                         | Compare `updatedAt` on save and offer to reload or overwrite.                                      | S    |
| D6  | Housekeeping             | No README; the plan list loads 579 kB and the editor 771 kB; the engine's publishing is undecided. | A README; split the bundles and load the 3D view on first use; decide public or private npm.       | S    |

## Dependencies

- **C3 → C4 → C5:** the catalogue must live in the backend before it can be edited from the app.
- **D4 → C4:** uploads need file storage.
- **D2 → C4, C5:** deciding who may add furniture needs accounts. C4 can be built first for a single-user app and restricted later.
- **B5 → C1:** height above the floor in the item inspector is the same data that wall-mounted items use.
- **A4 and B4** share the "furniture knows about doors" logic.

Everything in Stages A and B is independent of C and D.

## Proposed order

1. D1 (continuous integration), since it is small and protects the rest.
2. Stage A: A1, A3, A4, A5, A6, then A2 and A7.
3. Stage B: B1, B2, B3, then B4, B5, B6.
4. Stage C: C1 and C2, then C3, C4 and C5 together with D4. C6 whenever more items are wanted.
5. Stage D: D2, D3, D5, D6.

## To decide together

1. **Is the Stage A and B order right?** For example, materials (B1) could come before multi-select (A2) if looks matter more than editing speed.
2. **"Configuring the furniture":** this document reads it as changing a placed item (C1). If it means something else, such as setting up catalogue items, C1 and C5 change.
3. **Who adds furniture (C4):** you alone, as the platform's owner, or every user for their own plans? This decides whether C4 waits for login.
4. **Where uploaded models are kept (D4):** a folder on the server is simplest; a cloud bucket scales better.
5. **Should login (D2) move earlier** if anyone other than you will use the app soon?
6. **Phase numbering:** continue from Phase 8, or number the new work by stage (A1, B1 and so on) as here.
