// This entry point must stay free of Three.js so that a backend can validate plans without 3D code.
export {
  PLAN_FORMAT_VERSION,
  cornerSchema,
  createEmptyPlan,
  itemSchema,
  openingSchema,
  planSchema,
  roomRecordSchema,
  unitSystemSchema,
  wallSchema,
} from './plan.js'
export type {
  Corner,
  Item,
  Opening,
  OpeningKind,
  Plan,
  RoomRecord,
  UnitSystem,
  Wall,
} from './plan.js'
export {
  footprintPieceProblem,
  footprintSchema,
  itemDefinitionSchema,
  placementTypeSchema,
} from './item-definition.js'
export type {
  Footprint,
  ItemDefinition,
  ItemShape,
  ItemSize,
  PlacementType,
} from './item-definition.js'
