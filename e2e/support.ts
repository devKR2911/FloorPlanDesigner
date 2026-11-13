import type { FloorplanEngine } from '@floorplandesigner/engine'
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

declare global {
  interface Window {
    /** Set by the web app in development, for checks like these. */
    __floorplanEngine?: FloorplanEngine
  }
}

/**
 * Runs a function in the page with the app's engine, and returns what it returns. The function
 * is sent to the page as text, so it can only use its two arguments.
 */
export function withEngine<Result, Argument = undefined>(
  page: Page,
  run: (engine: FloorplanEngine, argument: Argument) => Result,
  argument?: Argument,
): Promise<Result> {
  return page.evaluate(
    ({ source, argument }) => {
      const run = (0, eval)(`(${source})`) as (engine: unknown, argument: unknown) => unknown
      return run(window.__floorplanEngine, argument)
    },
    { source: run.toString(), argument },
  ) as Promise<Result>
}

/** Creates an empty plan through the backend and opens it in the editor. Returns its id. */
export async function newPlan(
  page: Page,
  request: APIRequestContext,
  name = 'Test plan',
): Promise<string> {
  const response = await request.post('/api/plans', {
    data: { name, document: { version: 1, corners: [], walls: [], items: [] } },
  })
  expect(response.status()).toBe(201)
  const { id } = (await response.json()) as { id: string }
  await openPlan(page, id)
  return id
}

/** Opens a plan's editor and waits until the plan is loaded into it. */
export async function openPlan(page: Page, id: string): Promise<void> {
  await page.goto(`/plans/${id}`)
  await page.waitForFunction(() => !!window.__floorplanEngine && !!document.querySelector('canvas'))
  await expect(saveStatus(page)).toHaveText(/^Saved/)
}

/** The text in the editor's header that says whether the plan is saved. */
export function saveStatus(page: Page): Locator {
  return page.locator('header').getByRole('status')
}

/** A button of the catalogue panel, by the name shown under it. */
export function catalogueButton(page: Page, name: string): Locator {
  return page
    .getByRole('complementary', { name: 'Furniture catalogue' })
    .getByRole('button', { name, exact: true })
}

/** How many walls, rooms, openings and items the plan has. */
export function counts(page: Page) {
  return withEngine(page, ({ floorplan }) => ({
    walls: floorplan.walls.length,
    rooms: floorplan.rooms.length,
    openings: floorplan.openings.length,
    items: floorplan.items.length,
  }))
}

/** Where a point on the plan is on the screen, in the 2D editor. */
export async function onScreen(
  page: Page,
  x: number,
  y: number,
): Promise<{ x: number; y: number }> {
  // A panel opening or closing changes the canvas's size, and the editor follows a moment
  // later, keeping the middle of the view where it was. Wait until it has, or the point is
  // worked out for a view that is about to move.
  await page.waitForFunction(() => {
    const editor = window.__floorplanEngine?.editor
    return !!editor && editor.viewport.width === editor.canvas.clientWidth
  })
  return withEngine(
    page,
    (engine, point) => {
      const editor = engine.editor!
      const rect = editor.canvas.getBoundingClientRect()
      const screen = editor.viewport.toScreen(point)
      return { x: screen.x + rect.x, y: screen.y + rect.y }
    },
    { x, y },
  )
}

/** Clicks a point on the plan in the 2D editor. */
export async function clickPlan(page: Page, x: number, y: number): Promise<void> {
  const point = await onScreen(page, x, y)
  await page.mouse.click(point.x, point.y)
}

/** Drags from one point on the plan to another in the 2D editor, in several moves. */
export async function dragPlan(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const start = await onScreen(page, from.x, from.y)
  const end = await onScreen(page, to.x, to.y)
  await dragScreen(page, start, end)
}

/** Drags between two points on the screen, in several moves, as a hand would. */
export async function dragScreen(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

/**
 * Draws a room with the mouse: a rectangle centred on the plan's origin. Its walls run
 * counter-clockwise from the bottom left, so the first is the south wall.
 */
export async function drawRoom(page: Page, width = 5, depth = 4): Promise<void> {
  const [w, d] = [width / 2, depth / 2]
  await page.getByLabel('Draw walls').click()
  for (const [x, y] of [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
    [-w, -d],
  ] as const) {
    await clickPlan(page, x, y)
  }
  await page.getByLabel('Move and select').click()
  await expect.poll(async () => (await counts(page)).rooms).toBe(1)
}

/** Where a point of the plan, at a height, is on the screen in the 3D view. */
export function onScreen3d(page: Page, x: number, y: number, height = 0) {
  return withEngine(
    page,
    ({ view3d }, point) => {
      const projected = view3d.camera.position
        .clone()
        .set(point.x, point.height, -point.y)
        .project(view3d.camera)
      const rect = view3d.canvas.getBoundingClientRect()
      return {
        x: rect.x + ((projected.x + 1) / 2) * rect.width,
        y: rect.y + ((1 - projected.y) / 2) * rect.height,
      }
    },
    { x, y, height },
  )
}

/** Puts the orbit camera at a scene position, looking at the middle of the plan's floor. */
export function placeOrbitCamera(page: Page, x: number, height: number, z: number) {
  return withEngine(
    page,
    ({ view3d }, position) => {
      // The orbit controls are the view's own business; a test may reach in to aim the camera.
      const { controls } = view3d as unknown as {
        controls: { target: { set(x: number, y: number, z: number): void }; update(): void }
      }
      view3d.camera.position.set(position.x, position.height, position.z)
      controls.target.set(0, 0, 0)
      controls.update()
    },
    { x, height, z },
  )
}
