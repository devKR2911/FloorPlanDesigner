// @vitest-environment jsdom
import type { UnitSystem } from '@floorplandesigner/engine'
import { screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderPlain } from '@/test/render'
import { LengthField } from './LengthField'
import { RoomInspector } from './RoomInspector'
import { UnitsContext } from './units-context'

function renderField(units: UnitSystem, value: number, options: { accept?: boolean } = {}) {
  const onCommit = vi.fn(() => options.accept ?? true)
  const view = renderPlain(
    <UnitsContext value={units}>
      <LengthField label="Height" value={value} onCommit={onCommit} />
      <button type="button">Elsewhere</button>
    </UnitsContext>,
  )
  return { ...view, onCommit }
}

const feet = () => screen.getByRole('spinbutton', { name: 'Height, feet' })
const inches = () => screen.getByRole('spinbutton', { name: 'Height, inches' })

describe('LengthField in metres', () => {
  it('is one field in metres, as before units existed', async () => {
    const { user, onCommit } = renderField('metric', 2.5)
    const field = screen.getByRole('spinbutton', { name: 'Height in metres' })
    expect(field).toHaveValue(2.5)
    expect(screen.queryByRole('spinbutton', { name: 'Height, feet' })).not.toBeInTheDocument()
    await user.clear(field)
    await user.type(field, '3')
    expect(onCommit).toHaveBeenLastCalledWith(3)
  })
})

describe('LengthField in feet', () => {
  it('shows the value as feet and inches, to the nearest eighth', () => {
    renderField('imperial', 2.5)
    expect(feet()).toHaveValue(8)
    expect(inches()).toHaveValue(2.375)
    expect(screen.queryByRole('spinbutton', { name: 'Height in metres' })).not.toBeInTheDocument()
  })

  it('passes on metres made from both boxes when either changes', async () => {
    const { user, onCommit } = renderField('imperial', 2.4384)
    await user.clear(feet())
    await user.type(feet(), '3')
    // The inches box still holds 0, so this is 3 ft.
    expect(onCommit).toHaveBeenLastCalledWith(0.9144)
    await user.clear(inches())
    await user.type(inches(), '6')
    expect(onCommit).toHaveBeenLastCalledWith(1.0668)
    expect(feet()).toHaveAttribute('aria-invalid', 'false')
    expect(inches()).toHaveAttribute('aria-invalid', 'false')
  })

  it('counts an empty box as nothing', async () => {
    const { user, onCommit } = renderField('imperial', 1.0668)
    await user.clear(inches())
    expect(onCommit).toHaveBeenLastCalledWith(0.9144)
    expect(inches()).toHaveAttribute('aria-invalid', 'false')
  })

  it('takes part inches', async () => {
    const { user, onCommit } = renderField('imperial', 0.9144)
    await user.clear(inches())
    await user.type(inches(), '6.5')
    expect(onCommit).toHaveBeenLastCalledWith(1.0795)
  })

  it('marks both boxes when the length is too small, and passes nothing on', async () => {
    const { user, onCommit } = renderField('imperial', 0.3048)
    await user.clear(feet())
    expect(onCommit).not.toHaveBeenCalled()
    expect(feet()).toHaveAttribute('aria-invalid', 'true')
    expect(inches()).toHaveAttribute('aria-invalid', 'true')
  })

  it('marks a refused value, and shows the real one again when the field is left', async () => {
    const { user } = renderField('imperial', 2.4384, { accept: false })
    await user.clear(feet())
    await user.type(feet(), '30')
    expect(feet()).toHaveAttribute('aria-invalid', 'true')

    // Moving to the other box is not leaving the field.
    await user.click(inches())
    expect(feet()).toHaveValue(30)

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(feet()).toHaveValue(8)
    expect(inches()).toHaveValue(0)
    expect(feet()).toHaveAttribute('aria-invalid', 'false')
  })

  it('carries inches of twelve or more into feet when the field is left', async () => {
    // Holds the value as the model would, so the field is drawn again with what it passed on.
    function Held() {
      const [value, setValue] = useState(0.3048)
      return (
        <UnitsContext value="imperial">
          <LengthField label="Height" value={value} onCommit={setValue} />
          <button type="button">Elsewhere</button>
        </UnitsContext>
      )
    }
    const { user } = renderPlain(<Held />)
    await user.clear(inches())
    await user.type(inches(), '14')
    // Left as typed while the field has the focus.
    expect(feet()).toHaveValue(1)
    expect(inches()).toHaveValue(14)
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(feet()).toHaveValue(2)
    expect(inches()).toHaveValue(2)
  })
})

describe('a room’s area', () => {
  const room = {
    id: 'r',
    cornerIds: [],
    wallIds: [],
    polygon: [],
    interior: [],
    area: 12,
    centroid: { x: 0, y: 0 },
  }

  it('is in square metres or square feet, by the plan’s unit', () => {
    const { unmount } = renderPlain(<RoomInspector room={room} onName={() => {}} />)
    expect(screen.getByText('12.0 m²')).toBeInTheDocument()
    unmount()
    renderPlain(
      <UnitsContext value="imperial">
        <RoomInspector room={room} onName={() => {}} />
      </UnitsContext>,
    )
    expect(screen.getByText('129 ft²')).toBeInTheDocument()
  })
})
