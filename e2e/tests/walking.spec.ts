import { expect, test, type Page } from '@playwright/test'
import { catalogueButton, drawRoom, newPlan, placeOrbitCamera, withEngine } from '../support.js'

/** Where the camera stands on the plan. */
const walker = (page: Page) =>
  withEngine(page, ({ view3d }) => ({
    x: view3d.camera.position.x,
    y: -view3d.camera.position.z,
    height: view3d.camera.position.y,
  }))

/** Enters walk mode facing the way the orbit camera looks, and walks forwards for a while. */
async function walkForwards(page: Page, cameraX: number, cameraZ: number): Promise<void> {
  await placeOrbitCamera(page, cameraX, 5, cameraZ)
  await page.getByLabel('Walk camera').click()
  // The camera glides down to eye height in the middle of the room.
  await expect.poll(async () => (await walker(page)).height).toBeCloseTo(1.6, 2)
  await page.locator('canvas').last().click()
  await page.keyboard.down('w')
  await page.waitForTimeout(2600)
  await page.keyboard.up('w')
  await page.waitForTimeout(200)
}

test('walking: out through a door, but not through a wall', async ({ page, request }) => {
  await newPlan(page, request)
  // A 5 m by 4 m room: its south wall is at y = -2 and its north wall at y = 2.
  await drawRoom(page)
  await catalogueButton(page, 'Door').click()
  await page.getByLabel('3D view').click()
  // The view frames the plan when it is first shown. Wait for that before aiming the camera.
  await expect.poll(() => withEngine(page, ({ view3d }) => view3d.isVisible)).toBe(true)
  await page.waitForTimeout(300)

  // Facing south, towards the door in the middle of the south wall.
  await walkForwards(page, 0, -6)
  const outside = await walker(page)
  expect(outside.y).toBeLessThan(-2.5)
  expect(outside.x).toBeCloseTo(0, 1)

  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Orbit camera')).toHaveAttribute('data-state', 'on')
  await expect.poll(async () => (await walker(page)).height).toBeCloseTo(5, 1)
  // Let the camera finish gliding back before it is aimed again.
  await page.waitForTimeout(600)

  // Facing north, towards a plain wall: stopped a quarter of a metre from its inside face.
  await walkForwards(page, 0, 6)
  expect((await walker(page)).y).toBeCloseTo(2 - 0.075 - 0.25, 1)
})
