/**
 * Hub module — all hub tools and utilities.
 * Exports foundation (paths, types, archiv-verweis) and tools (REQ-HUB-001 through 007).
 */

// Foundation
export * from './hub-paths'
export * from './types'
export { readEntries, getEntry, updateStatus, addEntry } from './archiv-verweis'

// Tools
export { integrate, IntegrateInputSchema } from './integrate'
export type { IntegrateInput, IntegrateResult } from './integrate'

export { inventory, InventoryInputSchema } from './inventory'
export type { InventoryInput, InventoryResult } from './inventory'

export { migrationPlan, MigrationPlanInputSchema } from './migration-plan'
export type { MigrationPlanInput, MigrationPlanResult } from './migration-plan'
