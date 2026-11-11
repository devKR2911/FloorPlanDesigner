// @vitest-environment jsdom
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '@/test/render'
import { EditorHeader, type SaveStatus } from './EditorHeader'

function renderHeader(props: Partial<Parameters<typeof EditorHeader>[0]> = {}) {
  const onRename = vi.fn()
  const view = renderInRouter(
    <EditorHeader
      name="Attic"
      onRename={onRename}
      renameError={null}
      status={{ kind: 'saved', at: '2026-11-11T10:00:00Z' }}
      {...props}
    />,
  )
  return { ...view, onRename }
}

const nameField = () => screen.findByRole('textbox', { name: 'Plan name' })

describe('EditorHeader', () => {
  it('links back to the plan list', async () => {
    renderHeader()
    expect(await screen.findByRole('link', { name: 'Plans' })).toHaveAttribute('href', '/')
  })

  it('has no Save button, since the plan saves by itself', async () => {
    renderHeader()
    await nameField()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it.each<[SaveStatus, string]>([
    [{ kind: 'saving' }, 'Saving…'],
    [{ kind: 'unsaved' }, 'Unsaved changes…'],
  ])('shows %o as "%s"', async (status, text) => {
    renderHeader({ status })
    expect(await screen.findByRole('status')).toHaveTextContent(text)
  })

  it('shows when the plan was saved', async () => {
    renderHeader()
    expect(await screen.findByRole('status')).toHaveTextContent(/^Saved at /)
  })

  it('shows a failed save as an alert', async () => {
    renderHeader({ status: { kind: 'error', message: 'Could not save: no room', missing: false } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save: no room')
  })

  it('offers the way back when the plan no longer exists', async () => {
    renderHeader({ status: { kind: 'error', message: 'Could not save', missing: true } })
    expect(await screen.findByRole('alert')).toHaveTextContent('This plan no longer exists')
    expect(screen.getByRole('link', { name: 'Back to your plans' })).toBeInTheDocument()
  })

  it('shows a failed rename in place of the save status', async () => {
    renderHeader({ renameError: 'Could not rename: no room' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not rename: no room')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renames on Enter, with the name trimmed', async () => {
    const { user, onRename } = renderHeader()
    const field = await nameField()
    await user.clear(field)
    await user.type(field, '  Loft  {Enter}')
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Loft')
  })

  it('renames when the field is left', async () => {
    const { user, onRename } = renderHeader()
    await user.type(await nameField(), ' two')
    await user.tab()
    expect(onRename).toHaveBeenCalledExactlyOnceWith('Attic two')
  })

  it('does nothing when the name is unchanged', async () => {
    const { user, onRename } = renderHeader()
    await user.click(await nameField())
    await user.tab()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('puts the name back when it is left empty', async () => {
    const { user, onRename } = renderHeader()
    const field = await nameField()
    await user.clear(field)
    await user.tab()
    expect(onRename).not.toHaveBeenCalled()
    expect(field).toHaveValue('Attic')
  })

  it('puts the name back on Escape, without renaming', async () => {
    const { user, onRename } = renderHeader()
    const field = await nameField()
    await user.type(field, ' two{Escape}')
    await vi.waitFor(() => expect(field).not.toHaveFocus())
    expect(field).toHaveValue('Attic')
    expect(onRename).not.toHaveBeenCalled()
  })
})
