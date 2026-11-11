const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * How long ago something happened, in words: "just now", "5 minutes ago", "yesterday",
 * "3 days ago". Anything a week old or more is given as a date.
 */
export function formatRelativeTime(timestamp: string | Date, now = new Date(), locale = 'en') {
  const then = new Date(timestamp)
  const seconds = (now.getTime() - then.getTime()) / 1000
  // A time slightly in the future is a clock that is a little off, not news from tomorrow.
  if (seconds < 45) return 'just now'

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (seconds < 45 * MINUTE) return relative.format(-Math.round(seconds / MINUTE), 'minute')
  if (seconds < 22 * HOUR) return relative.format(-Math.round(seconds / HOUR), 'hour')
  if (seconds < 7 * DAY) return relative.format(-Math.round(seconds / DAY), 'day')
  return then.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The full date and time, for a tooltip beside a relative time. */
export function formatExactTime(timestamp: string | Date, locale?: string): string {
  return new Date(timestamp).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}
