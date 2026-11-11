// @vitest-environment jsdom
import type { Opening } from '@floorplandesigner/engine'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderPlain } from '@/test/render'
import { OpeningInspector } from './OpeningInspector'

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
const window_: Opening = { ...door, kind: 'window', width: 1.2, height: 1.2, sill: 0.9 }

function renderInspector(opening: Opening, accept = true) {
  const onChange = vi.fn(() => accept)
  const onDelete = vi.fn()
  const view = renderPlain(
    <OpeningInspector opening={opening} onChange={onChange} onDelete={onDelete} />,
  )
  return { ...view, onChange, onDelete }
}

describe('OpeningInspector', () => {
  it('shows a door with its size and the two ways to flip it, and no sill', () => {
    renderInspector(door)
    expect(screen.getByText('Door')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Width in metres' })).toHaveValue(0.9)
    expect(screen.getByRole('spinbutton', { name: 'Height in metres' })).toHaveValue(2.1)
    expect(screen.queryByRole('spinbutton', { name: 'Sill in metres' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hinge on the other side' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open to the other side' })).toBeInTheDocument()
  })

  it('shows a window with its sill, and nothing to flip', () => {
    renderInspector(window_)
    expect(screen.getByText('Window')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Sill in metres' })).toHaveValue(0.9)
    expect(
      screen.queryByRole('button', { name: 'Hinge on the other side' }),
    ).not.toBeInTheDocument()
  })

  it('applies a new width as it is typed', async () => {
    const { user, onChange } = renderInspector(door)
    const width = screen.getByRole('spinbutton', { name: 'Width in metres' })
    await user.clear(width)
    await user.type(width, '1.2')
    expect(onChange).toHaveBeenLastCalledWith({ width: 1.2 })
    expect(width).toHaveAttribute('aria-invalid', 'false')
  })

  it('marks a value the wall refuses, and shows the real value again when the field is left', async () => {
    const { user } = renderInspector(door, false)
    const width = screen.getByRole('spinbutton', { name: 'Width in metres' })
    await user.clear(width)
    await user.type(width, '9')
    expect(width).toHaveAttribute('aria-invalid', 'true')
    await user.tab()
    expect(width).toHaveValue(0.9)
    expect(width).toHaveAttribute('aria-invalid', 'false')
  })

  it('does not apply a size of zero', async () => {
    const { user, onChange } = renderInspector(door)
    const width = screen.getByRole('spinbutton', { name: 'Width in metres' })
    await user.clear(width)
    await user.type(width, '0')
    expect(onChange).not.toHaveBeenCalled()
    expect(width).toHaveAttribute('aria-invalid', 'true')
  })

  it('flips the hinge and the swing', async () => {
    const { user, onChange } = renderInspector(door)
    await user.click(screen.getByRole('button', { name: 'Hinge on the other side' }))
    expect(onChange).toHaveBeenLastCalledWith({ hinge: 'end' })
    await user.click(screen.getByRole('button', { name: 'Open to the other side' }))
    expect(onChange).toHaveBeenLastCalledWith({ swing: 'back' })
  })

  it('deletes', async () => {
    const { user, onDelete } = renderInspector(door)
    await user.click(screen.getByRole('button', { name: 'Delete door' }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
