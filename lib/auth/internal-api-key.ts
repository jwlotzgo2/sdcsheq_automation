import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * Timing-safe comparison of the incoming x-api-key header against
 * INTERNAL_API_KEY. Falls closed if the env var is missing.
 */
export function isInternalCall(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) return false

  const provided = request.headers.get('x-api-key') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
