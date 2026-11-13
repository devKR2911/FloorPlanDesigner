import { expect, test } from '@playwright/test'
import {
  catalogueButton,
  clickPlan,
  counts,
  drawRoom,
  newPlan,
  openPlan,
  saveStatus,
  withEngine,
} from '../support.js'

test('drawing a room, undoing and redoing it, and finding it saved after a reload', async ({
  page,
  request,
}) => {
  const id = await newPlan(page, request)
  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })
  await expect(undo).toBeDisabled()

  await drawRoom(page)
  expect(await counts(page)).toMatchObject({ walls: 4, rooms: 1 })
  // A change shows as unsaved, and is saved by itself a moment later.
  await expect(saveStatus(page)).toHaveText('Unsaved changes…')
  await expect(saveStatus(page)).toHaveText(/^Saved/)

  // Each wall is one step back. The first click placed only a corner, which is one more.
  for (const walls of [3, 2, 1, 0, 0]) {
    await undo.click()
    expect((await counts(page)).walls).toBe(walls)
  }
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()

  // Forwards again with the keyboard, from the canvas.
  await page.locator('canvas').first().focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+Shift+z')
  expect(await counts(page)).toMatchObject({ walls: 4, rooms: 1 })
  await expect(redo).toBeDisabled()
  await page.keyboard.press('Control+z')
  expect((await counts(page)).walls).toBe(3)
  await page.keyboard.press('Control+y')
  expect((await counts(page)).walls).toBe(4)

  // In a text field the keys belong to the field.
  await page.getByLabel('Plan name').focus()
  await page.keyboard.press('Control+z')
  expect((await counts(page)).walls).toBe(4)

  await expect(saveStatus(page)).toHaveText(/^Saved/)
  await openPlan(page, id)
  expect(await counts(page)).toMatchObject({ walls: 4, rooms: 1 })
})

test('naming a room from its label, and finding the name after a reload', async ({
  page,
  request,
}) => {
  const id = await newPlan(page, request)
  await drawRoom(page, 4, 3)

  // drawRoom centres the room on the origin, so its label (at the centroid) is there too.
  await clickPlan(page, 0, 0)
  const name = page.getByRole('textbox', { name: 'Room name' })
  await expect(name).toHaveValue('')
  await name.fill('Kitchen')
  await expect(page.getByRole('heading', { name: 'Kitchen', exact: true })).toBeVisible()

  // One undo removes the whole typed name; redo brings it back.
  await page.getByRole('button', { name: 'Undo' }).click()
  expect(await withEngine(page, (engine) => engine.floorplan.rooms[0]!.name ?? null)).toBeNull()
  await page.getByRole('button', { name: 'Redo' }).click()

  await expect(saveStatus(page)).toHaveText(/^Saved/)
  await openPlan(page, id)
  expect(await withEngine(page, (engine) => engine.floorplan.rooms[0]!.name ?? null)).toBe(
    'Kitchen',
  )
})

test('undoing back to what was saved shows the plan as saved again', async ({ page, request }) => {
  await newPlan(page, request)
  await drawRoom(page)
  await expect(saveStatus(page)).toHaveText(/^Saved/)

  await catalogueButton(page, 'Door').click()
  await expect(saveStatus(page)).toHaveText('Unsaved changes…')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(saveStatus(page)).toHaveText(/^Saved/)
})

test('leaving the editor saves first', async ({ page, request }) => {
  const id = await newPlan(page, request)
  await drawRoom(page)
  await catalogueButton(page, 'Door').click()
  // Straight away, before the plan has saved by itself.
  await page.getByRole('link', { name: 'Plans' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)

  await openPlan(page, id)
  expect(await counts(page)).toMatchObject({ walls: 4, openings: 1 })
})

test('a save that fails is reported, and leaving then asks first', async ({ page, request }) => {
  const id = await newPlan(page, request)
  // The backend cannot be reached for saves.
  await page.route('**/api/plans/*', (route) =>
    route.request().method() === 'PATCH' ? route.abort() : route.continue(),
  )
  await drawRoom(page)
  await expect(page.locator('header').getByRole('alert')).toHaveText(
    /Could not save: The server could not be reached/,
  )

  await page.getByRole('link', { name: 'Plans' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Your changes could not be saved' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Stay' }).click()
  await expect(page).toHaveURL(new RegExp(`/plans/${id}$`))
  expect((await counts(page)).walls).toBe(4)

  // With the backend back, leaving saves and goes.
  await page.unroute('**/api/plans/*')
  await page.getByRole('link', { name: 'Plans' }).click()
  await expect(page).toHaveURL(/\/$/)
  await openPlan(page, id)
  expect((await counts(page)).walls).toBe(4)
})
