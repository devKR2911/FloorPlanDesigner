import { expect, test } from '@playwright/test'
import { drawRoom, openPlan, saveStatus, withEngine } from '../support.js'

const INCH = 0.0254

interface SavedPlan {
  document: { units?: string; walls: { id: string; thickness: number; height: number }[] }
}

test('a plan in feet: made from the dialog, drawn on whole inches, and saved in metres', async ({
  page,
  request,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New plan' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New plan' })
  await expect(dialog.getByRole('radio', { name: 'Metres' })).toBeChecked()
  await dialog.getByLabel('Plan name').fill('Feet plan')
  await dialog.getByRole('radio', { name: 'Feet' }).click()
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/)
  const id = page.url().split('/').pop()!
  await page.waitForFunction(() => !!window.__floorplanEngine && !!document.querySelector('canvas'))
  await expect(page.getByRole('radio', { name: 'Feet and inches' })).toBeChecked()
  expect(await withEngine(page, (engine) => engine.units)).toBe('imperial')

  // Drawn at metric points, the corners land on the nearest whole inch.
  await drawRoom(page)
  const corners = await withEngine(page, (engine) =>
    engine.floorplan.corners.flatMap((corner) => [corner.x, corner.y]),
  )
  expect(corners).toHaveLength(8)
  for (const value of corners) {
    expect(Math.abs(value / INCH - Math.round(value / INCH))).toBeLessThan(1e-6)
  }

  // A wall's fields are in feet and inches; what is typed is saved as metres.
  const wallId = await withEngine(page, (engine) => {
    const wall = engine.floorplan.walls[0]!
    engine.select({ kind: 'wall', id: wall.id })
    return wall.id
  })
  await expect(page.getByLabel('Thickness, feet')).toHaveValue('0')
  await expect(page.getByLabel('Thickness, inches')).toHaveValue('5.875')
  await page.getByLabel('Thickness, inches').fill('8')
  await page.getByLabel('Height, feet').fill('8')
  await page.getByLabel('Height, inches').fill('0')
  await expect(saveStatus(page)).toHaveText('Unsaved changes…')
  await expect(saveStatus(page)).toHaveText(/^Saved/)

  const saved = (await (await request.get(`/api/plans/${id}`)).json()) as SavedPlan
  expect(saved.document.units).toBe('imperial')
  const wall = saved.document.walls.find((other) => other.id === wallId)!
  expect(wall.thickness).toBe(0.2032)
  expect(wall.height).toBe(2.4384)

  // Still in feet after a reload.
  await openPlan(page, id)
  await expect(page.getByRole('radio', { name: 'Feet and inches' })).toBeChecked()

  // Switching to metres is saved by itself, changes no measurement, and can be undone.
  await page.getByRole('radio', { name: 'Metres', exact: true }).click()
  await expect(saveStatus(page)).toHaveText(/^Saved/)
  const metric = (await (await request.get(`/api/plans/${id}`)).json()) as SavedPlan
  expect(metric.document.units).toBeUndefined()
  expect(metric.document.walls).toEqual(saved.document.walls)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('radio', { name: 'Feet and inches' })).toBeChecked()
})
