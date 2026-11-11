import { expect, test } from '@playwright/test'
import {
  catalogueButton,
  counts,
  dragPlan,
  dragScreen,
  drawRoom,
  newPlan,
  onScreen3d,
  withEngine,
} from '../support.js'

/** The first item's place and turn, rounded for comparing. */
const firstItem = (page: Parameters<typeof counts>[0]) =>
  withEngine(page, ({ floorplan }) => {
    const item = floorplan.items[0]!
    return {
      x: Math.round(item.position.x * 100) / 100,
      y: Math.round(item.position.y * 100) / 100,
      degrees: Math.round((item.rotation * 180) / Math.PI),
    }
  })

test('placing furniture in 2D: free spots, snapping to a wall, turning and deleting', async ({
  page,
  request,
}) => {
  await newPlan(page, request)
  await drawRoom(page)

  await catalogueButton(page, 'Sofa').click()
  expect(await firstItem(page)).toEqual({ x: 0, y: 0, degrees: 0 })
  // The inspector shows what is selected.
  await expect(page.getByLabel('Rotation in degrees')).toHaveValue('0')

  // Two more items asked for at the same spot each find a free one.
  await catalogueButton(page, 'Chair').click()
  await catalogueButton(page, 'Chair').click()
  const overlapping = await withEngine(page, (engine) => {
    const items = engine.floorplan.items
    const size = engine.catalog.sizeOf
    let pairs = 0
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = size(items[i]!.catalogKey)
        const b = size(items[j]!.catalogKey)
        const dx = Math.abs(items[i]!.position.x - items[j]!.position.x)
        const dy = Math.abs(items[i]!.position.y - items[j]!.position.y)
        if (dx < (a.width + b.width) / 2 - 0.01 && dy < (a.depth + b.depth) / 2 - 0.01) pairs++
      }
    }
    return pairs
  })
  expect(overlapping).toBe(0)
  expect((await counts(page)).items).toBe(3)

  // Dragged towards the north wall, the sofa sits with its back flush against it:
  // the wall's inside face is at 2 - 0.075, and the sofa is 0.82 deep.
  await dragPlan(page, { x: 0, y: 0 }, { x: 0, y: 1.45 })
  const againstWall = await withEngine(page, ({ floorplan }) => floorplan.items[0]!.position)
  expect(againstWall.x).toBeCloseTo(0, 5)
  expect(againstWall.y).toBeCloseTo(2 - 0.075 - 0.82 / 2, 5)
  expect((await firstItem(page)).degrees).toBe(0)

  await page.keyboard.press('r')
  expect((await firstItem(page)).degrees).toBe(90)
  await page.keyboard.press('Delete')
  expect((await counts(page)).items).toBe(2)
})

test('furniture in 3D: the model loads, and it can be dragged and deleted there', async ({
  page,
  request,
}) => {
  await newPlan(page, request)
  await drawRoom(page)
  await catalogueButton(page, 'Sofa').click()

  await page.getByLabel('3D view').click()
  await expect
    .poll(() =>
      withEngine(page, ({ floorplan, view3d }) => view3d.hasItemModel(floorplan.items[0]!.id)),
    )
    .toBe(true)
  expect(await withEngine(page, ({ view3d }) => view3d.loadedModelCount)).toBe(1)
  await page.getByRole('button', { name: 'Fit plan to view' }).click()
  await page.waitForTimeout(600)

  const camera = () => withEngine(page, ({ view3d }) => view3d.camera.position.toArray().join())
  const cameraBefore = await camera()
  const start = await onScreen3d(page, 0, 0, 0.4)
  await dragScreen(page, start, { x: start.x - 120, y: start.y + 60 })

  const moved = await firstItem(page)
  expect(Math.hypot(moved.x, moved.y)).toBeGreaterThan(0.5)
  // Dragging an item moves the item, not the camera, and selects it.
  expect(await camera()).toBe(cameraBefore)
  expect(await withEngine(page, (engine) => engine.selection?.kind)).toBe('item')

  await page.keyboard.press('Delete')
  expect((await counts(page)).items).toBe(0)
})
