/**
 * Knows whether a plan has changes that are not saved yet.
 *
 * Every change gets a number. A save notes the number of the last change it includes, and the
 * plan is clean again only if no change came after that one. So a change made while a save is
 * on its way keeps the plan marked as unsaved when that save finishes.
 */
export class ChangeTracker {
  private latest = 0
  private saved = 0

  get dirty(): boolean {
    return this.latest !== this.saved
  }

  /** Call when the plan changes. */
  change(): void {
    this.latest++
  }

  /** Call when taking the copy of the plan to save. Pass the result to `markSaved()`. */
  begin(): number {
    return this.latest
  }

  /** Call when the save that began at `revision` has succeeded. */
  markSaved(revision: number): void {
    this.saved = Math.max(this.saved, revision)
  }
}
