// @vitest-environment jsdom
import type { Item, Opening, Wall } from '@floorplandesigner/engine'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderPlain } from '@/test/render'
import { PropertiesPanel } from './PropertiesPanel'

const wall: Wall = { id: 'w1', start: 'a', end: 'b', thickness: 0.15, height: 2.5 }
const door: Opening = {
  id: 'o1',
  wallId: 'w1',
  kind: 'door',
  offset: 2,
  width: 0.9,
  height: 2.1,
  sill: 0,
  hinge: 'start',
  swing: 'front',
}
const sofa: Item = {
  id: 'i1',
  catalogKey: 'lounge-sofa',
  position: { x: 1, y: 2 },
  elevation: 0,
  rotation: Math.PI / 2,
}

function renderPanel(selected: { wall?: Wall; opening?: Opening; item?: Item } = {}) {
  const handlers = {
    onWallChange: vi.fn(),
    onOpeningChange: vi.fn(() => true),
    onItemRotate: vi.fn(),
    onDelete: vi.fn(),
  }
  renderPlain(
    <PropertiesPanel
      wall={selected.wall ?? null}
      opening={selected.opening ?? null}
      item={selected.item ?? null}
      itemName="Sofa"
      {...handlers}
    />,
  )
  return handlers
}

describe('PropertiesPanel', () => {
  it('asks for a selection when nothing is selected', () => {
    renderPanel()
    expect(screen.getByRole('complementary', { name: 'Properties' })).toHaveTextContent(
      'Select a wall, door, window or item to edit it.',
    )
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('edits and deletes a wall', async () => {
    const user = userEvent.setup()
    const { onWallChange, onDelete } = renderPanel({ wall })
    expect(screen.getByRole('heading', { name: 'Wall' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Height in metres' })).toHaveValue(2.5)

    const thickness = screen.getByRole('spinbutton', { name: 'Thickness in metres' })
    await user.clear(thickness)
    await user.type(thickness, '0.3')
    expect(onWallChange).toHaveBeenLastCalledWith({ thickness: 0.3 })

    await user.click(screen.getByRole('button', { name: 'Delete wall' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('does not pass on a wall size that is not a positive number', async () => {
    const user = userEvent.setup()
    const { onWallChange } = renderPanel({ wall })
    const thickness = screen.getByRole('spinbutton', { name: 'Thickness in metres' })
    await user.clear(thickness)
    await user.type(thickness, '0')
    expect(onWallChange).not.toHaveBeenCalled()
    expect(thickness).toHaveAttribute('aria-invalid', 'true')
    // Leaving the field puts the wall's real thickness back.
    await user.tab()
    expect(thickness).toHaveValue(0.15)
  })

  it('shows a door with its fields and actions', async () => {
    const user = userEvent.setup()
    const { onOpeningChange, onDelete } = renderPanel({ opening: door })
    expect(screen.getByRole('heading', { name: 'Door' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Width in metres' })).toHaveValue(0.9)
    await user.click(screen.getByRole('button', { name: 'Open to the other side' }))
    expect(onOpeningChange).toHaveBeenLastCalledWith({ swing: 'back' })
    await user.click(screen.getByRole('button', { name: 'Delete door' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('shows an item by its name, with its rotation in degrees', async () => {
    const user = userEvent.setup()
    const { onItemRotate, onDelete } = renderPanel({ item: sofa })
    expect(screen.getByRole('heading', { name: 'Sofa' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Rotation in degrees' })).toHaveValue(90)
    await user.click(screen.getByRole('button', { name: 'Turn a quarter' }))
    expect(onItemRotate).toHaveBeenLastCalledWith(Math.PI)
    await user.click(screen.getByRole('button', { name: 'Delete item' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
