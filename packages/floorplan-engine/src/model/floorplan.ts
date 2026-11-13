import { Emitter, type Listener } from '../core/events.js'
import {
  PLAN_FORMAT_VERSION,
  planSchema,
  type Corner,
  type Item,
  type Opening,
  type OpeningKind,
  type Plan,
  type RoomRecord,
  type Wall,
} from '../schema/plan.js'
import {
  centroid,
  insidePoint,
  pointInPolygon,
  closestPointOnSegment,
  distance,
  insetPolygon,
  signedArea,
  type Point,
} from './geometry.js'
import { normalizeAngle } from './item-geometry.js'
import { findRooms, type WallSide } from './rooms.js'
import {
  OPENING_DEFAULTS,
  fitOffset,
  fitsUnderTop,
  openingCentre,
  projectOntoWall,
  wallClearSpans,
} from './wall-openings.js'

export interface FloorplanOptions {
  /** Corners closer than this are the same corner, and a corner this close to a wall sits on it. Metres. */
  cornerTolerance?: number
  /** Thickness of new walls, in metres. */
  wallThickness?: number
  /** Height of new walls, in metres. */
  wallHeight?: number
}

export interface Room {
  /** The sorted corner ids joined with `-`, so it survives edits that keep the same corners. */
  readonly id: string
  /** Counter-clockwise. */
  readonly cornerIds: readonly string[]
  /** `wallIds[i]` joins `cornerIds[i]` to the next corner. */
  readonly wallIds: readonly string[]
  /** The corner positions, along the wall centrelines. */
  readonly polygon: readonly Point[]
  /** The outline inside the walls: the centreline polygon moved inwards by half of each wall's thickness. */
  readonly interior: readonly Point[]
  /** Along the wall centrelines, in square metres. */
  readonly area: number
  readonly centroid: Point
  /** The room's name, when one was given. */
  readonly name?: string
}

export type FloorplanChangeKind =
  'load' | 'restore' | 'corners' | 'walls' | 'items' | 'openings' | 'rooms'

export interface FloorplanChange {
  /**
   * `walls` when the set of walls changed (corners may have changed too), `corners` when only
   * corners did, `items` when only items did, `openings` when only doors or windows did, and
   * `rooms` when only a room's name did.
   * A `corners` or `walls` change may also move the openings on the walls it touched.
   * `load` is a new plan; `restore` is an earlier state of the same plan put back, by undo.
   */
  kind: FloorplanChangeKind
  /**
   * The id of the wall, item or opening whose own values were edited, when the change was such
   * an edit. Undo uses it to join a run of edits to one thing into one step.
   */
  target?: string
  /** True when the set of rooms changed. A room that only changed shape keeps its id and does not count. */
  roomsChanged: boolean
}

export type FloorplanEvents = {
  change: FloorplanChange
}

export class FloorplanError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FloorplanError'
  }
}

/**
 * The floor-plan model: corners joined by walls, with rooms detected from the closed loops.
 * It keeps the plan consistent (no self-joining or duplicate walls, no stranded corners) and
 * recomputes the rooms after every change. It has no rendering code.
 */
export class Floorplan {
  readonly options: Readonly<Required<FloorplanOptions>>

  private readonly cornerMap = new Map<string, Corner>()
  private readonly wallMap = new Map<string, Wall>()
  private readonly itemMap = new Map<string, Item>()
  private readonly openingMap = new Map<string, Opening>()
  /**
   * Where each opening wants to be on the plan. When a wall moves, its openings are put back as
   * near to these points as the wall allows, so a wall dragged short and long again gets its
   * door back where it was.
   */
  private readonly openingAnchors = new Map<string, Point>()
  private roomList: Room[] = []
  private roomMap = new Map<string, Room>()
  /** Room names, by their own record id. A record names whichever room holds its anchor. */
  private readonly roomRecords = new Map<string, RoomRecord>()
  /** Which record names which detected room, rebuilt whenever the rooms or names change. */
  private roomRecordByRoom = new Map<string, RoomRecord>()
  private wallSideMap = new Map<string, Partial<Record<WallSide, string>>>()
  private readonly emitter = new Emitter<FloorplanEvents>()

  constructor(options: FloorplanOptions = {}) {
    this.options = {
      cornerTolerance: options.cornerTolerance ?? 0.05,
      wallThickness: options.wallThickness ?? 0.15,
      wallHeight: options.wallHeight ?? 2.5,
    }
  }

  get corners(): readonly Readonly<Corner>[] {
    return [...this.cornerMap.values()]
  }

  get walls(): readonly Readonly<Wall>[] {
    return [...this.wallMap.values()]
  }

  get rooms(): readonly Room[] {
    return this.roomList
  }

  get items(): readonly Readonly<Item>[] {
    return [...this.itemMap.values()]
  }

  getCorner(id: string): Readonly<Corner> | undefined {
    return this.cornerMap.get(id)
  }

  getWall(id: string): Readonly<Wall> | undefined {
    return this.wallMap.get(id)
  }

  getItem(id: string): Readonly<Item> | undefined {
    return this.itemMap.get(id)
  }

  /** The doors and windows of every wall. */
  get openings(): readonly Readonly<Opening>[] {
    return [...this.openingMap.values()]
  }

  getOpening(id: string): Readonly<Opening> | undefined {
    return this.openingMap.get(id)
  }

  /** The doors and windows of one wall, in order from its start corner. */
  openingsOf(wallId: string): readonly Readonly<Opening>[] {
    return this.openings
      .filter((opening) => opening.wallId === wallId)
      .sort((a, b) => a.offset - b.offset)
  }

  getRoom(id: string): Room | undefined {
    return this.roomMap.get(id)
  }

  /** The walls that start or end at a corner. */
  wallsAt(cornerId: string): readonly Readonly<Wall>[] {
    return this.walls.filter((wall) => wall.start === cornerId || wall.end === cornerId)
  }

  /** The room on each side of a wall. `front` is the left side walking from `start` to `end`. */
  roomsOf(wallId: string): { front: Room | null; back: Room | null } {
    const sides = this.wallSideMap.get(wallId)
    return {
      front: (sides?.front && this.roomMap.get(sides.front)) || null,
      back: (sides?.back && this.roomMap.get(sides.back)) || null,
    }
  }

  /** Subscribes to changes and returns a function that unsubscribes. */
  on<Name extends keyof FloorplanEvents>(
    name: Name,
    listener: Listener<FloorplanEvents[Name]>,
  ): () => void {
    return this.emitter.on(name, listener)
  }

  /**
   * Replaces the whole plan. Throws a `ZodError` if the input is not a valid plan, and leaves
   * the current plan in place in that case.
   */
  load(input: unknown): void {
    this.replace(input, 'load')
  }

  /**
   * Puts back an earlier state of this plan, as undo and redo do. It differs from `load()` only
   * in how the change is reported: as `restore`, so views redraw without treating it as a new
   * plan.
   */
  restore(input: unknown): void {
    this.replace(input, 'restore')
  }

  private replace(input: unknown, kind: 'load' | 'restore'): void {
    const plan = planSchema.parse(input)
    this.cornerMap.clear()
    this.wallMap.clear()
    for (const corner of plan.corners) this.cornerMap.set(corner.id, { ...corner })
    for (const wall of plan.walls) this.wallMap.set(wall.id, { ...wall })
    this.itemMap.clear()
    for (const item of structuredClone(plan.items)) this.itemMap.set(item.id, item)
    this.openingMap.clear()
    for (const opening of plan.openings) this.openingMap.set(opening.id, { ...opening })
    this.roomRecords.clear()
    for (const record of structuredClone(plan.rooms)) this.roomRecords.set(record.id, record)
    this.commit(kind)
  }

  /** A copy of the plan, ready to be saved as JSON. */
  export(): Plan {
    return structuredClone({
      version: PLAN_FORMAT_VERSION,
      corners: [...this.cornerMap.values()],
      walls: [...this.wallMap.values()],
      items: [...this.itemMap.values()],
      openings: [...this.openingMap.values()],
      rooms: [...this.roomRecords.values()],
    })
  }

  /**
   * Adds a corner and returns its id. A point within tolerance of an existing corner returns
   * that corner instead. A point on a wall is moved onto the wall and splits it.
   */
  addCorner(x: number, y: number): string {
    const existing = this.cornerNear({ x, y }, null)
    if (existing) return existing.id

    const corner: Corner = { id: newId(), x, y }
    this.cornerMap.set(corner.id, corner)
    const split = this.splitWallUnder(corner)
    this.commit(split ? 'walls' : 'corners')
    return corner.id
  }

  /** Adds a wall between two corners and returns its id. */
  addWall(
    startId: string,
    endId: string,
    options: { thickness?: number; height?: number } = {},
  ): string {
    this.requireCorner(startId)
    this.requireCorner(endId)
    if (startId === endId) throw new FloorplanError('A wall must join two different corners')
    if (this.wallBetween(startId, endId)) {
      throw new FloorplanError('These corners are already joined by a wall')
    }
    const wall: Wall = {
      id: newId(),
      start: startId,
      end: endId,
      thickness: positive(options.thickness ?? this.options.wallThickness, 'thickness'),
      height: positive(options.height ?? this.options.wallHeight, 'height'),
    }
    this.wallMap.set(wall.id, wall)
    this.commit('walls')
    return wall.id
  }

  /**
   * Moves a corner. Landing within tolerance of another corner merges the two, keeping the
   * other corner. Landing on a wall moves the corner onto the wall and splits it.
   *
   * With `resolve: false` the corner only moves; call `resolveCorner()` afterwards. A drag uses
   * this so a corner carried across another corner does not merge with it on the way past.
   */
  moveCorner(id: string, x: number, y: number, options: { resolve?: boolean } = {}): void {
    const corner = this.requireCorner(id)
    corner.x = x
    corner.y = y
    if (options.resolve === false) {
      this.commit('corners')
      return
    }
    this.commit(this.resolve(corner) ? 'walls' : 'corners')
  }

  /**
   * Applies the merge or split a corner's position calls for, after a move with `resolve: false`.
   * Returns the id of the corner now at that position: the other corner after a merge, else the
   * same id. Emits a change only if something was merged or split.
   */
  resolveCorner(id: string): string {
    const corner = this.requireCorner(id)
    const target = this.cornerNear(corner, corner)
    if (this.resolve(corner)) this.commit('walls')
    return target ? target.id : id
  }

  /**
   * Moves several corners by the same offset as one operation, for example both ends of a wall.
   * Each corner is then resolved, unless `resolve: false`.
   */
  moveCorners(
    ids: readonly string[],
    dx: number,
    dy: number,
    options: { resolve?: boolean } = {},
  ): void {
    const corners = ids.map((id) => this.requireCorner(id))
    for (const corner of corners) {
      corner.x += dx
      corner.y += dy
    }
    // A wall moved as a whole carries its doors and windows with it.
    const moved = new Set(ids)
    for (const opening of this.openingMap.values()) {
      const wall = this.wallMap.get(opening.wallId)
      const anchor = this.openingAnchors.get(opening.id)
      if (wall && anchor && moved.has(wall.start) && moved.has(wall.end)) {
        this.openingAnchors.set(opening.id, { x: anchor.x + dx, y: anchor.y + dy })
      }
    }
    let wallsChanged = false
    if (options.resolve !== false) {
      for (const corner of corners) {
        if (this.cornerMap.has(corner.id) && this.resolve(corner)) wallsChanged = true
      }
    }
    this.commit(wallsChanged ? 'walls' : 'corners')
  }

  /** Removes a corner and every wall at it, then any corner those walls leave stranded. */
  removeCorner(id: string): void {
    this.requireCorner(id)
    const walls = this.wallsAt(id)
    for (const wall of walls) this.wallMap.delete(wall.id)
    this.cornerMap.delete(id)
    this.removeIfStranded(walls.flatMap((wall) => [wall.start, wall.end]))
    this.commit(walls.length > 0 ? 'walls' : 'corners')
  }

  /** Removes a wall, and either of its corners if no other wall uses it. */
  removeWall(id: string): void {
    const wall = this.requireWall(id)
    this.wallMap.delete(id)
    this.removeIfStranded([wall.start, wall.end])
    this.commit('walls')
  }

  updateWall(id: string, changes: { thickness?: number; height?: number }): void {
    const wall = this.requireWall(id)
    if (changes.thickness !== undefined) wall.thickness = positive(changes.thickness, 'thickness')
    if (changes.height !== undefined) wall.height = positive(changes.height, 'height')
    this.commit('walls', id)
  }

  /**
   * Adds an item and returns its id. Its position is used as given: placement rules such as
   * snapping to walls are applied by the caller, with `placeItem()`.
   */
  addItem(item: {
    catalogKey: string
    position: Point
    rotation?: number
    elevation?: number
  }): string {
    const added: Item = {
      id: newId(),
      catalogKey: nonEmpty(item.catalogKey),
      position: finitePoint(item.position),
      elevation: nonNegative(item.elevation ?? 0),
      rotation: normalizeAngle(finite(item.rotation ?? 0, 'rotation')),
    }
    this.itemMap.set(added.id, added)
    this.commit('items')
    return added.id
  }

  /** Moves, turns or raises an item. Fires one change. */
  updateItem(
    id: string,
    changes: { position?: Point; rotation?: number; elevation?: number },
  ): void {
    const item = this.requireItem(id)
    if (changes.position !== undefined) item.position = finitePoint(changes.position)
    if (changes.rotation !== undefined) {
      item.rotation = normalizeAngle(finite(changes.rotation, 'rotation'))
    }
    if (changes.elevation !== undefined) item.elevation = nonNegative(changes.elevation)
    this.commit('items', id)
  }

  removeItem(id: string): void {
    this.requireItem(id)
    this.itemMap.delete(id)
    this.commit('items')
  }

  /**
   * Adds a door or window to a wall and returns its id. It is placed as near to `offset` as it
   * fits: inside the wall's usable stretch and clear of the wall's other openings. Throws a
   * `FloorplanError` if the wall has no room for it.
   */
  addOpening(input: {
    wallId: string
    kind: OpeningKind
    /** Distance along the wall from its start corner to the middle of the opening. */
    offset: number
    width?: number
    height?: number
    sill?: number
    hinge?: Opening['hinge']
    swing?: Opening['swing']
  }): string {
    const defaults = OPENING_DEFAULTS[input.kind]
    const opening: Opening = {
      id: newId(),
      wallId: input.wallId,
      kind: input.kind,
      offset: input.offset,
      width: input.width ?? defaults.width,
      height: input.height ?? defaults.height,
      sill: input.sill ?? defaults.sill,
      hinge: input.hinge ?? 'start',
      swing: input.swing ?? 'front',
    }
    opening.offset = this.fitOpening(opening)
    this.openingMap.set(opening.id, opening)
    this.anchorOpening(opening)
    this.commit('openings')
    return opening.id
  }

  /**
   * Moves, resizes or flips a door or window; `wallId` moves it to another wall. The result is
   * fitted as in `addOpening()`. Throws a `FloorplanError`, changing nothing, if it cannot fit.
   */
  updateOpening(
    id: string,
    changes: Partial<
      Pick<Opening, 'wallId' | 'offset' | 'width' | 'height' | 'sill' | 'hinge' | 'swing'>
    >,
  ): void {
    const opening = this.requireOpening(id)
    const candidate: Opening = { ...opening }
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) Object.assign(candidate, { [key]: value })
    }
    candidate.offset = this.fitOpening(candidate)
    Object.assign(opening, candidate)
    this.anchorOpening(opening)
    this.commit('openings', id)
  }

  removeOpening(id: string): void {
    this.requireOpening(id)
    this.openingMap.delete(id)
    this.openingAnchors.delete(id)
    this.commit('openings')
  }

  private requireOpening(id: string): Opening {
    const opening = this.openingMap.get(id)
    if (!opening) throw new FloorplanError(`Unknown opening "${id}"`)
    return opening
  }

  /** The offset at which an opening fits its wall, nearest to the one it asks for. */
  private fitOpening(opening: Opening): number {
    const wall = this.requireWall(opening.wallId)
    for (const name of ['width', 'height'] as const) {
      if (!(opening[name] > 0) || !Number.isFinite(opening[name])) {
        throw new FloorplanError(`An opening's ${name} must be a positive number`)
      }
    }
    if (!(opening.sill >= 0) || !Number.isFinite(opening.sill)) {
      throw new FloorplanError("An opening's sill must be zero or more")
    }
    if (!Number.isFinite(opening.offset)) {
      throw new FloorplanError("An opening's offset must be a number")
    }
    if (!fitsUnderTop(opening, wall.height)) {
      throw new FloorplanError('The opening is too tall for its wall')
    }
    const span = wallClearSpans(this.corners, this.walls).get(wall.id)
    const others = this.openingsOf(wall.id).filter((other) => other.id !== opening.id)
    const offset = span ? fitOffset(opening.offset, opening.width, span, others) : null
    if (offset === null) throw new FloorplanError('The wall has no room for the opening')
    return offset
  }

  /** Records where an opening is now as where it wants to be. */
  private anchorOpening(opening: Opening): void {
    const wall = this.wallMap.get(opening.wallId)
    const start = wall && this.cornerMap.get(wall.start)
    const end = wall && this.cornerMap.get(wall.end)
    if (start && end) this.openingAnchors.set(opening.id, openingCentre(opening, start, end))
  }

  /**
   * After corners or walls changed, puts every opening back on a wall as near to its anchor as
   * it fits. An opening whose wall is gone moves to a wall that now runs through its anchor (the
   * other half of a split), or is removed with its wall. One that no longer fits is left where
   * it is; `unfitOpenings()` reports it.
   */
  private rehomeOpenings(kind: FloorplanChangeKind): void {
    if (this.openingMap.size === 0) return
    // A loaded or restored plan is taken as it is; only an edit moves openings to follow walls.
    if (kind !== 'load' && kind !== 'restore') {
      for (const opening of [...this.openingMap.values()]) {
        const anchor = this.openingAnchors.get(opening.id)
        if (!anchor) continue
        const wall = this.wallMap.get(opening.wallId)
        const own = wall && this.projectOnto(wall, anchor)
        if (own && own.along >= 0 && own.along <= own.length) {
          opening.offset = own.along
          continue
        }
        const other = this.wallThrough(anchor, opening.wallId)
        if (other) {
          opening.wallId = other.wallId
          opening.offset = other.along
        } else if (own) {
          // Its wall no longer reaches the anchor: wait at the nearer end.
          opening.offset = Math.min(Math.max(own.along, 0), own.length)
        } else {
          this.openingMap.delete(opening.id)
          this.openingAnchors.delete(opening.id)
        }
      }
      const spans = wallClearSpans(this.corners, this.walls)
      for (const wall of this.wallMap.values()) {
        const span = spans.get(wall.id)
        if (!span) continue
        const placed: Opening[] = []
        for (const opening of this.openingsOf(wall.id) as Opening[]) {
          const offset = fitOffset(opening.offset, opening.width, span, placed)
          if (offset !== null) opening.offset = offset
          placed.push(opening)
        }
      }
    }
    // A plain corner move keeps the anchors, so that moving the corner back restores the openings.
    if (kind !== 'corners') {
      for (const opening of this.openingMap.values()) this.anchorOpening(opening)
    }
  }

  private projectOnto(wall: Wall, point: Point) {
    const start = this.cornerMap.get(wall.start)
    const end = this.cornerMap.get(wall.end)
    return start && end ? projectOntoWall(point, start, end) : undefined
  }

  /** A wall, other than `exceptId`, whose centreline passes through a point. */
  private wallThrough(point: Point, exceptId: string): { wallId: string; along: number } | null {
    for (const wall of this.wallMap.values()) {
      if (wall.id === exceptId) continue
      const projection = this.projectOnto(wall, point)
      if (
        projection &&
        projection.distance < 1e-3 &&
        projection.along >= 0 &&
        projection.along <= projection.length
      ) {
        return { wallId: wall.id, along: projection.along }
      }
    }
    return null
  }

  private requireItem(id: string): Item {
    const item = this.itemMap.get(id)
    if (!item) throw new FloorplanError(`Unknown item "${id}"`)
    return item
  }

  /**
   * Names the room, or renames it; an empty name removes the name. The name is kept as a record
   * anchored to a point inside the room, so it survives the room being reshaped or moved, and
   * lies dormant if the room's walls are removed, coming back when they are redrawn.
   */
  nameRoom(roomId: string, name: string): void {
    const room = this.roomMap.get(roomId)
    if (!room) throw new FloorplanError(`Unknown room "${roomId}"`)
    const trimmed = name.trim()
    if (trimmed.length > 60) throw new FloorplanError('A room name must be at most 60 characters')
    const existing = this.roomRecordByRoom.get(roomId)
    if (trimmed === '') {
      if (!existing) return
      this.roomRecords.delete(existing.id)
      this.commit('rooms', existing.id)
      return
    }
    if (existing) {
      if (existing.name === trimmed) return
      existing.name = trimmed
      this.commit('rooms', existing.id)
      return
    }
    const record: RoomRecord = { id: newId(), name: trimmed, anchor: insidePoint(room.polygon) }
    this.roomRecords.set(record.id, record)
    this.commit('rooms', record.id)
  }

  private requireCorner(id: string): Corner {
    const corner = this.cornerMap.get(id)
    if (!corner) throw new FloorplanError(`Unknown corner "${id}"`)
    return corner
  }

  private requireWall(id: string): Wall {
    const wall = this.wallMap.get(id)
    if (!wall) throw new FloorplanError(`Unknown wall "${id}"`)
    return wall
  }

  private wallBetween(a: string, b: string): Wall | undefined {
    for (const wall of this.wallMap.values()) {
      if ((wall.start === a && wall.end === b) || (wall.start === b && wall.end === a)) return wall
    }
    return undefined
  }

  /** The nearest other corner within tolerance of a point. */
  private cornerNear(point: Point, exclude: Corner | null): Corner | undefined {
    let best: Corner | undefined
    let bestDistance = this.options.cornerTolerance
    for (const corner of this.cornerMap.values()) {
      if (corner === exclude) continue
      const d = distance(point, corner)
      if (d < bestDistance) {
        best = corner
        bestDistance = d
      }
    }
    return best
  }

  /** Merges the corner into one it sits on, or splits a wall it sits on. Returns whether walls changed. */
  private resolve(corner: Corner): boolean {
    const target = this.cornerNear(corner, corner)
    if (target) {
      this.mergeCorners(corner, target)
      return true
    }
    return this.splitWallUnder(corner)
  }

  /** Folds `dropped` into `survivor`: walls are re-pointed, and self-joins and duplicates removed. */
  private mergeCorners(dropped: Corner, survivor: Corner): void {
    for (const wall of this.wallsAt(dropped.id)) {
      const other = wall.start === dropped.id ? wall.end : wall.start
      if (other === survivor.id || this.wallBetween(other, survivor.id)) {
        this.wallMap.delete(wall.id)
        continue
      }
      const stored = this.wallMap.get(wall.id)!
      if (stored.start === dropped.id) stored.start = survivor.id
      else stored.end = survivor.id
    }
    this.cornerMap.delete(dropped.id)
  }

  /**
   * If the corner lies within tolerance of a wall it is not part of, moves it onto that wall and
   * splits the wall there. Returns whether a split happened.
   */
  private splitWallUnder(corner: Corner): boolean {
    let hit: { wall: Wall; point: Point } | undefined
    let hitDistance = this.options.cornerTolerance
    for (const wall of this.wallMap.values()) {
      if (wall.start === corner.id || wall.end === corner.id) continue
      const start = this.cornerMap.get(wall.start)!
      const end = this.cornerMap.get(wall.end)!
      const { point, t } = closestPointOnSegment(corner, start, end)
      if (t <= 0 || t >= 1) continue
      const d = distance(corner, point)
      if (d < hitDistance) {
        hit = { wall, point }
        hitDistance = d
      }
    }
    if (!hit) return false

    corner.x = hit.point.x
    corner.y = hit.point.y
    const { wall } = hit
    const oldEnd = wall.end
    // First half: shorten the existing wall, unless the corner already joins its start.
    if (this.wallBetween(wall.start, corner.id)) this.wallMap.delete(wall.id)
    else wall.end = corner.id
    // Second half: a new wall, unless the corner already joins the old end.
    if (!this.wallBetween(corner.id, oldEnd)) {
      const second: Wall = {
        id: newId(),
        start: corner.id,
        end: oldEnd,
        thickness: wall.thickness,
        height: wall.height,
      }
      this.wallMap.set(second.id, second)
    }
    return true
  }

  private removeIfStranded(cornerIds: string[]): void {
    for (const id of new Set(cornerIds)) {
      if (this.cornerMap.has(id) && this.wallsAt(id).length === 0) this.cornerMap.delete(id)
    }
  }

  private commit(kind: FloorplanChangeKind, target?: string): void {
    const change = (roomsChanged: boolean): FloorplanChange =>
      target === undefined ? { kind, roomsChanged } : { kind, roomsChanged, target }
    // Items and openings never change the walls, so the rooms stay as they are.
    if (kind === 'items' || kind === 'openings') {
      this.emitter.emit('change', change(false))
      return
    }
    // A name change moves no geometry; only the names on the rooms need matching again.
    if (kind === 'rooms') {
      this.applyRoomNames()
      this.emitter.emit('change', change(false))
      return
    }
    this.rehomeOpenings(kind)
    const previousRoomIds = this.roomList.map((room) => room.id).join('|')
    this.recomputeRooms()
    const roomsChanged = previousRoomIds !== this.roomList.map((room) => room.id).join('|')
    this.emitter.emit('change', change(roomsChanged))
  }

  private recomputeRooms(): void {
    const { rooms, wallSides } = findRooms(this.corners, this.walls)
    this.roomList = rooms.map((room) => {
      const polygon = room.cornerIds.map((id) => {
        const corner = this.cornerMap.get(id)!
        return { x: corner.x, y: corner.y }
      })
      const halfThicknesses = room.wallIds.map((id) => this.wallMap.get(id)!.thickness / 2)
      return {
        ...room,
        polygon,
        interior: insetPolygon(polygon, halfThicknesses),
        area: signedArea(polygon),
        centroid: centroid(polygon),
      }
    })
    this.roomMap = new Map(this.roomList.map((room) => [room.id, room]))
    this.wallSideMap = wallSides
    this.applyRoomNames()
  }

  /**
   * Matches each name record to the room holding its anchor and writes the names onto the
   * rooms. A record whose room is gone stays dormant. Two records in one room (two rooms merged)
   * keep their order: the older one names the room, and splitting the rooms apart revives both.
   */
  private applyRoomNames(): void {
    this.roomRecordByRoom = new Map()
    const claimed = new Set<string>()
    for (const room of this.roomList) delete (room as { name?: string }).name
    for (const record of this.roomRecords.values()) {
      const room = this.roomList.find(
        (candidate) =>
          !claimed.has(candidate.id) && pointInPolygon(record.anchor, candidate.polygon),
      )
      if (!room) continue
      claimed.add(room.id)
      this.roomRecordByRoom.set(room.id, record)
      ;(room as { name?: string }).name = record.name
      // Follow the room: a room dragged elsewhere keeps its name, as openings keep their place.
      record.anchor = insidePoint(room.polygon)
    }
  }
}

function newId(): string {
  return crypto.randomUUID()
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new FloorplanError(`An item's ${name} must be a number`)
  return value
}

function finitePoint(point: Point): { x: number; y: number } {
  return { x: finite(point.x, 'position'), y: finite(point.y, 'position') }
}

function nonNegative(value: number): number {
  if (!(value >= 0) || !Number.isFinite(value)) {
    throw new FloorplanError("An item's elevation must be zero or more")
  }
  return value
}

function nonEmpty(key: string): string {
  if (key.length === 0) throw new FloorplanError('An item needs a catalogue key')
  return key
}

function positive(value: number, name: string): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new FloorplanError(`A wall's ${name} must be a positive number`)
  }
  return value
}
