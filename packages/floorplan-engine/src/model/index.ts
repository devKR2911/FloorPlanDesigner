// The floor-plan model. This entry point must stay free of Three.js.
export { Floorplan, FloorplanError } from './floorplan.js'
export type {
  FloorplanChange,
  FloorplanChangeKind,
  FloorplanEvents,
  FloorplanOptions,
  Room,
} from './floorplan.js'
export { findRooms } from './rooms.js'
export type { DetectedRoom, RoomDetection, WallSide } from './rooms.js'
export { MITRE_LIMIT, wallFootprints } from './wall-footprints.js'
export type { FootprintEdge, WallFootprint } from './wall-footprints.js'
export {
  OVERLAP_TOLERANCE,
  convexPolygonsOverlap,
  findOverlaps,
  itemAt,
  itemAxes,
  itemOutline,
  normalizeAngle,
  wallRectangle,
} from './item-geometry.js'
export type { ItemPose } from './item-geometry.js'
export { FALLBACK_ITEM_SIZE, ItemCatalog } from './item-catalog.js'
export type { ItemCatalogEvents } from './item-catalog.js'
export { defaultPlacementSettings, findFreeSpot, placeItem } from './placement.js'
export type { PlacementResult, PlacementSettings } from './placement.js'
export {
  OPENING_DEFAULTS,
  OPENING_END_MARGIN,
  OPENING_GAP,
  OPENING_TOP_MARGIN,
  defaultOpeningSnapSettings,
  fitOffset,
  fitsUnderTop,
  nearestWall,
  nextDoorSwing,
  openingAt,
  openingCentre,
  openingOutline,
  projectOntoWall,
  snapOpeningOffset,
  unfitOpenings,
  wallClearSpans,
} from './wall-openings.js'
export type { OpeningHost, OpeningSnapSettings, WallProjection, WallSpan } from './wall-openings.js'
export { WALKER_RADIUS, moveWalker, wallBlocks } from './walk-collision.js'
export type { WallBlock } from './walk-collision.js'
export { History } from './history.js'
export type { HistoryEvents, HistoryOptions } from './history.js'
export * from './geometry.js'
export * from '../schema/index.js'
