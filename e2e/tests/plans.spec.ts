import { expect, test } from '@playwright/test'
import { counts, drawRoom, newPlan, saveStatus } from '../support.js'

test('a first plan: from the empty list to a saved drawing and back', async ({ page, request }) => {
  // This database belongs to the tests, so the list can be emptied to see the welcome.
  const { plans } = (await (await request.get('/api/plans')).json()) as { plans: { id: string }[] }
  for (const plan of plans) await request.delete(`/api/plans/${plan.id}`)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'No plans yet' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New plan' })).toHaveCount(1)

  await page.getByRole('button', { name: 'New plan' }).click()
  const dialog = page.getByRole('dialog', { name: 'New plan' })
  await expect(dialog.getByLabel('Plan name')).toHaveValue('Untitled plan')
  await dialog.getByLabel('Plan name').fill('Ground floor')
  await dialog.getByRole('button', { name: 'Create' }).click()

  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/)
  await expect(page).toHaveTitle('Ground floor – Floor Plan Designer')
  await drawRoom(page)
  await expect(saveStatus(page)).toHaveText(/^Saved/)

  await page.getByRole('link', { name: 'Plans' }).click()
  await expect(page).toHaveURL(/\/$/)
  const card = page.getByRole('listitem').filter({ hasText: 'Ground floor' })
  await expect(card.getByText(/^Changed/)).toBeVisible()
  // The card shows the picture that was saved with the drawing.
  await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/)
})

test('renaming, duplicating and deleting from the list', async ({ page, request }) => {
  await newPlan(page, request, 'Attic')
  await drawRoom(page)
  await expect(saveStatus(page)).toHaveText(/^Saved/)
  await page.getByRole('link', { name: 'Plans' }).click()

  await page.getByRole('button', { name: 'Actions for Attic' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  await page.getByRole('dialog').getByLabel('Plan name').fill('Loft')
  await page.getByRole('dialog').getByRole('button', { name: 'Rename' }).click()
  await expect(page.getByRole('heading', { name: 'Loft', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Loft' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(page.getByRole('heading', { name: 'Copy of Loft' })).toBeVisible()

  // The copy has the drawing of the original.
  await page.getByRole('button', { name: 'Actions for Copy of Loft' }).click()
  await page.getByRole('menuitem', { name: 'Open' }).click()
  await expect.poll(async () => (await counts(page)).walls).toBe(4)
  await page.getByRole('link', { name: 'Plans' }).click()

  await page.getByRole('button', { name: 'Actions for Copy of Loft' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Delete “Copy of Loft”?' })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Copy of Loft' })).toBeVisible()

  await page.getByRole('button', { name: 'Actions for Copy of Loft' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await confirm.getByRole('button', { name: 'Delete plan' }).click()
  await expect(page.getByRole('heading', { name: 'Copy of Loft' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Loft', exact: true })).toBeVisible()
})

test('renaming a plan from the editor', async ({ page, request }) => {
  await newPlan(page, request, 'Garage')
  await page.getByLabel('Plan name').fill('Workshop')
  await page.getByLabel('Plan name').press('Enter')
  await expect(page).toHaveTitle('Workshop – Floor Plan Designer')
  await page.getByRole('link', { name: 'Plans' }).click()
  await expect(page.getByRole('heading', { name: 'Workshop' })).toBeVisible()
})

test('addresses that lead nowhere say so, and the old address still works', async ({
  page,
  request,
}) => {
  await page.goto('/plans/00000000-0000-4000-8000-000000000000')
  await expect(page.getByRole('alert')).toHaveText(/This plan could not be found/)

  await page.goto('/plans/not-an-id')
  await expect(page.getByRole('alert')).toHaveText(/This plan could not be found/)

  await page.goto('/nonsense')
  await expect(page.getByRole('alert')).toHaveText('Page not found.')
  await page.getByRole('link', { name: 'Back to your plans' }).click()
  await expect(page).toHaveURL(/\/$/)

  const id = await newPlan(page, request, 'Old address')
  await page.goto(`/?plan=${id}`)
  await expect(page).toHaveURL(new RegExp(`/plans/${id}$`))
})
