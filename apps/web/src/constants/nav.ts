import {
  User,
  Users,
  LogOut,
  LayoutDashboard,
  Coffee,
  Heart,
  FileText,
  Settings,
  Home,
  Tags,
  Truck,
} from 'lucide-react'

import { type DashboardMenuItem, type MenuItem } from '@/types/menu'
import { ROUTES } from './routes'

export const USER_DROPDOWNS = (isAdmin?: boolean, isDashboard?: boolean) => [
  ...(isAdmin
    ? [
        {
          text: 'Go to Dashboard',
          Icon: LayoutDashboard,
          href: ROUTES.DASHBOARD,
        },
      ]
    : []),
  ...(isDashboard
    ? [
        {
          text: 'Go to Website',
          Icon: Home,
          href: ROUTES.HOME,
        },
      ]
    : []),
  {
    text: 'Profile',
    Icon: User,
    href: ROUTES.USER_PROFILE,
  },
  {
    text: 'Sign out',
    Icon: LogOut,
    href: '/',
    isSignOut: true,
  },
]

export const USER_DROPDOWNS_LENGTH = USER_DROPDOWNS.length

export const MENU: MenuItem[] = [
  { label: 'Shop', href: '/', match: 'exact' },
  { label: 'Roasts', href: '/roasts', match: 'prefix' },
  {
    label: 'Brew Guides',
    href: '/brew-guides',
    match: 'prefix',
    disabled: true,
  },
  {
    label: 'Subscriptions',
    href: '/subscriptions',
    match: 'prefix',
    disabled: true,
  },
  { label: 'Contact', href: '/contact', match: 'prefix', disabled: true },
]

export const MENU_DISABLED_HINT = 'Coming soon'

export const DASHBOARD_DISABLED_HINT = 'Coming soon'

export const DASHBOARD_MENU: DashboardMenuItem[] = [
  {
    label: 'Dashboard',
    href: ROUTES.DASHBOARD,
    icon: LayoutDashboard,
    match: 'exact',
  },
  {
    label: 'Categories',
    href: ROUTES.DASHBOARD_CATEGORIES,
    icon: Tags,
    match: 'prefix',
  },
  {
    label: 'Products',
    href: ROUTES.DASHBOARD_PRODUCTS,
    icon: Coffee,
    match: 'prefix',
  },
  {
    label: 'Shipping methods',
    href: ROUTES.DASHBOARD_SHIPPING_METHODS,
    icon: Truck,
    match: 'prefix',
  },
  {
    label: 'Favorites',
    href: '/dashboard/favorites',
    icon: Heart,
    match: 'prefix',
    disabled: true,
  },
  {
    label: 'Orders',
    href: ROUTES.DASHBOARD_ORDERS,
    icon: FileText,
    match: 'prefix',
    disabled: true,
  },
  {
    label: 'Users',
    href: ROUTES.DASHBOARD_USERS,
    icon: Users,
    match: 'prefix',
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    match: 'prefix',
    disabled: true,
  },
]
