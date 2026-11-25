import * as routes from '@/constants/routes'
import {
  API_ROUTES,
  ROUTES,
  dashboardEditPath,
  dashboardInventoryHistoryPath,
  dashboardOrderPath,
  profileOrderPath,
} from '@/constants/routes'

describe('routes', () => {
  it('profileOrderPath builds the order details route and encodes the order number', () => {
    expect(profileOrderPath('CH-261117-0001')).toBe(
      `${ROUTES.USER_PROFILE}/orders/CH-261117-0001`,
    )
    expect(profileOrderPath('a b/c')).toBe(
      `${ROUTES.USER_PROFILE}/orders/a%20b%2Fc`,
    )
  })

  it('dashboardOrderPath encodes the order number under /dashboard/orders', () => {
    expect(dashboardOrderPath('CH-261117-0001')).toBe(
      `${ROUTES.DASHBOARD_ORDERS}/CH-261117-0001`,
    )
    expect(dashboardOrderPath('a b/c')).toBe(
      `${ROUTES.DASHBOARD_ORDERS}/a%20b%2Fc`,
    )
  })

  it('dashboardInventoryHistoryPath encodes the id', () => {
    expect(dashboardInventoryHistoryPath('v-1')).toBe(
      `${ROUTES.DASHBOARD_INVENTORY}/v-1`,
    )
    expect(dashboardInventoryHistoryPath('a b')).toBe(
      `${ROUTES.DASHBOARD_INVENTORY}/a%20b`,
    )
  })

  it('dashboardEditPath builds the edit route under a base', () => {
    expect(dashboardEditPath(ROUTES.DASHBOARD_CATEGORIES, 'cat-1')).toBe(
      '/dashboard/categories/cat-1/edit',
    )
    expect(dashboardEditPath(ROUTES.DASHBOARD_PRODUCTS, 'product-1')).toBe(
      '/dashboard/products/product-1/edit',
    )
  })

  it('dashboardEditPath encodes the id', () => {
    expect(dashboardEditPath(ROUTES.DASHBOARD_CATEGORIES, 'a/b')).toBe(
      '/dashboard/categories/a%2Fb/edit',
    )
  })

  it('builds the shipping method edit path', () => {
    expect(ROUTES.DASHBOARD_SHIPPING_METHODS).toBe(
      '/dashboard/shipping-methods',
    )
    expect(ROUTES.DASHBOARD_SHIPPING_METHODS_ADD).toBe(
      '/dashboard/shipping-methods/add',
    )
    expect(dashboardEditPath(ROUTES.DASHBOARD_SHIPPING_METHODS, 'sm-1')).toBe(
      '/dashboard/shipping-methods/sm-1/edit',
    )
    expect(
      API_ROUTES.SHIPPING_METHODS.endsWith('/api/v1/shipping-methods'),
    ).toBe(true)
  })

  it('API_ROUTES.CART ends with /api/v1/cart', () => {
    expect(API_ROUTES.CART.endsWith('/api/v1/cart')).toBe(true)
  })

  it('exports no per-entity edit route helpers', () => {
    expect(routes).not.toHaveProperty('dashboardCategoryEditRoute')
    expect(routes).not.toHaveProperty('dashboardProductEditPath')
  })
})
