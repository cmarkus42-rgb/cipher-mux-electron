/**
 * Hub-Migration Types — shared interfaces for all hub tools.
 * Worker A1 implements hub-paths and archiv-verweis using these types.
 * Worker A2 implements apply, verify, release, rollback using these types.
 */

// ─── Status ──────────────────────────────────────────────────

export type HubStatus =
  | 'nicht-migriert'
  | 'kopiert'
  | 'migriert-nicht-getestet'
  | 'migriert-getestet'
  | 'freigegeben'
  | 'parallel-betrieben'

export const VALID_HUB_STATUSES: readonly HubStatus[] = [
  'nicht-migriert',
  'kopiert',
  'migriert-nicht-getestet',
  'migriert-getestet',
  'freigegeben',
  'parallel-betrieben',
]

// ─── Hub Paths (implemented by Worker A1) ────────────────────

export interface HubPaths {
  /** Root of the CIPHER-MUX hub */
  readonly hubRoot: string
  /** projects/ directory */
  readonly projectsDir: string
  /** workspaces/ directory */
  readonly workspacesDir: string
  /** migrations/ directory */
  readonly migrationsDir: string

  /** Get the hub path for a project */
  projectPath(projectName: string): string
  /** Get the migrations dir for a project */
  migrationDir(projectName: string): string
  /** Get ARCHIV-VERWEIS.md path */
  archivVerweisPath(): string
}

// ─── Archiv-Verweis Entry ────────────────────────────────────

export interface ArchivVerweisEntry {
  projekt: string
  originalPfad: string
  hubPfad: string
  status: HubStatus
  freigabeDatum: string | null
}

// ─── Archiv-Verweis (implemented by Worker A1) ───────────────

export interface ArchivVerweis {
  /** Read all entries */
  readEntries(): ArchivVerweisEntry[]
  /** Get a single entry by project name */
  getEntry(projectName: string): ArchivVerweisEntry | null
  /** Update status for a project */
  updateStatus(projectName: string, status: HubStatus, freigabeDatum?: string): void
  /** Add a new entry */
  addEntry(entry: ArchivVerweisEntry): void
}

// ─── Project Meta ────────────────────────────────────────────

export interface ProjectMeta {
  archived_origin: string
  lifecycle_phase: string
  base_version?: string
  path_aliases?: Record<string, string>
  original_push_url?: string
  [key: string]: unknown
}

// ─── Stack Detection ─────────────────────────────────────────

export type RuntimeKind = 'node' | 'python' | 'rust' | 'go' | 'unknown'

export interface StackInfo {
  runtime: RuntimeKind
  manifest: string
  buildCommand: string | null
  testCommand: string | null
  installCommand: string | null
}

// ─── Apply Types (REQ-HUB-004) ──────────────────────────────

export interface ApplyStep {
  id: string
  description: string
  action: string
  applied: boolean
  skipped: boolean
  error?: string
}

export interface ApplyResult {
  stepsTotal: number
  stepsApplied: number
  stepsSkipped: number
  stepsFailed: number
  applyLogPath: string
  projectMetaCreated: boolean
  workspaceCreated: boolean
}

export interface ApplyOptions {
  projectName: string
  planPath?: string
  dryRun?: boolean
}

// ─── Verify Types (REQ-HUB-005) ─────────────────────────────

export interface VerifyResult {
  installSuccess: boolean | null
  buildSuccess: boolean | null
  testSuccess: boolean | null
  testsPassed: number
  testsFailed: number
  verifyLogPath: string
  readyForRelease: boolean
}

export interface VerifyOptions {
  projectName: string
  installDeps?: boolean
  runBuild?: boolean
  runTests?: boolean
}

// ─── Release Types (REQ-HUB-006) ────────────────────────────

export interface ReleaseResult {
  released: boolean
  hubPath: string
  originalPath: string
  originalPushUrl: string
  pushSperreGesetzt: boolean
  migratedMdGeschrieben: boolean
  workspaceUpdated: boolean
}

// ─── Rollback Types (REQ-HUB-007) ───────────────────────────

export interface RollbackResult {
  rolledBack: boolean
  workspacePointsTo: string
  pushSperreEntfernt: boolean
  hubCopyRemoved: boolean
}

export interface RollbackOptions {
  projectName: string
  removeHubCopy?: boolean
}

// ─── Migration Plan (parsed structure) ───────────────────────

export interface MigrationPlanStep {
  id: string
  section: 'unchanged' | 'extended' | 'new'
  description: string
  action: string
}

export interface MigrationPlan {
  projectName: string
  steps: MigrationPlanStep[]
  createdAt: string
}
