import type { Floorplan } from '../model/floorplan.js'
import { distance, type Point } from '../model/geometry.js'
import { RECTANGLE_FOOTPRINT, itemFootprint } from '../model/item-geometry.js'
import { wallFootprints } from '../model/wall-footprints.js'
import { openingOutline } from '../model/wall-openings.js'
import type { Opening } from '../schema/plan.js'
import type { ItemShape } from '../schema/item-definition.js'
import type { Hit } from './hit-testing.js'
import type { DrawPreview, Selection } from './interaction.js'
import type { Viewport } from './viewport.js'

export interface EditorTheme {
  background: string
  gridMinor: string
  gridMajor: string
  axis: string
  roomFill: string
  roomLabel: string
  /** The wall's centre line, which is what corners sit on and what is drawn and dragged. */
  wall: string
  wallHover: string
  wallSelected: string
  /** The thickness of a wall, either side of its centre line. */
  wallFill: string
  wallHoverFill: string
  wallSelectedFill: string
  /** The wall's two faces and its free ends. */
  wallEdge: string
  item: string
  itemStroke: string
  itemHover: string
  itemSelected: string
  /** Items that overlap a wall or another item. */
  itemOverlap: string
  /** The lines of a door or window. */
  opening: string
  /** A door or window that does not fit its wall. */
  openingUnfit: string
  corner: string
  cornerStroke: string
  cornerHover: string
  cornerSelected: string
  /** Line and corner colour of a hovered element in delete mode. */
  deleteHover: string
  /** Band fill of a hovered wall in delete mode. */
  deleteHoverFill: string
  /** Fill of a hovered item in delete mode. */
  itemDeleteHover: string
  dimension: string
  preview: string
  snap: string
  font: string
}

export const defaultTheme: EditorTheme = {
  background: '#fafafa',
  gridMinor: '#f0f0f1',
  gridMajor: '#dcdcdf',
  axis: '#b4b4b9',
  roomFill: 'rgba(59, 130, 246, 0.08)',
  roomLabel: '#52525b',
  wall: '#18181b',
  wallHover: '#2563eb',
  wallSelected: '#1d4ed8',
  wallFill: '#e4e4e7',
  wallHoverFill: '#dbe6fb',
  wallSelectedFill: '#cfdcf8',
  wallEdge: '#a1a1aa',
  item: 'rgba(161, 161, 170, 0.35)',
  itemStroke: '#52525b',
  itemHover: 'rgba(37, 99, 235, 0.18)',
  itemSelected: 'rgba(29, 78, 216, 0.25)',
  itemOverlap: 'rgba(220, 38, 38, 0.3)',
  opening: '#3f3f46',
  openingUnfit: '#dc2626',
  corner: '#ffffff',
  cornerStroke: '#3f3f46',
  cornerHover: '#2563eb',
  cornerSelected: '#1d4ed8',
  // Hover colours in delete mode, where hovering means "this will be removed".
  deleteHover: '#dc2626',
  deleteHoverFill: '#fde2e2',
  itemDeleteHover: 'rgba(220, 38, 38, 0.18)',
  dimension: '#71717a',
  preview: '#2563eb',
  snap: '#f59e0b',
  font: '12px system-ui, sans-serif',
}

export interface RenderState {
  floorplan: Floorplan
  viewport: Viewport
  hover: Hit
  selection: Selection
  preview: DrawPreview | null
  theme: EditorTheme
  /** Each item's size and outline on the floor. */
  shapeOf: (catalogKey: string) => ItemShape
  /** Ids of the items that overlap a wall or another item. */
  overlaps: ReadonlySet<string>
  /** Where the selected item's rotate handle is, in world coordinates, if an item is selected. */
  rotateHandle: Point | null
  rotateHandleHover: boolean
  /** Ids of the doors and windows that do not fit their wall. */
  unfitOpenings: ReadonlySet<string>
  /** The door or window being dragged, which shows its distances to the ends of its wall. */
  draggedOpening: string | null
  /** True in delete mode: the hovered element is drawn in red, since a click removes it. */
  deleteHover?: boolean
  /**
   * Draws only the plan itself: rooms, items, walls and openings, without the grid, the
   * dimensions, the room areas or the corner handles. Used for pictures of a plan.
   */
  plain?: boolean
}

/** The colours a hovered element is drawn in: blue when it can be edited, red when a click removes it. */
function hoverColours(state: RenderState): { line: string; fill: string; item: string } {
  const { theme } = state
  return state.deleteHover
    ? { line: theme.deleteHover, fill: theme.deleteHoverFill, item: theme.itemDeleteHover }
    : { line: theme.wallHover, fill: theme.wallHoverFill, item: theme.itemHover }
}

/** Scale above which the 0.1 m grid lines are drawn. */
const MINOR_GRID_MIN_SCALE = 60
/** Below this many pixels thick, a wall is drawn as its centre line only. */
const MIN_WALL_PIXELS = 3
const WALL_LINE_WIDTH = 2
const WALL_LINE_WIDTH_ACTIVE = 2.5
const WALL_EDGE_WIDTH = 1
const CORNER_RADIUS = 4
const CORNER_RADIUS_ACTIVE = 6
const DIMENSION_OFFSET = 14

export function formatLength(metres: number): string {
  return `${metres.toFixed(2)} m`
}

export function formatArea(squareMetres: number): string {
  return `${squareMetres.toFixed(1)} m²`
}

/** Draws the whole plan. `ctx` must already be scaled for the device pixel ratio. */
export function render(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { viewport, theme } = state
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, viewport.width, viewport.height)
  ctx.font = theme.font

  if (!state.plain) drawGrid(ctx, state)
  drawRooms(ctx, state)
  drawItems(ctx, state)
  drawWalls(ctx, state)
  drawOpenings(ctx, state)
  if (state.plain) return
  drawDimensions(ctx, state)
  drawCorners(ctx, state)
  drawPreview(ctx, state)
}

function drawGrid(ctx: CanvasRenderingContext2D, { viewport, theme }: RenderState): void {
  const { min, max } = viewport.visibleBounds()
  const step = viewport.scale >= MINOR_GRID_MIN_SCALE ? 0.1 : 1
  ctx.lineWidth = 1
  for (let x = Math.floor(min.x / step) * step; x <= max.x; x += step) {
    const major = Math.abs(x - Math.round(x)) < 1e-6
    if (!major && step === 1) continue
    const sx = Math.round(viewport.toScreen({ x, y: 0 }).x) + 0.5
    ctx.strokeStyle = x === 0 ? theme.axis : major ? theme.gridMajor : theme.gridMinor
    ctx.beginPath()
    ctx.moveTo(sx, 0)
    ctx.lineTo(sx, viewport.height)
    ctx.stroke()
  }
  for (let y = Math.floor(min.y / step) * step; y <= max.y; y += step) {
    const major = Math.abs(y - Math.round(y)) < 1e-6
    if (!major && step === 1) continue
    const sy = Math.round(viewport.toScreen({ x: 0, y }).y) + 0.5
    ctx.strokeStyle = y === 0 ? theme.axis : major ? theme.gridMajor : theme.gridMinor
    ctx.beginPath()
    ctx.moveTo(0, sy)
    ctx.lineTo(viewport.width, sy)
    ctx.stroke()
  }
}

function drawRooms(
  ctx: CanvasRenderingContext2D,
  { floorplan, viewport, theme, plain }: RenderState,
): void {
  for (const room of floorplan.rooms) {
    const outline = room.interior.length >= 3 ? room.interior : room.polygon
    ctx.fillStyle = theme.roomFill
    tracePolygon(
      ctx,
      outline.map((p) => viewport.toScreen(p)),
    )
    ctx.fill()

    if (plain) continue
    const label = viewport.toScreen(room.centroid)
    ctx.fillStyle = theme.roomLabel
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(formatArea(room.area), label.x, label.y)
  }
}

function drawItems(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme, hover, selection, overlaps, shapeOf } = state
  const hoverColour = hoverColours(state)
  for (const item of floorplan.items) {
    const selected = selection?.kind === 'item' && selection.id === item.id
    const hovered = hover?.kind === 'item' && hover.id === item.id
    const shape = shapeOf(item.catalogKey)
    const local = shape.footprint ?? RECTANGLE_FOOTPRINT
    const pieces = itemFootprint(item, shape).map((piece) => piece.map((p) => viewport.toScreen(p)))

    // All the pieces as one path, so where they overlap is not filled twice.
    ctx.fillStyle = overlaps.has(item.id)
      ? theme.itemOverlap
      : selected
        ? theme.itemSelected
        : hovered
          ? hoverColour.item
          : theme.item
    ctx.beginPath()
    for (const piece of pieces) addPolygon(ctx, piece)
    ctx.fill('nonzero')

    ctx.strokeStyle = selected ? theme.wallSelected : hovered ? hoverColour.line : theme.itemStroke
    pieces.forEach((piece, index) => {
      ctx.save()
      // Only the outside of the whole shape is drawn: lines inside another piece are cut away.
      if (pieces.length > 1) {
        ctx.beginPath()
        ctx.rect(0, 0, viewport.width, viewport.height)
        pieces.forEach((other, otherIndex) => {
          if (otherIndex !== index) addPolygon(ctx, other)
        })
        ctx.clip('evenodd')
      }
      ctx.lineWidth = selected ? 1.5 : 1
      ctx.beginPath()
      addPolygon(ctx, piece)
      ctx.stroke()
      // A heavier line along the front, so it is clear which way the item faces.
      ctx.lineWidth = 3
      ctx.beginPath()
      const points = local[index]!
      points.forEach(([, y], i) => {
        const next = (i + 1) % points.length
        if (y > FRONT_EDGE || points[next]![1] > FRONT_EDGE) return
        ctx.moveTo(piece[i]!.x, piece[i]!.y)
        ctx.lineTo(piece[next]!.x, piece[next]!.y)
      })
      ctx.stroke()
      ctx.restore()
    })
  }
  drawRotateHandle(ctx, state)
}

/** Footprint points at or in front of this `y` are on the item's front edge. */
const FRONT_EDGE = -0.5 + 1e-3

/** Adds a closed polygon to the current path. */
function addPolygon(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

function drawRotateHandle(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme, selection, rotateHandle, rotateHandleHover } = state
  if (!rotateHandle || selection?.kind !== 'item') return
  const item = floorplan.getItem(selection.id)
  if (!item) return
  const centre = viewport.toScreen(item.position)
  const handle = viewport.toScreen(rotateHandle)
  ctx.strokeStyle = theme.wallSelected
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(centre.x, centre.y)
  ctx.lineTo(handle.x, handle.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(
    handle.x,
    handle.y,
    rotateHandleHover ? CORNER_RADIUS_ACTIVE : CORNER_RADIUS + 1,
    0,
    Math.PI * 2,
  )
  ctx.fillStyle = rotateHandleHover ? theme.wallSelected : theme.corner
  ctx.fill()
  ctx.stroke()
}

/**
 * Draws every wall as a solid centre line with its thickness in light grey either side, edged
 * by its faces. All the bands go down first and the lines on top, so where walls meet the
 * centre lines run unbroken to the corner.
 */
function drawWalls(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme, hover, selection } = state
  const hoverColour = hoverColours(state)
  // Each wall's outline once it is joined to its neighbours, so corners close without a notch.
  const footprints = new Map(
    wallFootprints(floorplan.corners, floorplan.walls).map((footprint) => [
      footprint.wallId,
      footprint,
    ]),
  )
  const walls = floorplan.walls.map((wall) => ({
    wall,
    start: viewport.toScreen(floorplan.getCorner(wall.start)!),
    end: viewport.toScreen(floorplan.getCorner(wall.end)!),
    selected: selection?.kind === 'wall' && selection.id === wall.id,
    hovered: hover?.kind === 'wall' && hover.id === wall.id,
    footprint: footprints.get(wall.id),
    // Zoomed far out, the band is too thin to see and only the centre line is drawn.
    banded: wall.thickness * viewport.scale >= MIN_WALL_PIXELS,
  }))

  for (const { footprint, banded, selected, hovered } of walls) {
    if (!footprint || !banded) continue
    ctx.fillStyle = selected ? theme.wallSelectedFill : hovered ? hoverColour.fill : theme.wallFill
    tracePolygon(
      ctx,
      footprint.polygon.map((point) => viewport.toScreen(point)),
    )
    ctx.fill()
  }

  // The faces and free ends, but not the joins, so neighbouring walls read as one band.
  ctx.strokeStyle = theme.wallEdge
  ctx.lineWidth = WALL_EDGE_WIDTH
  ctx.beginPath()
  for (const { footprint, banded } of walls) {
    if (!footprint || !banded) continue
    const points = footprint.polygon.map((point) => viewport.toScreen(point))
    footprint.edges.forEach((edge, i) => {
      if (edge === 'join') return
      const from = points[i]!
      const to = points[(i + 1) % points.length]!
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    })
  }
  ctx.stroke()

  ctx.save()
  ctx.lineCap = 'round'
  // Selected and hovered walls last, so their colour is not covered by a neighbour's line.
  const order = [...walls].sort((a, b) => rank(a) - rank(b))
  for (const { start, end, selected, hovered } of order) {
    ctx.strokeStyle = selected ? theme.wallSelected : hovered ? hoverColour.line : theme.wall
    ctx.lineWidth = selected || hovered ? WALL_LINE_WIDTH_ACTIVE : WALL_LINE_WIDTH
    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }
  ctx.restore()
}

function rank({ selected, hovered }: { selected: boolean; hovered: boolean }): number {
  return selected ? 2 : hovered ? 1 : 0
}

/** How many straight pieces a door's swing arc is drawn with. */
const ARC_STEPS = 16

function drawOpenings(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme, hover, selection, unfitOpenings, draggedOpening } = state
  const hoverColour = hoverColours(state)
  for (const opening of floorplan.openings) {
    const wall = floorplan.getWall(opening.wallId)
    const start = wall && floorplan.getCorner(wall.start)
    const end = wall && floorplan.getCorner(wall.end)
    if (!wall || !start || !end) continue
    const outline = openingOutline(opening, start, end, wall.thickness)
    if (outline.length === 0) continue
    const screen = outline.map((p) => viewport.toScreen(p))
    const selected = selection?.kind === 'opening' && selection.id === opening.id
    const hovered = hover?.kind === 'opening' && hover.id === opening.id
    const unfit = unfitOpenings.has(opening.id)
    ctx.strokeStyle = unfit
      ? theme.openingUnfit
      : selected
        ? theme.wallSelected
        : hovered
          ? hoverColour.line
          : theme.opening
    ctx.lineWidth = selected || hovered ? 2 : 1.5

    if (unfit) {
      // Not cut into the wall: only an outline marks where it would be.
      tracePolygon(ctx, screen)
      ctx.stroke()
      continue
    }

    // The gap in the wall, which also cuts the centre line.
    ctx.fillStyle = theme.background
    tracePolygon(ctx, screen)
    ctx.fill()
    const active = selected || hovered
    ctx.save()
    if (!active) {
      ctx.strokeStyle = theme.wallEdge
      ctx.lineWidth = WALL_EDGE_WIDTH
    }
    if (active || opening.kind === 'window') {
      // A window's frame runs along both faces; a highlighted opening is outlined all round.
      ctx.stroke()
    } else {
      // A door's gap is closed only at its two ends, where the wall stops.
      const [backStart, backEnd, frontEnd, frontStart] = screen as [Point, Point, Point, Point]
      ctx.beginPath()
      ctx.moveTo(backEnd.x, backEnd.y)
      ctx.lineTo(frontEnd.x, frontEnd.y)
      ctx.moveTo(frontStart.x, frontStart.y)
      ctx.lineTo(backStart.x, backStart.y)
      ctx.stroke()
    }
    ctx.restore()

    if (opening.kind === 'window') {
      // Two lines along the wall, a third of its thickness apart.
      for (const t of [1 / 3, 2 / 3]) {
        const from = between(screen[0]!, screen[3]!, t)
        const to = between(screen[1]!, screen[2]!, t)
        ctx.beginPath()
        ctx.moveTo(from.x, from.y)
        ctx.lineTo(to.x, to.y)
        ctx.stroke()
      }
    } else {
      drawDoorSwing(ctx, viewport, opening, outline)
    }

    if (opening.id === draggedOpening) {
      const length = distance(start, end)
      const along = (u: number): Point => ({
        x: start.x + ((end.x - start.x) * u) / length,
        y: start.y + ((end.y - start.y) * u) / length,
      })
      const from = opening.offset - opening.width / 2
      const to = opening.offset + opening.width / 2
      const sides = floorplan.roomsOf(wall.id)
      // On the side the wall's own length is not written on.
      const side = sides.front && !sides.back ? 1 : -1
      ctx.fillStyle = theme.preview
      drawLabel(ctx, viewport, start, along(from), formatLength(from), side, wall.thickness)
      drawLabel(ctx, viewport, along(to), end, formatLength(length - to), side, wall.thickness)
    }
  }
}

/**
 * Draws a door's leaf, open at a right angle from its hinge, and the quarter circle its edge
 * sweeps. `outline` is the opening's outline: back start, back end, front end, front start.
 */
function drawDoorSwing(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  door: Readonly<Opening>,
  outline: Point[],
): void {
  const [backStart, backEnd, frontEnd, frontStart] = outline as [Point, Point, Point, Point]
  const front = door.swing === 'front'
  // The hinge is on the face the door opens towards; the latch is at the other end of that face.
  const nearStart = front ? frontStart : backStart
  const nearEnd = front ? frontEnd : backEnd
  const hinge = door.hinge === 'start' ? nearStart : nearEnd
  const latch = door.hinge === 'start' ? nearEnd : nearStart
  const closed = { x: latch.x - hinge.x, y: latch.y - hinge.y }
  // Out of the wall on the swing side, the same length as the door is wide.
  const across = front
    ? { x: frontStart.x - backStart.x, y: frontStart.y - backStart.y }
    : { x: backStart.x - frontStart.x, y: backStart.y - frontStart.y }
  const thickness = Math.hypot(across.x, across.y)
  const scale = thickness > 0 ? door.width / thickness : 0
  const open = { x: across.x * scale, y: across.y * scale }

  const hingeScreen = viewport.toScreen(hinge)
  const tip = viewport.toScreen({ x: hinge.x + open.x, y: hinge.y + open.y })
  ctx.save()
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(hingeScreen.x, hingeScreen.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let i = 0; i <= ARC_STEPS; i++) {
    const angle = (i / ARC_STEPS) * (Math.PI / 2)
    const p = viewport.toScreen({
      x: hinge.x + closed.x * Math.cos(angle) + open.x * Math.sin(angle),
      y: hinge.y + closed.y * Math.cos(angle) + open.y * Math.sin(angle),
    })
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  }
  ctx.stroke()
  ctx.restore()
}

function between(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function drawDimensions(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme } = state
  ctx.fillStyle = theme.dimension
  for (const wall of floorplan.walls) {
    const start = floorplan.getCorner(wall.start)!
    const end = floorplan.getCorner(wall.end)!
    // Label the side without a room, or the back when both or neither have one.
    const sides = floorplan.roomsOf(wall.id)
    const side = sides.front && !sides.back ? -1 : 1
    drawLabel(ctx, viewport, start, end, formatLength(distance(start, end)), side, wall.thickness)
  }
}

/**
 * Writes `text` along the segment, offset to one side (`side` 1 is the left of start→end in world
 * terms, which is the room's inside for a counter-clockwise room), kept upright.
 */
function drawLabel(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  start: Point,
  end: Point,
  text: string,
  side: 1 | -1,
  thickness: number,
): void {
  const a = viewport.toScreen(start)
  const b = viewport.toScreen(end)
  const length = distance(a, b)
  if (length < 30) return
  let angle = Math.atan2(b.y - a.y, b.x - a.x)
  // Screen y points down, so the world left side is the screen right-hand normal.
  const offset = thickness * viewport.scale * 0.5 + DIMENSION_OFFSET
  const nx = ((b.y - a.y) / length) * offset * side
  const ny = (-(b.x - a.x) / length) * offset * side
  const mid = { x: (a.x + b.x) / 2 + nx, y: (a.y + b.y) / 2 + ny }
  if (angle > Math.PI / 2 || angle <= -Math.PI / 2) angle += Math.PI
  ctx.save()
  ctx.translate(mid.x, mid.y)
  ctx.rotate(angle)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function drawCorners(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { floorplan, viewport, theme, hover, selection } = state
  const hoverColour = state.deleteHover ? theme.deleteHover : theme.cornerHover
  ctx.lineWidth = 1.5
  for (const corner of floorplan.corners) {
    const selected = selection?.kind === 'corner' && selection.id === corner.id
    const hovered = hover?.kind === 'corner' && hover.id === corner.id
    const p = viewport.toScreen(corner)
    ctx.beginPath()
    ctx.arc(p.x, p.y, selected || hovered ? CORNER_RADIUS_ACTIVE : CORNER_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = selected ? theme.cornerSelected : hovered ? hoverColour : theme.corner
    ctx.fill()
    ctx.strokeStyle = selected ? theme.cornerSelected : hovered ? hoverColour : theme.cornerStroke
    ctx.stroke()
  }
}

function drawPreview(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { preview, viewport, theme } = state
  if (!preview) return
  const cursor = viewport.toScreen(preview.cursor)

  if (preview.anchor) {
    const anchor = viewport.toScreen(preview.anchor)
    ctx.save()
    ctx.strokeStyle = theme.preview
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(anchor.x, anchor.y)
    ctx.lineTo(cursor.x, cursor.y)
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = theme.preview
    drawLabel(
      ctx,
      viewport,
      preview.anchor,
      preview.cursor,
      formatLength(distance(preview.anchor, preview.cursor)),
      -1,
      0,
    )
  }

  ctx.strokeStyle = theme.snap
  ctx.lineWidth = 2
  ctx.beginPath()
  switch (preview.target.kind) {
    case 'corner':
      ctx.arc(cursor.x, cursor.y, CORNER_RADIUS_ACTIVE + 2, 0, Math.PI * 2)
      break
    case 'wall':
    case 'axis':
      ctx.rect(cursor.x - 5, cursor.y - 5, 10, 10)
      break
    default:
      ctx.moveTo(cursor.x - 6, cursor.y)
      ctx.lineTo(cursor.x + 6, cursor.y)
      ctx.moveTo(cursor.x, cursor.y - 6)
      ctx.lineTo(cursor.x, cursor.y + 6)
  }
  ctx.stroke()
}

function tracePolygon(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath()
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}
