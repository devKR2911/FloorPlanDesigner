/** A timed camera move. The view's frame loop drives it. */
export interface Tween {
  /** Set from the first frame's timestamp. */
  startTime: number | null
  /** Called every frame with the eased progress, from 0 to 1. */
  step: (progress: number) => void
  /** Called once after the last step. */
  done?: (() => void) | undefined
}

/** Starts slowly, speeds up, and slows down again. Maps 0 to 0 and 1 to 1. */
export function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}
