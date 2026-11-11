// This entry point must stay free of Three.js so that a backend can validate plans without 3D code.
export {
  PLAN_FORMAT_VERSION,
  cornerSchema,
  createEmptyPlan,
  itemSchema,
  planSchema,
  wallSchema,
} from './plan.js'
export type { Corner, Item, Plan, Wall } from './plan.js'
