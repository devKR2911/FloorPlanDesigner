import { describe, expect, it } from 'vitest'
import { createEmptyPlan, planSchema, type Plan } from './plan.js'

const validPlan: Plan = {
  version: 1,
  corners: [
    { id: 'c1', x: 0, y: 0 },
    { id: 'c2', x: 4, y: 0 },
  ],
  walls: [{ id: 'w1', start: 'c1', end: 'c2', thickness: 0.1, height: 2.5 }],
  items: [{ id: 'i1', catalogKey: 'sofa', position: { x: 1, y: 0, z: 1 }, rotation: 0 }],
}

function issuePaths(input: unknown): string[] {
  const result = planSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))
}

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
