import type { UnitSystem } from '../schema/plan.js'

export type { UnitSystem } from '../schema/plan.js'

/*
 * Display units. A plan is always stored and calculated in metres; these functions are the only
 * place a length is turned into feet and inches, or back, for showing and typing.
 */

/** Exact, by definition of the inch. */
export const METRES_PER_INCH = 0.0254
const INCHES_PER_FOOT = 12
const SQUARE_FEET_PER_SQUARE_METRE = 1 / (METRES_PER_INCH * INCHES_PER_FOOT) ** 2
/** Feet and inches are shown to the nearest eighth of an inch. */
const PARTS_PER_INCH = 8

/** Snap steps and grid lines for drawing walls, doors and windows, all in metres. */
export interface UnitGrid {
  /** The step corners snap to. */
  snap: number
  /** The step a door or window snaps to along its wall. */
  openingStep: number
  /** The fine grid lines, drawn when zoomed in. */
  minor: number
  /** The heavy grid lines. A whole number of `minor` steps. */
  major: number
}

export function unitGrid(units: UnitSystem): UnitGrid {
  return units === 'imperial'
    ? // Written out, since 3 × 0.0254 and 12 × 0.0254 are not exact in floating point.
      { snap: METRES_PER_INCH, openingStep: METRES_PER_INCH, minor: 0.0762, major: 0.3048 }
    : { snap: 0.1, openingStep: 0.05, minor: 0.1, major: 1 }
}

/**
 * A length as whole feet and the inches left over, rounded to the nearest eighth of an inch and
 * carried, so the inches are always under 12.
 */
export function toFeetAndInches(metres: number): { feet: number; inches: number } {
  const parts = Math.round((Math.abs(metres) / METRES_PER_INCH) * PARTS_PER_INCH)
  const partsPerFoot = INCHES_PER_FOOT * PARTS_PER_INCH
  const feet = Math.floor(parts / partsPerFoot)
  return { feet, inches: (parts - feet * partsPerFoot) / PARTS_PER_INCH }
}

/** Feet and inches as metres. The inches may be 12 or more, and may have a decimal part. */
export function fromFeetAndInches(feet: number, inches: number): number {
  // Rounded to a tenth of a micrometre, so 8 ft is 2.4384 and not 2.4383999999999997.
  return Number(((feet * INCHES_PER_FOOT + inches) * METRES_PER_INCH).toFixed(7))
}

/** `3.00 m`, or in feet and inches `9' 10"`, `10'`, `6"` or `9' 10 1/8"`. */
export function formatLength(metres: number, units: UnitSystem = 'metric'): string {
  if (units === 'metric') return `${metres.toFixed(2)} m`
  const { feet, inches } = toFeetAndInches(metres)
  const whole = Math.floor(inches)
  const fraction = eighths(Math.round((inches - whole) * PARTS_PER_INCH))
  const inchText = [whole > 0 || !fraction ? String(whole) : '', fraction].filter(Boolean).join(' ')
  const pieces: string[] = []
  if (feet > 0) pieces.push(`${feet}'`)
  // Zero inches are left out after feet, but a length of nothing still reads `0"`.
  if (whole > 0 || fraction || feet === 0) pieces.push(`${inchText}"`)
  const text = pieces.join(' ')
  return metres < 0 && text !== '0"' ? `-${text}` : text
}

/** `12.0 m²`, or `129 ft²`. */
export function formatArea(squareMetres: number, units: UnitSystem = 'metric'): string {
  if (units === 'metric') return `${squareMetres.toFixed(1)} m²`
  return `${Math.round(squareMetres * SQUARE_FEET_PER_SQUARE_METRE)} ft²`
}

/** A count of eighths as the simplest fraction, such as `1/2` for 4, or nothing for 0. */
function eighths(count: number): string {
  if (count === 0) return ''
  let top = count
  let bottom = PARTS_PER_INCH
  while (top % 2 === 0) {
    top /= 2
    bottom /= 2
  }
  return `${top}/${bottom}`
}

/** One grid line: where it is, in metres, and whether it is a heavy line. */
export interface GridLine {
  value: number
  major: boolean
  /** The line through the origin. */
  axis: boolean
}

/**
 * The grid lines between `min` and `max` along one axis. With `showMinor` off only the heavy
 * lines are returned. Lines are counted from the origin, not added up, so they do not drift.
 */
export function gridLines(
  min: number,
  max: number,
  grid: Pick<UnitGrid, 'minor' | 'major'>,
  showMinor: boolean,
): GridLine[] {
  const perMajor = Math.max(1, Math.round(grid.major / grid.minor))
  const step = showMinor ? grid.minor : grid.major
  const lines: GridLine[] = []
  for (let index = Math.floor(min / step); index * step <= max; index++) {
    lines.push({
      value: index * step,
      major: !showMinor || index % perMajor === 0,
      axis: index === 0,
    })
  }
  return lines
}
