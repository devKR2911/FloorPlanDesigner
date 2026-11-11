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
export * from './geometry.js'
export * from '../schema/index.js'
