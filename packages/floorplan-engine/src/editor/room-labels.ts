import type { Room } from '../model/floorplan.js'
import type { Point } from '../model/geometry.js'
import { formatArea, type UnitSystem } from '../model/units.js'
import type { Viewport } from './viewport.js'

/** The label's text metrics are estimated, so drawing and clicking agree without a canvas. */
const CHARACTER_WIDTH = 7
const LINE_HEIGHT = 16
const PADDING = 4

/** One room's label in the 2D view: its name, when it has one, over its area. */
export interface RoomLabel {
  roomId: string
  /** The label's middle, in screen pixels. */
  centre: Point
  /** The name line, when the room is named. */
  name?: string
  area: string
  /** The clickable box around the text, in screen pixels. */
  box: { x: number; y: number; width: number; height: number }
}

/**
 * Every room's label, centred where the area has always been drawn. The same boxes are drawn
 * and hit-tested, so a click lands exactly on what is shown.
 */
export function roomLabels(
  floorplan: { rooms: readonly Room[]; units?: UnitSystem },
  viewport: Pick<Viewport, 'toScreen'>,
): RoomLabel[] {
  return floorplan.rooms.map((room) => {
    const centre = viewport.toScreen(room.centroid)
    const area = formatArea(room.area, floorplan.units)
    const lines = room.name === undefined ? [area] : [room.name, area]
    const width = Math.max(...lines.map((line) => line.length)) * CHARACTER_WIDTH + 2 * PADDING
    const height = lines.length * LINE_HEIGHT + 2 * PADDING
    return {
      roomId: room.id,
      centre,
      ...(room.name === undefined ? {} : { name: room.name }),
      area,
      box: { x: centre.x - width / 2, y: centre.y - height / 2, width, height },
    }
  })
}

/** The room whose label is under a screen point, or `null`. */
export function roomLabelAt(
  screen: Point,
  floorplan: { rooms: readonly Room[]; units?: UnitSystem },
  viewport: Pick<Viewport, 'toScreen'>,
): string | null {
  for (const label of roomLabels(floorplan, viewport)) {
    const { box } = label
    if (
      screen.x >= box.x &&
      screen.x <= box.x + box.width &&
      screen.y >= box.y &&
      screen.y <= box.y + box.height
    ) {
      return label.roomId
    }
  }
  return null
}
