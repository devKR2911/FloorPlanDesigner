import { describe, expect, it } from 'vitest'
import { ChangeTracker } from './change-tracker'

describe('ChangeTracker', () => {
  it('starts clean and becomes dirty on a change', () => {
    const tracker = new ChangeTracker()
    expect(tracker.dirty).toBe(false)
    tracker.change()
    expect(tracker.dirty).toBe(true)
  })

  it('is clean again once a save that includes every change succeeds', () => {
    const tracker = new ChangeTracker()
    tracker.change()
    tracker.change()
    tracker.markSaved(tracker.begin())
    expect(tracker.dirty).toBe(false)
  })

  it('stays dirty when a change is made while a save is on its way', () => {
    const tracker = new ChangeTracker()
    tracker.change()
    const revision = tracker.begin()
    tracker.change()
    tracker.markSaved(revision)
    expect(tracker.dirty).toBe(true)
    tracker.markSaved(tracker.begin())
    expect(tracker.dirty).toBe(false)
  })

  it('stays dirty when a save fails, since nothing is marked saved', () => {
    const tracker = new ChangeTracker()
    tracker.change()
    tracker.begin()
    expect(tracker.dirty).toBe(true)
  })

  it('ignores an older save finishing after a newer one', () => {
    const tracker = new ChangeTracker()
    tracker.change()
    const first = tracker.begin()
    tracker.change()
    const second = tracker.begin()
    tracker.markSaved(second)
    tracker.markSaved(first)
    expect(tracker.dirty).toBe(false)
  })
})
