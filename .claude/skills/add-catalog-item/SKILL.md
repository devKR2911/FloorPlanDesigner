---
name: add-catalog-item
description: Add, remove or change furniture in the web app's catalogue, or the door and window types. Use when asked to add a model to the catalogue, change an item's name, category or placement, add a new model kit, add a door or window type, or when manifest.json or the catalogue tests need updating.
---

# Add a catalogue item

The catalogue is generated, not hand-written. `apps/web/src/catalog/sources.json` lists the items; `pnpm --filter @floorplandesigner/web build:catalog` measures each model and writes `manifest.json`. Never edit `manifest.json` directly: the next build would overwrite it.

## Licensing

Only models whose licence allows use in a web app without attribution problems: CC0 kits (Kenney, Quaternius, Poly Haven). The reference project's models (`cdn-images.archybase.com`) have no stated licence and are never used. Every kit folder under `apps/web/public/models/<kit>/` ships with its `License.txt`; a test checks it is there.

## Steps

1. **Files.** Put `<file>.glb` and a thumbnail `<file>.png` in `apps/web/public/models/<kit>/`. For the Kenney Furniture Kit the folder is `kenney-furniture-kit` and the kit's own preview images are the thumbnails.
2. **Source entry.** Add to `sources.json` under `items`, keeping the category order:
   - `key`: stable, kebab-case, stored in plans as `catalogKey`; never rename a key that saved plans may use.
   - `file`: the file name without extension.
   - `name` and `category`: what the catalogue panel shows; categories group the panel.
   - `placement`: `floor` (default), `wall` (anything hung on a wall) or `ceiling`. Every current item is `floor`.

   Doors and windows are not catalogue items: they are openings cut into walls, defined in `apps/web/src/features/catalog/openings.ts` with a width, height and sill, and drawn by the engine rather than loaded from a model file. Add or change them there.

3. **Build.** Run `pnpm --filter @floorplandesigner/web build:catalog`. Sizes come from the GLB's bounding box times the kit's `scale` in `sources.json`, rounded to centimetres; do not type sizes by hand. The engine scales the model to that size.
   The same build measures each model's outline on the floor (the convex hull of its vertices seen from above) and writes it as the item's `footprint`, which overlap checks, clicking and the 2D drawing use. A model that all but fills its rectangle gets none. A shape that is not convex, such as an L-shaped sofa, needs a hand-written `footprint` in `sources.json`: a list of convex, counter-clockwise polygons that may overlap, with points as fractions of the size (`x` from -0.5 left to 0.5 right, `y` from -0.5 front to 0.5 back). Read the proportions from the model's vertices, and check the result against the 3D view: the plan's `y` is the model's `-z`.

4. **Check.** `pnpm --filter @floorplandesigner/web test` runs `manifest.test.ts`: every source item is listed in order, footprints are present for the round and L-shaped items, sizes are realistic (height between 0.3 m and 2.5 m, width and depth under 3 m; a failure usually means a wrong `scale` or a model with stray geometry), and the licence file is present.
5. **Look at it.** With the dev server running, open a plan, click the item in the Furniture panel, and confirm in 3D that it faces the right way and sits on the floor (`browser-check` skill). An item that loads as a plain box means the model file path is wrong or the file is not a valid GLB.

## A new kit

Add a `sources.json` entry with its own `folder` and `scale` (Kenney's kit is modelled at a scale that needs converting to metres; measure one known object, such as a door, to find it), and copy its licence file into the folder.

## Removing an item

Remove it from `sources.json` and rebuild. Keep the model file if any saved plan might still reference the key; a missing model shows as a placeholder box rather than breaking the plan.
