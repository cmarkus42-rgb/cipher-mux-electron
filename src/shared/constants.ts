/** Application-wide constants */

export const APP_NAME = 'cipher-mux'
export const APP_VERSION = '0.1.0'

/** Maximum concurrent sessions */
export const MAX_SESSIONS = 10

/** MCP Server defaults */
export const MCP_DEFAULT_PORT = 3100
export const MCP_DEFAULT_HOST = '127.0.0.1'

/** Context usage warning threshold (percentage) */
export const CONTEXT_WARNING_THRESHOLD = 80

/** Message retention in days */
export const MESSAGE_RETENTION_DAYS = 7

/** Output batching interval for terminal streaming (ms) */
export const OUTPUT_BATCH_INTERVAL_MS = 16

/** Layout save debounce (ms) */
export const LAYOUT_SAVE_DEBOUNCE_MS = 500

/** Message cleanup interval (ms) — every 6 hours */
export const MESSAGE_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

/** Orchestrator config */
export const ORCHESTRATOR_DIR = '~/.config/cipher-mux/orchestrator'
export const ORCHESTRATOR_MAX_RETRIES = 2

/** StatusLine monitor directory */
export const STATUSLINE_DIR = '/tmp/cipher-mux/context'

/** Default scan paths */
export const DEFAULT_SCAN_PATHS = ['/Users/Shared/Nextcloud/Claude/ClaudeCode01']
export const DEFAULT_PROJECT_DIR = '/Users/Shared/Nextcloud/Claude/ClaudeCode01'
/** Default scan depth (directory levels below each scanPath that are inspected). */
export const DEFAULT_SCAN_DEPTH = 1
/** Max allowed scan depth (guardrail against runaway recursion). */
export const MAX_SCAN_DEPTH = 5

/** Window defaults */
export const DEFAULT_WINDOW_WIDTH = 1400
export const DEFAULT_WINDOW_HEIGHT = 900

/** Activity Rail width */
export const ACTIVITY_RAIL_WIDTH = 48

/** Chatroom panel width */
export const CHATROOM_PANEL_WIDTH = 280
