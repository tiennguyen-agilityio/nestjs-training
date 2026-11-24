'use client'

import Link from 'next/link'
import { SignedIn, SignedOut, useAuth as useClerkAuth } from '@clerk/nextjs'
import { ShoppingCart } from 'lucide-react'

// Constants
import { MENU } from '@/constants/nav'
import { ROUTES } from '@/constants/routes'

// Types
import { type MenuItem } from '@/types/menu'
import { UserRole } from '@repo/constants'

// Components
import { Menu } from '@/components/Menu'
import { MobileNav } from '@/components/MobileNav'
import { SearchInput } from '@/components/SearchInput'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserDropdown } from '@/components/UserDropdown'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'

// Hooks
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'

// Store

// Utils
import { getSessionPublicRole } from '@/utils/session'
import { cn } from '@/utils/styles'

export interface ShopHeaderProps {
  className?: string
  menu?: MenuItem[]
}

const Header = ({ className, menu = MENU }: ShopHeaderProps) => {
  // Loads the profile and clears it from the store on sign-out
  useAuth()
  const { sessionClaims } = useClerkAuth()
  const isAdmin = getSessionPublicRole(sessionClaims) === UserRole.ADMIN
  const { itemCount: cartItemCount } = useCart()
  const cartAriaLabel =
    cartItemCount > 0
      ? `Shopping cart, ${cartItemCount} items`
      : 'Shopping cart'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b border-border bg-background',
        className,
      )}
    >
      <div className="relative mx-auto flex h-14 max-w-7xl gap-4 xl:gap-10 items-center justify-between  px-4 md:h-16 md:px-6">
        <div className="flex shrink-0 items-center">
          <Link
            href={ROUTES.HOME}
            className="shrink-0 text-lg font-bold tracking-tight text-foreground"
          >
            CoffeeHub
          </Link>
        </div>

        <Menu items={menu} />

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2 md:gap-3">
          <div className="hidden min-w-0 flex-1 md:block md:max-w-64">
            <SearchInput
              disabled
              aria-label="Search products"
              containerClassName="h-9 max-w-[250px] md:h-10"
            />
          </div>

          <ThemeToggle className="shrink-0 h-8 w-8" />

          <Link
            href={ROUTES.CART}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'relative shrink-0 text-primary',
            )}
            aria-label={cartAriaLabel}
          >
            <span className="relative inline-flex">
              <ShoppingCart className="size-6" aria-hidden />
              {Boolean(cartItemCount > 0) && (
                <Badge
                  className="absolute -right-2 -top-2 flex h-5 min-w-5 justify-center border-0 px-1 py-0 text-xs"
                  aria-hidden
                >
                  {cartItemCount}
                </Badge>
              )}
            </span>
          </Link>

          <SignedOut>
            <div className="hidden shrink-0 items-center gap-2 text-sm lg:flex">
              <Link
                href={ROUTES.SIGN_IN}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
              <span className="text-muted-foreground" aria-hidden>
                /
              </span>
              <Link
                href={ROUTES.SIGN_UP}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </div>
          </SignedOut>

          <SignedIn>
            <div className="shrink-0">
              <UserDropdown isAdmin={isAdmin} showChevron={false} />
            </div>
          </SignedIn>

          <MobileNav className="shrink-0 lg:hidden" items={menu} />
        </div>
      </div>
    </header>
  )
}

export default Header
