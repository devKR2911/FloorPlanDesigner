import { expect, test } from '@playwright/test'
import { catalogueButton, counts, dragPlan, drawRoom, newPlan, withEngine } from '../support.js'

const door = (page: Parameters<typeof counts>[0]) =>
  withEngine(page, ({ floorplan }) => {
    const opening = floorplan.openings.find((other) => other.kind === 'door')!
    return {
      offset: Math.round(opening.offset * 1000) / 1000,
      width: opening.width,
      hinge: opening.hinge,
      swing: opening.swing,
    }
  })

test('a door with no wall to go in is refused with a message', async ({ page, request }) => {
  await newPlan(page, request)
  await catalogueButton(page, 'Door').click()
  await expect(page.getByRole('alert')).toHaveText(/Draw a wall first/)
  expect((await counts(page)).openings).toBe(0)
})

test('doors and windows: adding, sliding, flipping, resizing, and showing in 3D', async ({
  page,
  request,
}) => {
  await newPlan(page, request)
  await drawRoom(page)

  // The door goes to the middle of the nearest wall, which is the south wall, 5 m long.
  await catalogueButton(page, 'Door').click()
  expect(await door(page)).toEqual({ offset: 2.5, width: 0.9, hinge: 'start', swing: 'front' })

  // Slid past the end of the wall, it stops where the wall's inside face ends:
  // 5 - 0.075 for the joining wall, less a 0.05 margin and half its own width.
  await dragPlan(page, { x: 0, y: -2 }, { x: 3, y: -2.3 })
  expect((await door(page)).offset).toBe(4.425)

  await page.keyboard.press('f')
  expect(await door(page)).toMatchObject({ hinge: 'end', swing: 'front' })
  await page.getByRole('button', { name: 'Open to the other side' }).click()
  expect(await door(page)).toMatchObject({ hinge: 'end', swing: 'back' })

  // A width the wall has no room for is refused, and the field says so.
  const width = page.getByLabel('Width in metres')
  await width.fill('9')
  await expect(width).toHaveAttribute('aria-invalid', 'true')
  expect((await door(page)).width).toBe(0.9)
  await width.blur()
  await expect(width).toHaveValue('0.9')
  await width.fill('1.2')
  expect((await door(page)).width).toBe(1.2)

  await catalogueButton(page, 'Window').click()
  expect((await counts(page)).openings).toBe(2)

  // In 3D each is cut into its wall and has its frame.
  await page.getByLabel('3D view').click()
  await expect
    .poll(() =>
      withEngine(page, ({ view3d }) => {
        let openings = 0
        view3d.scene.traverse((object) => {
          if ((object.userData as { kind?: string }).kind === 'opening') openings++
        })
        return openings
      }),
    )
    .toBe(2)

  // Removing a wall removes what was in it.
  await withEngine(page, ({ floorplan }) =>
    floorplan.removeWall(floorplan.openings.find((other) => other.kind === 'door')!.wallId),
  )
  expect((await counts(page)).openings).toBeLessThan(2)
})
