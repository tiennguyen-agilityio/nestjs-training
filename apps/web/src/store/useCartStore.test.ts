import { EMPTY_IMAGE } from '@/constants/images'
import { useCartStore } from '@/store/useCartStore'
import type { CartItem } from '@/types/cart'
import type { PlacedOrder } from '@/types/order'

const CART_STORAGE_KEY = 'coffeehub-cart'

const line: CartItem = {
  id: 'v1',
  variantId: 'v1',
  productId: 'p1',
  name: 'Colombia Huila',
  meta: 'Medium',
  imageUrl: EMPTY_IMAGE,
  unitPrice: 14,
  quantity: 2,
  maxQuantity: 5,
}

const chunks = [{ items: [{ productVariantId: 'v1', quantity: 2 }] }]

describe('useCartStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useCartStore.setState({
      items: [line],
      mergeKeys: null,
      mergeNotice: null,
      isMerging: false,
    })
  })

  it('mergeKeysFor keeps the keys for the same lines', () => {
    const first = useCartStore.getState().mergeKeysFor(chunks)
    const second = useCartStore.getState().mergeKeysFor(chunks)

    expect(first).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('mergeKeysFor gives new keys when the lines change', () => {
    const first = useCartStore.getState().mergeKeysFor(chunks)
    const changed = useCartStore
      .getState()
      .mergeKeysFor([{ items: [{ productVariantId: 'v1', quantity: 3 }] }])

    expect(changed).toHaveLength(1)
    expect(changed[0]).not.toBe(first[0])
  })

  it('clearMergedCart empties the items and the keys', () => {
    useCartStore.getState().mergeKeysFor(chunks)

    useCartStore.getState().clearMergedCart()

    expect(useCartStore.getState().items).toEqual([])
    expect(useCartStore.getState().mergeKeys).toBeNull()
  })

  it('rehydrates an old cart with no merge keys', async () => {
    // setState writes to storage itself, so it runs before the saved cart is set.
    useCartStore.setState({ items: [], mergeKeys: null })
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        state: { items: [line], itemSnapshots: null },
        version: 0,
      }),
    )

    await useCartStore.persist.rehydrate()

    expect(useCartStore.getState().mergeKeys).toBeNull()
    expect(useCartStore.getState().items).toHaveLength(1)
  })

  it('does not persist mergeNotice or isMerging', () => {
    useCartStore.getState().setMergeNotice('Some items changed')
    useCartStore.getState().setMerging(true)
    useCartStore.getState().mergeKeysFor(chunks)

    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{}')

    expect(saved.state).not.toHaveProperty('mergeNotice')
    expect(saved.state).not.toHaveProperty('isMerging')
    expect(Object.keys(saved.state.mergeKeys)).toHaveLength(1)
  })

  it('keeps the key of an unchanged chunk when another chunk changes', () => {
    const second = { items: [{ productVariantId: 'v2', quantity: 1 }] }
    const [firstKey] = useCartStore.getState().mergeKeysFor([...chunks, second])

    const [sameKey] = useCartStore
      .getState()
      .mergeKeysFor([
        ...chunks,
        { items: [{ productVariantId: 'v2', quantity: 3 }] },
      ])

    expect(sameKey).toBe(firstKey)
  })

  it('removeMergedLines drops the merged lines and their key', () => {
    useCartStore.setState({
      items: [line, { ...line, id: 'v2', variantId: 'v2' }],
    })
    const second = { items: [{ productVariantId: 'v2', quantity: 2 }] }
    useCartStore.getState().mergeKeysFor([...chunks, second])

    useCartStore.getState().removeMergedLines(chunks[0] ?? { items: [] })

    expect(useCartStore.getState().items.map((item) => item.variantId)).toEqual(
      ['v2'],
    )
    expect(Object.keys(useCartStore.getState().mergeKeys ?? {})).toEqual([
      JSON.stringify(second),
    ])
  })

  it('persists a PlacedOrder snapshot', async () => {
    const order = {
      id: 'order-1',
      orderNumber: 'NB-000123',
      recipientName: 'Ada Lovelace',
      items: [{ id: 'item-1', lineTotal: 24 }],
      totalAmount: 26.4,
    } as PlacedOrder

    useCartStore.getState().setItemSnapshots(order)
    const saved = localStorage.getItem(CART_STORAGE_KEY) ?? '{}'
    // setState writes to storage itself, so the saved value is put back after it.
    useCartStore.setState({ itemSnapshots: null })
    localStorage.setItem(CART_STORAGE_KEY, saved)
    await useCartStore.persist.rehydrate()

    expect(JSON.parse(saved).state.itemSnapshots).toEqual(order)
    expect(useCartStore.getState().itemSnapshots).toEqual(order)
  })
})
