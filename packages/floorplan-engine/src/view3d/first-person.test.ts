import { describe, expect, it } from 'vitest'
import {
  defaultWalkSettings,
  isMoving,
  isWalkKey,
  lookBy,
  stepWalk,
  walkInput,
  type WalkState,
} from './first-person.js'

const origin: WalkState = { x: 0, y: 0, yaw: 0, pitch: 0 }
const still = { forward: 0, strafe: 0, fast: false }

describe('walkInput', () => {
  it('reads W A S D and the arrow keys', () => {
    expect(walkInput(new Set(['KeyW']))).toEqual({ forward: 1, strafe: 0, fast: false })
    expect(walkInput(new Set(['ArrowDown', 'KeyD']))).toEqual({
      forward: -1,
      strafe: 1,
      fast: false,
    })
    expect(walkInput(new Set(['ArrowLeft', 'ShiftRight']))).toEqual({
      forward: 0,
      strafe: -1,
      fast: true,
    })
  })

  it('cancels opposite keys', () => {
    const input = walkInput(new Set(['KeyW', 'ArrowDown']))
    expect(input.forward).toBe(0)
    expect(isMoving(input)).toBe(false)
  })

  it('knows which keys are walking keys', () => {
    expect(isWalkKey('KeyW')).toBe(true)
    expect(isWalkKey('ShiftLeft')).toBe(true)
    expect(isWalkKey('KeyQ')).toBe(false)
  })
})

describe('stepWalk', () => {
  it('moves forwards along the heading', () => {
    const east = stepWalk(origin, { ...still, forward: 1 }, 2)
    expect(east.x).toBeCloseTo(3)
    expect(east.y).toBeCloseTo(0)

    const north = stepWalk({ ...origin, yaw: Math.PI / 2 }, { ...still, forward: 1 }, 2)
    expect(north.x).toBeCloseTo(0)
    expect(north.y).toBeCloseTo(3)
  })

  it('strafes to the right of the heading', () => {
    // Facing east, the right-hand side is south.
    const moved = stepWalk(origin, { ...still, strafe: 1 }, 1)
    expect(moved.x).toBeCloseTo(0)
    expect(moved.y).toBeCloseTo(-1.5)
  })

  it('is no faster on the diagonal', () => {
    const moved = stepWalk(origin, { ...still, forward: 1, strafe: 1 }, 1)
    expect(Math.hypot(moved.x, moved.y)).toBeCloseTo(1.5)
  })

  it('goes faster with Shift', () => {
    const moved = stepWalk(origin, { forward: 1, strafe: 0, fast: true }, 1)
    expect(moved.x).toBeCloseTo(defaultWalkSettings.fastSpeed)
  })

  it('stays on the floor plane when looking up, and keeps the view', () => {
    const lookingUp = { ...origin, pitch: 1 }
    const moved = stepWalk(lookingUp, { ...still, forward: 1 }, 1)
    expect(moved.x).toBeCloseTo(1.5)
    expect(moved.pitch).toBe(1)
    expect(moved.yaw).toBe(0)
  })

  it('returns the same state when nothing is held', () => {
    expect(stepWalk(origin, still, 1)).toBe(origin)
  })
})

describe('lookBy', () => {
  it('turns left when dragged right and looks up when dragged down', () => {
    const turned = lookBy(origin, 100, 50)
    expect(turned.yaw).toBeCloseTo(0.3)
    expect(turned.pitch).toBeCloseTo(0.15)
    expect(turned.x).toBe(0)
  })

  it('stops short of straight up and straight down', () => {
    expect(lookBy(origin, 0, 10_000).pitch).toBe(defaultWalkSettings.maxPitch)
    expect(lookBy(origin, 0, -10_000).pitch).toBe(-defaultWalkSettings.maxPitch)
    expect(defaultWalkSettings.maxPitch).toBeLessThan(Math.PI / 2)
  })
})
