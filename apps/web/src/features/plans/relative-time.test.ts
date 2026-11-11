import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relative-time'

const now = new Date('2026-11-11T12:00:00Z')
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)

describe('formatRelativeTime', () => {
  it.each([
    [0, 'just now'],
    [44, 'just now'],
    [60, '1 minute ago'],
    [5 * 60, '5 minutes ago'],
    [44 * 60, '44 minutes ago'],
    [60 * 60, '1 hour ago'],
    [5 * 3600, '5 hours ago'],
    [24 * 3600, 'yesterday'],
    [3 * 24 * 3600, '3 days ago'],
  ])('%i seconds ago is "%s"', (seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), now)).toBe(expected)
  })

  it('gives a date for a week or more', () => {
    expect(formatRelativeTime(ago(8 * 24 * 3600), now)).toBe('Nov 3, 2026')
  })

  it('treats a time slightly in the future as now', () => {
    expect(formatRelativeTime(ago(-20), now)).toBe('just now')
  })

  it('accepts a timestamp string', () => {
    expect(formatRelativeTime('2026-11-11T11:00:00Z', now)).toBe('1 hour ago')
  })
})
