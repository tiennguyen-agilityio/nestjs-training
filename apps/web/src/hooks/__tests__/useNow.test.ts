import { act, renderHook } from '@testing-library/react'

import { useNow } from '@/hooks/useNow'

describe('useNow', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-11-25T04:35:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('ticks every intervalMs', () => {
    const { result } = renderHook(() => useNow(15_000))
    const start = result.current

    expect(start).toBe(Date.parse('2026-11-25T04:35:00.000Z'))
    act(() => {
      jest.advanceTimersByTime(15_000)
    })

    expect(result.current).toBe(start + 15_000)
  })

  it('does not tick when disabled', () => {
    const { result } = renderHook(() => useNow(15_000, false))
    const start = result.current

    act(() => {
      jest.advanceTimersByTime(60_000)
    })

    expect(result.current).toBe(start)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears its interval on unmount', () => {
    const { unmount } = renderHook(() => useNow(15_000))
    expect(jest.getTimerCount()).toBe(1)

    unmount()

    expect(jest.getTimerCount()).toBe(0)
  })
})
