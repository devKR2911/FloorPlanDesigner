import { type Point } from '../model/geometry.js'

export const MIN_SCALE = 10
export const MAX_SCALE = 400

/**
 * Maps the plan's metres to CSS pixels on the canvas and back. World `y` points up the page,
 * so the screen `y` axis is flipped here and nowhere else.
 */
export class Viewport {
  /** Pixels per metre. */
  scale = 60
  /** Screen position of the world origin, in CSS pixels. */
  originX = 0
  originY = 0
  width: number
  height: number

  constructor(width = 0, height = 0) {
    this.width = width
    this.height = height
    this.reset()
  }

  get metresPerPixel(): number {
    return 1 / this.scale
  }

  toScreen(p: Point): Point {
    return { x: this.originX + p.x * this.scale, y: this.originY - p.y * this.scale }
  }

  toWorld(s: Point): Point {
    return { x: (s.x - this.originX) / this.scale, y: (this.originY - s.y) / this.scale }
  }

  /** The world rectangle currently visible. */
  visibleBounds(): { min: Point; max: Point } {
    return {
      min: this.toWorld({ x: 0, y: this.height }),
      max: this.toWorld({ x: this.width, y: 0 }),
    }
  }

  /** Changes the canvas size, keeping the world point at the centre where it is. */
  setSize(width: number, height: number): void {
    const centre = this.toWorld({ x: this.width / 2, y: this.height / 2 })
    this.width = width
    this.height = height
    this.centreOn(centre)
  }

  /** Shows about 10 m across, centred on the origin. */
  reset(): void {
    this.scale = clampScale(this.width > 0 ? this.width / 10 : 60)
    this.centreOn({ x: 0, y: 0 })
  }

  centreOn(world: Point): void {
    this.originX = this.width / 2 - world.x * this.scale
    this.originY = this.height / 2 + world.y * this.scale
  }

  /** Multiplies the scale by `factor`, keeping the world point under `screen` still. */
  zoomAt(screen: Point, factor: number): void {
    const anchor = this.toWorld(screen)
    this.scale = clampScale(this.scale * factor)
    this.originX = screen.x - anchor.x * this.scale
    this.originY = screen.y + anchor.y * this.scale
  }

  panBy(dx: number, dy: number): void {
    this.originX += dx
    this.originY += dy
  }

  /** Frames a world rectangle with `padding` pixels around it. */
  fit(bounds: { min: Point; max: Point }, padding = 40): void {
    const spanX = Math.max(bounds.max.x - bounds.min.x, 1)
    const spanY = Math.max(bounds.max.y - bounds.min.y, 1)
    const usableX = Math.max(this.width - 2 * padding, 1)
    const usableY = Math.max(this.height - 2 * padding, 1)
    this.scale = clampScale(Math.min(usableX / spanX, usableY / spanY))
    this.centreOn({
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
    })
  }
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}
