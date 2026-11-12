import { renderHook } from '@testing-library/react'
import { v4 } from 'uuid'
import type * as Uuid from 'uuid'

import { useIdempotencyKey } from '@/hooks/useIdempotencyKey'

jest.mock('uuid', () => {
  const actual = jest.requireActual<typeof Uuid>('uuid')
  return { ...actual, v4: jest.fn(actual.v4) }
})

describe('useIdempotencyKey', () => {
  beforeEach(() => {
    jest.mocked(v4).mockClear()
  })

  it('returns the same key for the same payload', () => {
    const { result } = renderHook(() => useIdempotencyKey())

    const first = result.current.keyFor({ name: 'Espresso' })
    const second = result.current.keyFor({ name: 'Espresso' })

    expect(second).toBe(first)
  })

  it('returns a new key when the payload changes', () => {
    const { result } = renderHook(() => useIdempotencyKey())

    const first = result.current.keyFor({ name: 'Espresso' })
    const second = result.current.keyFor({ name: 'Latte' })

    expect(second).not.toBe(first)
  })

  it('returns a new key after clear', () => {
    const { result } = renderHook(() => useIdempotencyKey())

    const first = result.current.keyFor({ name: 'Espresso' })
    result.current.clear()
    const second = result.current.keyFor({ name: 'Espresso' })

    expect(second).not.toBe(first)
  })

  it('makes keys with uuid v4, which also works where crypto.randomUUID is missing (plain HTTP)', () => {
    const { result } = renderHook(() => useIdempotencyKey())

    const key = result.current.keyFor({ name: 'Espresso' })

    expect(jest.mocked(v4)).toHaveBeenCalledTimes(1)
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
