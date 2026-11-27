'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const heldLinkHref = (event: MouseEvent): string | null => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return null
  }
  const anchor =
    event.target instanceof Element ? event.target.closest('a[href]') : null
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.target && anchor.target !== '_self') return null
  if (anchor.hasAttribute('download')) return null

  const url = new URL(anchor.href, window.location.href)
  if (url.origin !== window.location.origin) return null
  const current = window.location
  if (url.pathname === current.pathname && url.search === current.search) {
    return null
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export function useUnsavedChangesWarning(enabled: boolean) {
  const router = useRouter()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    const handleClick = (event: MouseEvent) => {
      const href = heldLinkHref(event)
      if (href === null) return
      event.preventDefault()
      event.stopPropagation()
      setPendingHref(href)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('click', handleClick, true)
    }
  }, [enabled])

  const stay = useCallback(() => setPendingHref(null), [])

  const leave = useCallback(() => {
    if (pendingHref === null) return
    setPendingHref(null)
    router.push(pendingHref)
  }, [pendingHref, router])

  return { pendingHref, stay, leave }
}
