'use client'

import { useAuth as useClerkAuth } from '@clerk/nextjs'
import { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { fetchUser } from '@/services/user'
import { useUserStore } from '@/store/useUserStore'
import { CLERK_SESSION_TEMPLATE } from '@/constants/common'

export const useAuth = () => {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth()

  const [user, setUser, isLoading, error, setLoading, setError, reset] =
    useUserStore(
      useShallow((state) => [
        state.user,
        state.setUser,
        state.isLoading,
        state.error,
        state.setLoading,
        state.setError,
        state.reset,
      ]),
    )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await fetchUser(() =>
      getToken({ template: CLERK_SESSION_TEMPLATE }),
    )

    if (result.ok) {
      setUser(result?.user)
    } else {
      setUser(null)
      setError(result.error)
    }
    setLoading(false)
  }, [getToken, setError, setLoading, setUser])

  // Reads the user again in the background: no loading state, and a failed
  // request keeps the user already shown.
  const refresh = useCallback(async () => {
    const result = await fetchUser(() =>
      getToken({ template: CLERK_SESSION_TEMPLATE }),
    )
    if (!result.ok) return
    setUser(result.user)
    setError(null)
  }, [getToken, setError, setUser])

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) {
      reset()
      setError(null)
      return
    }
    void load()
  }, [isLoaded, isSignedIn, reset, load])

  return {
    user,
    isLoading,
    error,
    refetch: load,
    refresh,
    isSignedIn,
    isAuthLoaded: isLoaded,
  }
}
