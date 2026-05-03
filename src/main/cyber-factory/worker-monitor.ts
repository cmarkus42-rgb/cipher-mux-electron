import type { StuckDetectionConfig } from './types.js'

export interface WorkerSnapshot {
  lastHeartbeat: number
  lastOutputLength: number
  previousOutputLength: number
  lastOutputCheckAt: number
}

export function detectStuck(
  snapshot: WorkerSnapshot,
  config: StuckDetectionConfig,
  now: number = Date.now(),
): boolean {
  // Condition 1: heartbeat timeout
  if (now - snapshot.lastHeartbeat > config.heartbeatTimeoutMs) {
    return true
  }

  // Condition 2: output plateau
  const timeSinceLastCheck = now - snapshot.lastOutputCheckAt
  if (timeSinceLastCheck > config.outputPlateauMs) {
    const outputGrowth = snapshot.lastOutputLength - snapshot.previousOutputLength
    if (outputGrowth < config.minOutputCharsInPlateau) {
      return true
    }
  }

  return false
}
