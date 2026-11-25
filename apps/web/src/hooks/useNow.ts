'use client'

import { useEffect, useState } from 'react'

/**
 * The current time in ms, re-read every `intervalMs` while `enabled`.
 * The interval is cleared on unmount and when disabled.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])

  return now
}
