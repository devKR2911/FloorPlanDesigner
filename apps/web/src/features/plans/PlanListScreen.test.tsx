// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PNG, installFakeBackend, type FakeBackend } from '@/test/fake-backend'
import { renderApp } from '@/test/render'

// The editor needs WebGL, which the simulated browser does not have. These tests only check
// that the list sends the user to it.
vi.mock('@/features/editor/EditorScreen', () => ({
  EditorScreen: () => <p>The editor</p>,
}))

let backend: FakeBackend

beforeEach(() => {
  backend = installFakeBackend()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const cardNames = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

async function openMenu(user: ReturnType<typeof renderApp>['user'], planName: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${planName}` }))
  return screen.findByRole('menu')
}

describe('an empty list', () => {
  it('shows placeholders while loading, then a welcome with the one New plan button', async () => {
    let finishLoading = () => {}
    backend.gate = new Promise((resolve) => (finishLoading = resolve))
    renderApp()
    expect(await screen.findByRole('list', { name: 'Loading plans' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New plan' })).not.toBeInTheDocument()

    finishLoading()
    expect(await screen.findByRole('heading', { name: 'No plans yet' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'New plan' })).toHaveLength(1)
  })
})

describe('a list with plans', () => {
  it('shows each plan with its name, age and picture, the most recently changed first', async () => {
    backend.add('Attic')
    backend.add('Basement', { thumbnail: PNG })
    const { container } = renderApp()

    expect(await screen.findByRole('heading', { name: '2 plans' })).toBeInTheDocument()
    const cards = screen.getAllByRole('listitem')
    expect(cards).toHaveLength(2)
    expect(within(cards[0]!).getByRole('heading')).toHaveTextContent('Basement')
    expect(within(cards[0]!).getByText(/^Changed/)).toBeInTheDocument()
    // Only the plan with a picture has one; the other shows a placeholder.
    expect(container.querySelectorAll('li img')).toHaveLength(1)
    expect(within(cards[0]!).getByRole('link')).toHaveAttribute(
      'href',
      `/plans/${backend.plans[1]!.id}`,
    )
    // With plans in the list, the header has the New plan button.
    expect(screen.getByRole('button', { name: 'New plan' })).toBeInTheDocument()
  })

  it('shows the filter from seven plans, and narrows the list by name', async () => {
    for (const name of ['Attic', 'Basement', 'Garage', 'Garden room', 'Hallway', 'Loft']) {
      backend.add(name)
    }
    const first = renderApp()
    await screen.findByRole('heading', { name: '6 plans' })
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    first.unmount()

    backend.add('Garden shed')
    const { user } = renderApp()
    const filter = await screen.findByRole('searchbox', { name: 'Filter plans by name' })
    await user.type(filter, 'GAR')
    expect(cardNames()).toEqual(['7 plans', 'Garden shed', 'Garden room', 'Garage'])
    await user.clear(filter)
    await user.type(filter, 'zzz')
    expect(screen.getByText('No plan has “zzz” in its name.')).toBeInTheDocument()
  })
})

describe('when the list cannot be loaded', () => {
  it('says so in plain words, and loads on Try again once the backend is back', async () => {
    backend.add('Attic')
    backend.offline = true
    const { user } = renderApp()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your plans: The server could not be reached.',
    )
    backend.offline = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Attic' })).toBeInTheDocument()
  })
})

describe('creating a plan', () => {
  it('asks for a name, creates the plan and opens it', async () => {
    const { user, router } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'New plan' }))
    const dialog = await screen.findByRole('dialog', { name: 'New plan' })
    const name = within(dialog).getByRole('textbox', { name: 'Plan name' })
    expect(name).toHaveValue('Untitled plan')

    await user.clear(name)
    expect(within(dialog).getByRole('button', { name: 'Create' })).toBeDisabled()
    await user.type(name, '  Kitchen  ')
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await screen.findByText('The editor')).toBeInTheDocument()
    expect(backend.plans).toHaveLength(1)
    expect(backend.plans[0]).toMatchObject({ name: 'Kitchen', thumbnail: null })
    expect(router.state.location.pathname).toBe(`/plans/${backend.plans[0]!.id}`)
  })

  it('keeps the dialog open and says why when the backend refuses', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'New plan' }))
    backend.failNextWrite = 500
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create the plan: The backend refused',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(backend.plans).toHaveLength(0)
  })
})

describe('renaming a plan', () => {
  it('renames from the menu and shows the new name', async () => {
    backend.add('Attic')
    const { user } = renderApp()
    const menu = await openMenu(user, 'Attic')
    await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }))

    const dialog = await screen.findByRole('dialog', { name: 'Rename plan' })
    const name = within(dialog).getByRole('textbox', { name: 'Plan name' })
    expect(name).toHaveValue('Attic')
    await user.clear(name)
    await user.type(name, 'Loft conversion')
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }))

    expect(await screen.findByRole('heading', { name: 'Loft conversion' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(backend.plans[0]!.name).toBe('Loft conversion')
  })
})

describe('duplicating a plan', () => {
  it('adds a copy named after the original', async () => {
    backend.add('Attic', { thumbnail: PNG })
    const { user } = renderApp()
    const menu = await openMenu(user, 'Attic')
    await user.click(within(menu).getByRole('menuitem', { name: 'Duplicate' }))

    expect(await screen.findByRole('heading', { name: 'Copy of Attic' })).toBeInTheDocument()
    expect(backend.plans.map((plan) => plan.thumbnail)).toEqual([PNG, PNG])
  })
})

describe('deleting a plan', () => {
  it('asks first, naming the plan, and keeps it on Cancel', async () => {
    backend.add('Attic')
    const { user } = renderApp()
    const menu = await openMenu(user, 'Attic')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Delete “Attic”?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(backend.plans).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Attic' })).toBeInTheDocument()
  })

  it('removes the plan when confirmed', async () => {
    backend.add('Attic')
    backend.add('Basement')
    const { user } = renderApp()
    const menu = await openMenu(user, 'Attic')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Delete plan' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Attic' })).not.toBeInTheDocument(),
    )
    expect(backend.plans.map((plan) => plan.name)).toEqual(['Basement'])
    expect(await screen.findByRole('heading', { name: '1 plan' })).toBeInTheDocument()
  })

  it('puts the plan back and says why when the backend refuses', async () => {
    backend.add('Attic')
    const { user } = renderApp()
    const menu = await openMenu(user, 'Attic')
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete' }))
    backend.failNextWrite = 500
    await user.click(await screen.findByRole('button', { name: 'Delete plan' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete “Attic”: The backend refused',
    )
    expect(await screen.findByRole('heading', { name: 'Attic' })).toBeInTheDocument()
  })
})

describe('addresses', () => {
  it('shows a message for an address that is not a screen', async () => {
    renderApp('/nonsense')
    expect(await screen.findByRole('alert')).toHaveTextContent('Page not found.')
    expect(screen.getByRole('link', { name: 'Back to your plans' })).toHaveAttribute('href', '/')
  })

  it('sends the old ?plan=<id> address to the plan', async () => {
    const plan = backend.add('Attic')
    const { router } = renderApp(`/?plan=${plan.id}`)
    expect(await screen.findByText('The editor')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/plans/${plan.id}`)
  })
})
