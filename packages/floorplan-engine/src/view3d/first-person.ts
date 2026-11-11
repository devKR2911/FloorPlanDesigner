// Walking and looking in first person, as plain maths with no camera or DOM.

/** Where the walker stands on the plan and where they look. */
export interface WalkState {
  /** Position on the plan, in metres. */
  x: number
  y: number
  /** Heading in radians, counter-clockwise from the plan's x axis. */
  yaw: number
  /** Looking up (positive) or down, in radians. */
  pitch: number
}

export interface WalkSettings {
  /** Metres per second. */
  speed: number
  /** Metres per second while a Shift key is held. */
  fastSpeed: number
  /** Height of the camera above the floor, in metres. */
  eyeHeight: number
  /** Radians turned per pixel dragged. */
  lookSpeed: number
  /** The furthest the walker can look up or down, in radians. */
  maxPitch: number
}

export const defaultWalkSettings: WalkSettings = {
  speed: 1.5,
  fastSpeed: 3,
  eyeHeight: 1.6,
  lookSpeed: 0.003,
  maxPitch: (85 * Math.PI) / 180,
}

export interface WalkInput {
  /** 1 forwards, -1 backwards. */
  forward: number
  /** 1 to the right, -1 to the left. */
  strafe: number
  fast: boolean
}

const FORWARD_KEYS = ['KeyW', 'ArrowUp']
const BACK_KEYS = ['KeyS', 'ArrowDown']
const LEFT_KEYS = ['KeyA', 'ArrowLeft']
const RIGHT_KEYS = ['KeyD', 'ArrowRight']
const FAST_KEYS = ['ShiftLeft', 'ShiftRight']
const WALK_KEYS = new Set([
  ...FORWARD_KEYS,
  ...BACK_KEYS,
  ...LEFT_KEYS,
  ...RIGHT_KEYS,
  ...FAST_KEYS,
])

/** Whether a key, by its `KeyboardEvent.code`, is one of the walking keys. */
export function isWalkKey(code: string): boolean {
  return WALK_KEYS.has(code)
}

/** Turns the set of held keys (by `KeyboardEvent.code`) into a movement. Opposite keys cancel. */
export function walkInput(held: ReadonlySet<string>): WalkInput {
  const any = (codes: string[]) => codes.some((code) => held.has(code))
  return {
    forward: Number(any(FORWARD_KEYS)) - Number(any(BACK_KEYS)),
    strafe: Number(any(RIGHT_KEYS)) - Number(any(LEFT_KEYS)),
    fast: any(FAST_KEYS),
  }
}

export function isMoving(input: WalkInput): boolean {
  return input.forward !== 0 || input.strafe !== 0
}

/** Moves the walker for `seconds`. Movement stays on the floor plane whatever the pitch. */
export function stepWalk(
  state: WalkState,
  input: WalkInput,
  seconds: number,
  settings: WalkSettings = defaultWalkSettings,
): WalkState {
  const length = Math.hypot(input.forward, input.strafe)
  if (length === 0) return state
  // Scaled so that moving diagonally is no faster than moving straight.
  const distance =
    ((input.fast ? settings.fastSpeed : settings.speed) * seconds) / Math.max(1, length)
  const cos = Math.cos(state.yaw)
  const sin = Math.sin(state.yaw)
  return {
    ...state,
    x: state.x + (cos * input.forward + sin * input.strafe) * distance,
    y: state.y + (sin * input.forward - cos * input.strafe) * distance,
  }
}

/**
 * Turns the view by a drag of `dx`, `dy` pixels. The scene follows the pointer, as if grabbed:
 * dragging right turns the walker left, and dragging down looks up.
 */
export function lookBy(
  state: WalkState,
  dx: number,
  dy: number,
  settings: WalkSettings = defaultWalkSettings,
): WalkState {
  const pitch = state.pitch + dy * settings.lookSpeed
  return {
    ...state,
    yaw: state.yaw + dx * settings.lookSpeed,
    pitch: Math.min(settings.maxPitch, Math.max(-settings.maxPitch, pitch)),
  }
}
