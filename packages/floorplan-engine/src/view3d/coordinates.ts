import type { Point } from '../model/geometry.js'

// The one place where plan coordinates become scene coordinates.
//
// The plan is flat: `x` to the right and `y` up the page, in metres. The scene has `y` as height,
// so plan `y` becomes scene `-z`. The minus sign keeps the 3D view the same way round as the 2D
// plan; without it the 3D view would be its mirror image.

/** A scene position as `[x, y, z]`, with `y` the height above the floor. */
export type ScenePosition = [x: number, y: number, z: number]

export function toScene(point: Point, height = 0): ScenePosition {
  return [point.x, height, -point.y]
}

/** The plan point below (or above) a scene position. */
export function toPlan(position: { x: number; z: number }): Point {
  return { x: position.x, y: -position.z }
}
