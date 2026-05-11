import { randomBytes, timingSafeEqual } from 'crypto'

/**
 * Generate a random 32-character hex API key.
 */
export function generateApiKey(): string {
  return randomBytes(16).toString('hex')
}

/**
 * Validate a Bearer token from an Authorization header.
 * Expected format: "Bearer <apiKey>"
 * Uses timing-safe comparison to prevent side-channel attacks.
 */
export function validateBearer(authHeader: string | undefined, apiKey: string): boolean {
  if (!authHeader) return false
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return false
  const token = parts[1]
  if (token.length !== apiKey.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(apiKey))
}
