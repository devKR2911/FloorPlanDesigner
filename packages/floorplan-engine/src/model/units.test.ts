import { describe, expect, it } from 'vitest'
import { Floorplan, type FloorplanChange } from './floorplan.js'
import { History } from './history.js'
import {
  METRES_PER_INCH,
  formatArea,
  formatLength,
  fromFeetAndInches,
  gridLines,
  toFeetAndInches,
  unitGrid,
} from './units.js'

const inches = (count: number) => count * METRES_PER_INCH

describe('formatLength', () => {
  it('writes metres to two decimals, and is metric unless told otherwise', () => {
    expect(formatLength(3)).toBe('3.00 m')
    expect(formatLength(2.456, 'metric')).toBe('2.46 m')
  })

  it('writes feet and inches, leaving out the parts that are zero', () => {
    expect(formatLength(inches(118), 'imperial')).toBe(`9' 10"`)
    expect(formatLength(inches(120), 'imperial')).toBe(`10'`)
    expect(formatLength(inches(6), 'imperial')).toBe(`6"`)
    expect(formatLength(0, 'imperial')).toBe(`0"`)
  })

  it('rounds to the nearest eighth of an inch and writes the simplest fraction', () => {
    expect(formatLength(3, 'imperial')).toBe(`9' 10 1/8"`)
    expect(formatLength(4, 'imperial')).toBe(`13' 1 1/2"`)
    expect(formatLength(inches(6.25), 'imperial')).toBe(`6 1/4"`)
    expect(formatLength(inches(0.75), 'imperial')).toBe(`3/4"`)
    expect(formatLength(inches(12.375), 'imperial')).toBe(`1' 3/8"`)
  })

  it('carries a rounded-up inch into the next foot', () => {
    expect(formatLength(inches(11.97), 'imperial')).toBe(`1'`)
    expect(formatLength(inches(23.99), 'imperial')).toBe(`2'`)
    expect(formatLength(inches(5.96), 'imperial')).toBe(`6"`)
  })
})

describe('formatArea', () => {
  it('writes square metres to one decimal, or whole square feet', () => {
    expect(formatArea(12)).toBe('12.0 m²')
    expect(formatArea(12, 'imperial')).toBe('129 ft²')
    expect(formatArea(0.09290304, 'imperial')).toBe('1 ft²')
  })
})

describe('feet and inches', () => {
  it('splits a length into whole feet and inches under twelve', () => {
    expect(toFeetAndInches(inches(98))).toEqual({ feet: 8, inches: 2 })
    expect(toFeetAndInches(2.5)).toEqual({ feet: 8, inches: 2.375 })
    expect(toFeetAndInches(inches(6))).toEqual({ feet: 0, inches: 6 })
    expect(toFeetAndInches(inches(11.97))).toEqual({ feet: 1, inches: 0 })
  })

  it('turns feet and inches into exact metres', () => {
    expect(fromFeetAndInches(8, 0)).toBe(2.4384)
    expect(fromFeetAndInches(2, 8)).toBe(0.8128)
    expect(fromFeetAndInches(0, 8)).toBe(0.2032)
    // Inches past twelve and part inches are both taken as they are.
    expect(fromFeetAndInches(0, 14)).toBe(fromFeetAndInches(1, 2))
    expect(fromFeetAndInches(3, 6.5)).toBe(1.0795)
  })

  it('gives back whole inches exactly, and anything else within a sixteenth', () => {
    for (let count = 0; count <= 400; count++) {
      const { feet, inches: rest } = toFeetAndInches(inches(count))
      expect(feet * 12 + rest).toBe(count)
      expect(fromFeetAndInches(feet, rest)).toBeCloseTo(inches(count), 9)
    }
    for (const metres of [0.07, 0.15, 0.9, 1.234, 2.5, 3, 7.77]) {
      const { feet, inches: rest } = toFeetAndInches(metres)
      expect(Math.abs(fromFeetAndInches(feet, rest) - metres)).toBeLessThanOrEqual(inches(1 / 16))
    }
  })
})

describe('unitGrid', () => {
  it('keeps the metric steps the editor has always had', () => {
    expect(unitGrid('metric')).toEqual({ snap: 0.1, openingStep: 0.05, minor: 0.1, major: 1 })
  })

  it('uses whole inches, with 3 in lines in 1 ft squares, for feet', () => {
    expect(unitGrid('imperial')).toEqual({
      snap: 0.0254,
      openingStep: 0.0254,
      minor: 0.0762,
      major: 0.3048,
    })
  })
})

describe('gridLines', () => {
  it('draws only the heavy lines when the fine ones are hidden', () => {
    const lines = gridLines(-1.2, 2.3, unitGrid('metric'), false)
    expect(lines.map((line) => line.value)).toEqual([-2, -1, 0, 1, 2])
    expect(lines.every((line) => line.major)).toBe(true)
    expect(lines.filter((line) => line.axis).map((line) => line.value)).toEqual([0])
  })

  it('marks every tenth metric line as heavy, without drifting', () => {
    const lines = gridLines(0, 30, unitGrid('metric'), true)
    expect(lines).toHaveLength(301)
    expect(lines.filter((line) => line.major).map((line) => line.value)).toEqual(
      Array.from({ length: 31 }, (_, index) => index),
    )
    expect(lines[3]!.value).toBeCloseTo(0.3, 12)
  })

  it('marks every fourth line as heavy for feet: 3 in lines in 1 ft squares', () => {
    const lines = gridLines(-0.31, 0.62, unitGrid('imperial'), true)
    expect(lines.map((line) => Math.round(line.value / METRES_PER_INCH))).toEqual([
      -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 18, 21, 24,
    ])
    expect(
      lines.filter((line) => line.major).map((line) => Math.round(line.value / METRES_PER_INCH)),
    ).toEqual([-12, 0, 12, 24])
  })
})

describe('the display unit of a plan', () => {
  function room(): Floorplan {
    const fp = new Floorplan()
    const ids = [
      [0, 0],
      [3, 0],
      [3, 4],
      [0, 4],
    ].map(([x, y]) => fp.addCorner(x!, y!))
    ids.forEach((id, index) => fp.addWall(id, ids[(index + 1) % ids.length]!))
    return fp
  }

  it('starts as metres and is left out of a metre plan', () => {
    const fp = room()
    expect(fp.units).toBe('metric')
    expect(fp.export()).not.toHaveProperty('units')
  })

  it('changes without moving anything, and reports one change', () => {
    const fp = room()
    const before = fp.export()
    const changes: FloorplanChange[] = []
    fp.on('change', (change) => changes.push(change))

    fp.setUnits('imperial')
    expect(fp.units).toBe('imperial')
    expect(changes).toEqual([{ kind: 'units', roomsChanged: false }])
    expect(fp.export()).toEqual({ ...before, units: 'imperial' })

    // Setting the unit it already has is not a change.
    fp.setUnits('imperial')
    expect(changes).toHaveLength(1)
  })

  it('refuses a unit it does not know', () => {
    const fp = room()
    expect(() => fp.setUnits('cubits' as never)).toThrow()
    expect(fp.units).toBe('metric')
  })

  it('is read from a loaded plan, and a plan without one is in metres', () => {
    const fp = room()
    fp.setUnits('imperial')
    const saved = fp.export()

    const other = new Floorplan()
    other.load(saved)
    expect(other.units).toBe('imperial')
    expect(other.export()).toEqual(saved)

    other.load({ version: 1, corners: [], walls: [], items: [] })
    expect(other.units).toBe('metric')
  })

  it('is one step to undo and redo', () => {
    const fp = room()
    const history = new History(fp)
    const position = history.position
    fp.setUnits('imperial')
    expect(history.position).not.toBe(position)

    expect(history.undo()).toBe(true)
    expect(fp.units).toBe('metric')
    expect(fp.walls).toHaveLength(4)
    expect(history.position).toBe(position)
    expect(history.redo()).toBe(true)
    expect(fp.units).toBe('imperial')
  })
})
