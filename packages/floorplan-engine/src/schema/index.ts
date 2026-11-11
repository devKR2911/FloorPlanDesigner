// This entry point must stay free of Three.js so that a backend can validate plans without 3D code.
export {
  PLAN_FORMAT_VERSION,
  cornerSchema,
  createEmptyPlan,
  itemSchema,
  openingSchema,
  planSchema,
  wallSchema,
} from './plan.js'
export type { Corner, Item, Opening, OpeningKind, Plan, Wall } from './plan.js'
export { itemDefinitionSchema, placementTypeSchema } from './item-definition.js'
export type { ItemDefinition, ItemSize, PlacementType } from './item-definition.js'
