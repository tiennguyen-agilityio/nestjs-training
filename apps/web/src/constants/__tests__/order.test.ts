import * as order from '@/constants/order'

describe('order constants', () => {
  it('exports no DELIVERY_SPEED', () => {
    // Checkout reads the shipping methods from the API instead.
    expect(order).not.toHaveProperty('DELIVERY_SPEED')
  })
  it('order constants no longer export the ORDERS mock', () => {
    expect('ORDERS' in order).toBe(false)
  })
})
