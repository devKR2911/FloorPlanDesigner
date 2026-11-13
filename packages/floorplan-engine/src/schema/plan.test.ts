import { describe, expect, it } from 'vitest'
import { createEmptyPlan, planSchema, type Plan } from './plan.js'

const validPlan: Plan = {
  version: 1,
  corners: [
    { id: 'c1', x: 0, y: 0 },
    { id: 'c2', x: 4, y: 0 },
  ],
  walls: [{ id: 'w1', start: 'c1', end: 'c2', thickness: 0.1, height: 2.5 }],
  items: [{ id: 'i1', catalogKey: 'sofa', position: { x: 1, y: 1 }, elevation: 0, rotation: 0 }],
  openings: [
    {
      id: 'o1',
      wallId: 'w1',
      kind: 'door',
      offset: 2,
      width: 0.9,
      height: 2.1,
      sill: 0,
      hinge: 'start',
      swing: 'front',
    },
  ],
  rooms: [{ id: 'r1', name: 'Kitchen', anchor: { x: 1, y: 1 } }],
}

function issuePaths(input: unknown): string[] {
  const result = planSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

describe('the display unit', () => {
  it('is optional, and kept when given', () => {
    expect(planSchema.parse(validPlan)).not.toHaveProperty('units')
    expect(planSchema.parse({ ...validPlan, units: 'imperial' }).units).toBe('imperial')
    expect(planSchema.parse({ ...validPlan, units: 'metric' }).units).toBe('metric')
  })

  it('must be one the engine knows', () => {
    expect(issuePaths({ ...validPlan, units: 'inches' })).toEqual(['units'])
  })
})

describe('planSchema', () => {
  it('accepts an empty plan', () => {
    expect(planSchema.parse(createEmptyPlan())).toEqual(createEmptyPlan())
  })

  it('accepts a plan with corners, walls and items', () => {
    expect(planSchema.parse(validPlan)).toEqual(validPlan)
  })

  it('rejects an unknown format version', () => {
    expect(issuePaths({ ...validPlan, version: 2 })).toEqual(['version'])
  })

  it('rejects a missing section', () => {
    expect(issuePaths({ version: 1, corners: [], walls: [] })).toEqual(['items'])
  })

  it('reads a plan saved before doors and windows existed as having none', () => {
    const older: Partial<Plan> = { ...validPlan }
    delete older.openings
    expect(planSchema.parse(older)).toEqual({ ...validPlan, openings: [] })
  })

  it('reads a plan saved before rooms could be named as having no names', () => {
    const older: Partial<Plan> = { ...validPlan }
    delete older.rooms
    expect(planSchema.parse(older)).toEqual({ ...validPlan, rooms: [] })
  })

  it('rejects room names that are blank, too long or duplicated', () => {
    const record = validPlan.rooms[0]!
    expect(issuePaths({ ...validPlan, rooms: [{ ...record, name: '   ' }] })).toEqual([
      'rooms.0.name',
    ])
    expect(issuePaths({ ...validPlan, rooms: [{ ...record, name: 'x'.repeat(61) }] })).toEqual([
      'rooms.0.name',
    ])
    expect(issuePaths({ ...validPlan, rooms: [record, { ...record, name: 'Hall' }] })).toEqual([
      'rooms.1.id',
    ])
  })

  it('rejects an opening on a wall that does not exist', () => {
    const plan = { ...validPlan, openings: [{ ...validPlan.openings[0], wallId: 'missing' }] }
    expect(issuePaths(plan)).toEqual(['openings.0.wallId'])
  })

  it('rejects two openings with the same id', () => {
    const plan = { ...validPlan, openings: [validPlan.openings[0], validPlan.openings[0]] }
    expect(issuePaths(plan)).toEqual(['openings.1.id'])
  })

  it('rejects a wall that points at a corner that does not exist', () => {
    const plan = { ...validPlan, walls: [{ ...validPlan.walls[0], end: 'missing' }] }
    expect(issuePaths(plan)).toEqual(['walls.0.end'])
  })

  it('rejects a wall that starts and ends at the same corner', () => {
    const plan = { ...validPlan, walls: [{ ...validPlan.walls[0], end: 'c1' }] }
    expect(issuePaths(plan)).toEqual(['walls.0.end'])
  })

  it('rejects two walls between the same corners, in either direction', () => {
    const reversed = { id: 'w2', start: 'c2', end: 'c1', thickness: 0.1, height: 2.5 }
    const plan = { ...validPlan, walls: [...validPlan.walls, reversed] }
    expect(issuePaths(plan)).toEqual(['walls.1'])
  })

  it('rejects duplicate ids', () => {
    const plan = { ...validPlan, corners: [...validPlan.corners, { id: 'c1', x: 9, y: 9 }] }
    expect(issuePaths(plan)).toEqual(['corners.2.id'])
  })

  it('rejects a wall with no thickness', () => {
    const plan = { ...validPlan, walls: [{ ...validPlan.walls[0], thickness: 0 }] }
    expect(issuePaths(plan)).toEqual(['walls.0.thickness'])
  })

  it('rejects coordinates that are not finite numbers', () => {
    const plan = { ...validPlan, corners: [{ id: 'c1', x: Infinity, y: 0 }, validPlan.corners[1]] }
    expect(issuePaths(plan)).toEqual(['corners.0.x'])
  })
})
