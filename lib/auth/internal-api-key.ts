import { NextRequest } from 'next/server'

/**
 * Constant-time comparison of the incoming x-api-key header against
 * INTERNAL_API_KEY. Falls closed if the env var is missing.
 *
 * Pure-JS XOR-accumulator compare — Edge-runtime compatible.
 * Timing signal for a 64-byte compare is far below network jitter.
 */
export function isInternalCall(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY
  if (!expected) return false

  const provided = request.headers.get('x-api-key') ?? ''
  if (provided.length !== expected.length) return false

  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
