import { useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'

import { IDEMPOTENCY } from '@/constants/common'
import type { ApiErrorResponse } from '@/types/api'

export interface IdempotencyKeyHandle {
  /** The key for this payload: reused while the payload is unchanged, new otherwise. */
  keyFor: (payload: unknown) => string
  /** Forgets the key, so the next create gets a new one (after a success). */
  clear: () => void
}

/**
 * One `Idempotency-Key` per create decision: a retry of the same values sends
 * the same key, so the API answers it with the original result instead of a
 * second record. Kept in memory only.
 */
export function useIdempotencyKey(): IdempotencyKeyHandle {
  const current = useRef<{ key: string; payload: string } | null>(null)

  return {
    keyFor: (payload) => {
      const serialized = JSON.stringify(payload)
      if (current.current?.payload !== serialized) {
        // uuid's v4 uses crypto.randomUUID where it exists, and falls back to
        // crypto.getRandomValues on plain-HTTP hosts, where randomUUID is missing.
        current.current = { key: uuidv4(), payload: serialized }
      }
      return current.current.key
    },
    clear: () => {
      current.current = null
    },
  }
}

type CreateResult =
  | { ok: true }
  | { ok: false; status?: number; errorResponse?: ApiErrorResponse }

const isInFlight = (result: CreateResult): boolean =>
  !result.ok &&
  result.status === 409 &&
  result.errorResponse?.errors?.[0]?.errCode === IDEMPOTENCY.IN_FLIGHT_ERR_CODE

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Calls `send` again while the API says a request with the same key is still
 * running (a fast second click), so the caller gets the replayed record
 * instead of an error. Bounded by `IN_FLIGHT_MAX_RETRIES`.
 */
export async function sendUntilSettled<T extends CreateResult>(
  send: () => Promise<T>,
): Promise<T> {
  let result = await send()
  for (
    let retry = 0;
    retry < IDEMPOTENCY.IN_FLIGHT_MAX_RETRIES && isInFlight(result);
    retry++
  ) {
    await wait(IDEMPOTENCY.IN_FLIGHT_RETRY_MS)
    result = await send()
  }
  return result
}
