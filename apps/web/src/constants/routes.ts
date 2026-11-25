export const ROUTES = {
  HOME: '/',
  CART: '/cart',
  CHECKOUT: '/checkout',
  ORDER_SUCCESS: '/order-success',
  DASHBOARD: '/dashboard',
  DASHBOARD_PRODUCTS: '/dashboard/products',
  DASHBOARD_PRODUCTS_ADD: '/dashboard/products/add',
  DASHBOARD_CATEGORIES: '/dashboard/categories',
  DASHBOARD_CATEGORIES_ADD: '/dashboard/categories/add',
  DASHBOARD_USERS: '/dashboard/users',
  DASHBOARD_USERS_ADD: '/dashboard/users/add',
  DASHBOARD_ORDERS: '/dashboard/orders',
  DASHBOARD_INVENTORY: '/dashboard/inventory',
  DASHBOARD_SHIPPING_METHODS: '/dashboard/shipping-methods',
  DASHBOARD_SHIPPING_METHODS_ADD: '/dashboard/shipping-methods/add',
  SIGN_IN: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? '/sign-in',
  SIGN_UP: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? '/sign-up',
  SIGN_UP_VERIFY: `${process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? '/sign-up'}/verify`,
  USER_PROFILE: '/profile',
  ROASTS: '/roasts',
}

export function orderSuccessPath(
  orderId: string,
  paymentError?: string,
): string {
  const params = new URLSearchParams({ orderId })
  if (paymentError !== undefined) params.set('paymentError', paymentError)
  return `${ROUTES.ORDER_SUCCESS}?${params.toString()}`
}

/** The shopper's order details page. */
export function profileOrderPath(orderNumber: string): string {
  return `${ROUTES.USER_PROFILE}/orders/${encodeURIComponent(orderNumber)}`
}

/** The admin's order details page. */
export function dashboardOrderPath(orderNumber: string): string {
  return `${ROUTES.DASHBOARD_ORDERS}/${encodeURIComponent(orderNumber)}`
}

/** A variant's stock history on the dashboard. */
export function dashboardInventoryHistoryPath(variantId: string): string {
  return `${ROUTES.DASHBOARD_INVENTORY}/${encodeURIComponent(variantId)}`
}

export function dashboardEditPath(base: string, id: string): string {
  return `${base}/${encodeURIComponent(id)}/edit`
}

export function shopRoastDetailPath(roastId: string): string {
  return `/roasts/${encodeURIComponent(roastId.trim())}`
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export const API_ROUTES = {
  ME: `${API_BASE_URL}/api/v1/users/me`,
  USERS: `${API_BASE_URL}/api/v1/users`,
  CATEGORIES: `${API_BASE_URL}/api/v1/categories`,
  PRODUCTS: `${API_BASE_URL}/api/v1/products`,
  ORDERS: `${API_BASE_URL}/api/v1/orders`,
  SHIPPING_METHODS: `${API_BASE_URL}/api/v1/shipping-methods`,
  CART: `${API_BASE_URL}/api/v1/cart`,
  INVENTORY: `${API_BASE_URL}/api/v1/inventory`,
  PRODUCT_VARIANTS: `${API_BASE_URL}/api/v1/product-variants`,
}
