# Phase 4: catalogue and furniture

Status: done. Planned and implemented on 2026-11-11, not yet committed.

Back to the [project plan](project-setup-plan.md).

## Result

All eight steps are done. About 2,750 lines were added across the engine, the shared package and the web app, 730 of them tests; the estimate was 2,600 to 3,200. The 34 starter models, their thumbnails and the kit's licence add 0.9 MB of static files.

### The kit as downloaded

- The kit was downloaded by hand into a folder at the root of the repository, `kenney_furniture-kit/`. Its licence file says CC0 and calls it version 2.0 (the web page says 1.0).
- It includes GLB files for all 140 models, so nothing was converted. They use no Draco compression and no textures.
- **Units:** the models are about half real size: a double bed measures 0.96 × 1.13 and a fridge stands 0.92 high. `sources.json` sets a scale of 2, which gives realistic sizes for almost every item.
- **Facing:** the models face `+z`, the glTF convention, which is the plan's rule that an item's back faces up the page at rotation 0.
- **Materials:** the models use unlit materials, which would look flat beside the lit walls. The model library swaps them for lit materials of the same colour.
- **Thumbnails:** the kit's `Isometric/<name>_SW.png` view, which shows each model from the front, is used as is.

### What was checked

- `pnpm typecheck`, `pnpm test` (264 tests: 214 in the engine, 37 in the web app, 8 in the shared package, 5 in the backend), `pnpm lint`, `pnpm format:check` and `pnpm build` pass. The `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover the item operations, every placement rule, the overlap tests, the new 2D gestures (drag, turn by handle, `R`, delete, Alt), the shared selection, model scaling and re-centring, loading each file once, the stand-in box and load errors, and the item scene following the model.
- The web app has its first tests: the manifest passes `catalogManifestSchema`, lists every source item, every model and thumbnail it names exists, sizes are realistic, and the licence file is there.
- In headless Chrome, driven through the DevTools protocol:
  - a 5 m × 4 m room drawn with the mouse; the panel shows 34 items with their thumbnails;
  - a sofa added from the panel appears at the view's centre, selected, with the inspector showing it;
  - dragged up in 2D, it sits with its back flush against the north wall's inside face; dragged right, it sits in the north-east corner against both walls, at the position the wall faces predict;
  - `R` turns it a quarter, and dragging the rotate handle turns it back;
  - two chairs added in the same spot overlap and show in red;
  - in 3D, the sofa, a double bed, two chairs and a fridge appear as their models at catalogue size, an item with an unknown key appears as a grey box, and the four distinct model files are each fetched once, and only when the 3D view is first shown;
  - dragging the sofa in 3D moves it on the plan without moving the camera; it then overlaps the bed and both get red outlines in 3D and red fills in 2D;
  - `R` and `Delete` work in 3D; dragging empty space still orbits; a click on empty space clears the selection; a selection made through the engine shows in the 2D editor;
  - saved and reloaded, the five items come back in place, models load again, and the unknown item is kept;
  - the round table (an octagon in the kit), the washbasin and the corner sofa look right in 3D;
  - the Phase 3 browser check still passes; no console errors.
- Parts of the 3D check were set up by script rather than by hand: the room and the item positions for the 3D scene were set through the engine's API, and the 3D selection test called `engine.select()`.

### Where the result differs from the plan

- **Rugs are left out** of the starter set. A rug under a table would always be flagged as an overlap, and stacking items is not in this phase.
- **`ItemCatalog`** is a small class in the model holding the definitions, shared by the 2D editor, the 3D view and the engine. Items with an unknown key use a fallback size of 0.5 m.
- **Overlaps win over selection in 3D:** a selected item that overlaps shows the red outline, not the blue one. In 2D the fill shows the overlap and the outline shows the selection.
- **Adding an item does not avoid other items.** It goes to the centre of the view, snapped to a wall if one is near, even if something is already there; it then shows red.
- **In 3D, `Escape` clears the selection**, and a press on empty space that does not move clears it too.
- **The engine clears a selection whose target is removed**, from either view or by code, and `engine.select()` refuses ids that do not exist.
- **The web app gained Vitest and `@types/node`** as dev dependencies for its manifest test. Both were already in the workspace, so nothing new was downloaded.
- **The Draco decoder is now in the web build twice.** Three.js 0.187's `DRACOLoader` has built-in default decoder URLs, which Vite bundles as hashed assets, besides the copy in `/draco/` that the engine is told to use. The bundled copy is never downloaded while `dracoPath` is set, but it adds about 1.3 MB of unused files to `dist`. The kit's models do not use Draco at all.
- **The web bundle is 1.19 MB (331 kB gzipped)**, and Vite warns about it. The size before this phase was not measured.

### Known rough edges

- Moving a wall does not move the items against it, as planned; they are left where they were and may then show as overlapping.
- The 2D room area label can sit under an item.

### Open questions, as decided

All six defaults were implemented as written: floor items only, items move in both views, overlaps flagged not refused, item positions in plan coordinates, 34 starter models added by clicking, and snapping at 0.2 m to a wall, the 0.1 m grid and 15° steps.

## Goal

Furniture can be picked from a catalogue and placed in the plan. An item is added from a panel in the web app, then moved, rotated and deleted in the 2D editor or in the 3D view, and it snaps against walls. The 3D view shows the real model; the 2D editor shows its outline. Items are saved with the plan.

This phase covers items that stand on the floor. Items that hang on a wall or from the ceiling come with doors and windows in Phase 5, which builds the wall attachment they need.

## What the reference project does

The `blueprint3d` folders are not on this machine, so this is from memory, not a fresh read.

- Items are dragged in the 3D view only. Each item type (floor, wall, in-wall) is a class that owns its mesh and its own placement rules.
- A position that collides is refused: the item turns red and stays at its last valid position.
- Models are loaded per item, and the plan stores the model URL.

What we keep: dragging across the floor in 3D, and snapping an item's back against a wall. What changes: the placement rules are pure functions shared by the 2D editor and the 3D view; items can also be moved in 2D, where the rest of the editing happens; a plan stores a catalogue key, not a URL; and each model file is loaded once and reused.

## The Kenney Furniture Kit

Checked on its page on 2026-11-11: the licence is CC0, the kit is version 1.0 from 2018, and it holds 140 files. The page does not state the file formats, the units of the models or the size of the download. These are checked when the kit is downloaded:

- **Format.** If the kit includes GLB files, they are used as they are. If it has only OBJ or FBX, a one-off script converts the chosen models to GLB.
- **Units.** The kit's models are not assumed to be in metres. The catalogue records each item's real size in metres, and the engine scales a loaded model to that size, so the units of the file do not matter.
- **Thumbnails.** If the kit ships preview images, those are used. If not, a one-off script renders one per model with the engine.

The download itself needs your approval when the phase starts. The page has no direct file link (it opens a donation prompt first), so you may need to download the archive yourself and point me at it.

A starter set of about 30 models is chosen across living room, bedroom, kitchen, bathroom and office, not all 140. The kit's licence file is stored next to them.

## Design

### Where it lives

```
packages/floorplan-engine/src/
 ├─ schema/
 │   ├─ plan.ts              item position changes to plan coordinates (below)
 │   └─ item-definition.ts   new: what the engine needs to know about a catalogue item
 ├─ model/
 │   ├─ floorplan.ts         item operations
 │   ├─ item-geometry.ts     new, pure: an item's outline, overlap tests
 │   └─ placement.ts         new, pure: snapping an item to walls and the grid
 ├─ core/selection.ts        new: one selection shared by the 2D editor and the 3D view
 ├─ editor/                  items drawn, hit, dragged and rotated in 2D
 ├─ view3d/
 │   ├─ model-library.ts     new: loads each GLB once, scales it, hands out copies
 │   ├─ item-scene.ts        new: keeps item objects in step with the Floorplan
 │   └─ item-dragging.ts     new: picking and dragging items in the 3D view
 └─ engine.ts                setCatalog(), addItem(), selection

packages/shared/src/catalog.ts      the catalogue schema extends the engine's item definition
apps/web/
 ├─ public/models/                  the GLB files, thumbnails and the licence
 ├─ scripts/build-catalog.mjs       measures the models and writes the manifest
 └─ src/features/catalog/           the catalogue panel
```

### Save format

An item's position moves into plan coordinates, like everything else in a plan:

```ts
{
  id: string
  catalogKey: string
  position: {
    x: number
    y: number
  } // metres on the plan, the centre of the item
  elevation: number // metres above the floor, 0 for floor items
  rotation: number // radians, counter-clockwise on the plan
}
```

Today the format stores a 3D position (`x`, `y` as height, `z`). No plan with items can exist yet, because nothing could add one, so the shape changes without raising the format version. At rotation 0 an item's width runs along plan `x`, and its back faces plan `+y` (up the page), which matches the forward direction of glTF models.

### Item definitions and the catalogue

The engine must know an item's size and model URL but must not own the catalogue. So the engine defines the minimum and the app supplies it:

```ts
// engine: schema/item-definition.ts
{ key, model, size: { width, height, depth }, placement }

engine.setCatalog(definitions) // the app passes its catalogue in
```

The shared package's `catalogItemSchema` becomes the engine's definition plus `name`, `category` and `thumbnail`, so the two cannot drift apart. Dependencies still run one way, from shared to engine.

An item whose key is not in the catalogue stays in the plan and is drawn as a grey 0.5 m box, so opening a plan with an older or different catalogue loses nothing.

### `Floorplan`: item operations

```ts
fp.addItem({ catalogKey, position, rotation? }) // returns the id
fp.updateItem(id, { position?, rotation?, elevation? })
fp.removeItem(id)
fp.getItem(id)
```

Each fires one `change` event with the new kind `items`. Rooms are not recomputed for item changes. Moving a wall does not move the items near it.

### `item-geometry.ts` and `placement.ts`: pure rules

`item-geometry.ts` gives an item's outline on the plan (a rotated rectangle from its width and depth) and tests whether it overlaps a wall or another item.

`placement.ts` takes an item's size, the position the pointer asks for, and the plan, and returns where the item goes. The first rule that matches wins:

1. **Wall snap.** When the item's back is within 0.2 m of a wall face, the item turns to line up with the wall and sits with its back flush against it. Near a corner of a room it sits flush against both walls.
2. **Grid snap.** Otherwise the position rounds to the 0.1 m grid and the rotation is kept.

Holding `Alt` turns snapping off, as for walls. Rotation by hand moves in 15° steps, or freely with `Alt`.

**Overlaps are allowed but flagged.** An item that overlaps a wall or another item is drawn in a warning colour in both views; it is not refused. This keeps dragging smooth, never leaves an item stuck, and one overlap test covers walls and items alike.

### Selection

The selection moves from the 2D editor into a small shared store, so an item selected in one view is selected in the other. `editor.selection` and its event keep working, and `engine.selection` and `engine.on('selection')` are added. A selection is a corner, a wall or an item.

### 2D editor

- **Drawing:** each item as its outline with a thicker line along its front, drawn above the rooms and below the walls. Hovered, selected and overlapping items use their own colours. The selected item shows a round rotate handle beyond its front edge.
- **Hit testing:** corners first, then items, then walls.
- **Move mode:** drag an item to move it with the placement rules; drag the rotate handle to turn it; `R` turns the selection 90°; `Delete` removes it.
- **Delete mode:** a click removes the item under the pointer.

The interaction state machine gains two gestures (drag item, rotate item), each tested like the wall gestures.

### 3D view

- **`model-library.ts`:** loads a GLB with Three.js's `GLTFLoader`, with `DRACOLoader` attached so compressed models work. The decoder path is a new engine option, `dracoPath`, and the decoder is only fetched if a model needs it. Each file is loaded once; items get copies that share geometry and materials. A loaded model is scaled to its catalogue size and re-centred so its origin is the middle of its base.
- **`item-scene.ts`:** one object per item, updated in place when an item moves, so dragging does not reload or copy anything. While a model loads, and if it fails to load, the item shows as a box of its catalogue size. A failure also raises an `itemError` event for the app to report. Walls and floors are no longer rebuilt when only items change.
- **`item-dragging.ts`:** in orbit mode, pressing on an item selects it and dragging moves it across the floor: the pointer's ray is intersected with the floor plane and the result goes through the same placement rules as in 2D. Orbiting is paused during the drag. The selected item gets a thin box outline. `R` and `Delete` work as in 2D. Pressing on anything else orbits as before. Nothing is draggable in walk mode.

### Engine

```ts
new FloorplanEngine({ view3d, view2d, dracoPath: '/draco/' })
engine.setCatalog(definitions)
engine.addItem('sofa-long')        // placed at the centre of what the active view shows, and selected
engine.selection
engine.on('selection', ...)
engine.on('itemError', ...)
```

### Web app

- **Catalogue data:** `build-catalog.mjs` reads a short hand-kept list (file, name, category), measures each GLB, and writes `manifest.json`, which is validated by `catalogManifestSchema` in a test. Sizes are never typed by hand.
- **Catalogue panel:** a collapsible side panel listing items by category with thumbnails. Clicking an item adds it to the plan and selects it, ready to drag. Dragging from the panel onto the canvas is left for later.
- **Item inspector:** for a selected item, its name, a rotation field in degrees, a rotate-90° button and Delete, in the toolbar where the wall inspector appears.
- A failed model load shows a small message with the item's name.

## Steps

1. Download and inspect the kit; choose the starter set; `build-catalog.mjs`, the manifest, thumbnails and the licence file.
2. Save format change, item definitions in the engine, the shared schema built on them; tests.
3. `Floorplan` item operations, `item-geometry.ts` and `placement.ts`; tests.
4. Shared selection; items in the 2D editor: drawing, hit testing, drag, rotate, delete; tests.
5. `model-library.ts` and `item-scene.ts`: items appear in 3D; tests with a stand-in loader.
6. `item-dragging.ts`: select, drag, rotate and delete in the 3D view; tests for the ray and placement maths.
7. Web app: catalogue panel, item inspector, `setCatalog`, `dracoPath`, error message.
8. Browser check, then this file and the project plan are updated with the result.

Estimated size: 2,600 to 3,200 lines including about 900 of tests, plus the model files. This is the largest phase so far. One go-ahead covers all eight steps.

## How it will be checked

- `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` and `pnpm build` pass; the `./model` and `./schema` entries still do not load Three.js.
- Unit tests cover the item operations, every placement rule, the overlap tests, the new interaction gestures, model scaling and re-centring, and the item scene following the model.
- The manifest passes `catalogManifestSchema`, and every model and thumbnail it names exists.
- In headless Chrome:
  - add a sofa from the panel and it appears in 2D as an outline and in 3D as the model, at its catalogue size;
  - drag it near a wall in 2D and it turns and sits flush; in a corner it sits against both walls;
  - rotate it with the handle and with `R`; delete it with `Delete` and in Delete mode;
  - drag it in the 3D view and its position in 2D follows;
  - select it in one view and it is selected in the other;
  - push it into a wall and into another item and it shows the warning colour in both views;
  - add the same model twice and the file is fetched once;
  - a plan item with an unknown key shows as a grey box and survives a save;
  - save, reload, and the items come back in place.
- The Phase 2 and Phase 3 browser checks still pass.

## Not in this phase

- Wall-mounted and ceiling items, and doors and windows (Phase 5).
- Refusing overlaps, and items that stack on other items (a lamp on a table).
- Items that follow a wall when the wall is moved.
- Resizing an item, changing its colour or material, and shadows.
- Dragging from the catalogue panel onto the canvas, search in the catalogue, and uploading your own models.
- Multi-selection, copy and paste, and undo and redo (Phase 7).
- Moving models to object storage. They stay static files in the web app.

## Open questions

The defaults below will be implemented unless you say otherwise.

1. **Floor items only.** Wall and ceiling items wait for Phase 5, which builds wall attachment for doors and windows anyway.
2. **Items move in both views.** Dropping 3D dragging (step 6) would cut about 350 lines and leave 3D for looking only, as it is today.
3. **Overlaps are flagged, not refused.** The alternative is the reference's rule: an item cannot be dropped where it collides.
4. **Item positions are stored in plan coordinates**, replacing the 3D position in today's format.
5. **About 30 starter models**, added by clicking in a side panel.
6. **Snap distances:** 0.2 m to a wall, the 0.1 m grid, and 15° rotation steps.

## Later changes

- **2026-11-12: items have a footprint, their real outline on the floor.** Overlap checks, clicking and the 2D drawing used each item's full width by depth, so a chair on the diagonal of the round table, or in the open corner of an L-shaped sofa, was shown in red. An item definition may now carry a `footprint`: a list of convex polygons in the item's own frame. `build-catalog.mjs` measures it from each model's vertices (the round table turned out to be a hexagon) and leaves it out when the model all but fills its rectangle; the corner sofa, the sofa with chaise and the corner desk have two overlapping rectangles written in `sources.json`, since an L is not convex. 12 of the 34 items have one. `findOverlaps()`, `itemAt()` and `findFreeSpot()` work piece by piece, `ItemCatalog.shapeOf()` supplies the shape, and `engine.overlappingItems()` reports what both views show in red. Wall snapping and the rotate handle still use width and depth, collisions are still a warning only, and saved plans are unchanged. On a test plan with chairs around those items, the old rectangle test flagged 8 pairs and the footprint test 1, the chair that really was pushed into the table. `manifest.json` is no longer formatted by Prettier, so each footprint piece stays on one line.
