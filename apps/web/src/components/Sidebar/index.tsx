'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { NOTICE_MESSAGES } from '@/constants/messages'
import { DASHBOARD_DISABLED_HINT, DASHBOARD_MENU } from '@/constants/nav'
import { ROUTES } from '@/constants/routes'
import { useLowStockCount } from '@/hooks/useInventory'
import { cn } from '@/utils/styles'

import { buttonVariants } from '../ui/button'

const Sidebar = () => {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  // Hidden while loading or on error (an INACTIVE admin's 403).
  const { count, isLoading, isError } = useLowStockCount()
  const showCount = !isLoading && !isError && count !== null

  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <>
      <SidebarHeader className="min-w-0 px-4 py-6 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-4">
        <Link
          href={ROUTES.DASHBOARD}
          className="flex min-w-0 items-center gap-3 rounded-md outline-none ring-sidebar-ring transition-opacity hover:opacity-90 focus-visible:ring-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
        >
          <Image
            src="/images/logo.png"
            alt="CoffeeHub"
            width={36}
            height={36}
            className="size-9 shrink-0 object-contain group-data-[collapsible=icon]:size-8"
            priority
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1 group-data-[collapsible=icon]:hidden">
            <p className="wrap-break-word font-headline text-xl leading-tight text-sidebar-foreground">
              CoffeeHub Dashboard
            </p>
            <p className="wrap-break-word text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-dashboard-subtitle">
              The Editorial Chemist
            </p>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Dashboard" className="w-full min-w-0">
              <SidebarMenu className="gap-1">
                {DASHBOARD_MENU.map((item) => {
                  const Icon = item.icon
                  const isDisabled = Boolean(item.disabled)
                  const isActive =
                    !isDisabled &&
                    (item.match === 'exact'
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`))

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        render={
                          isDisabled ? undefined : (
                            <Link
                              className="h-12 w-full rounded-full px-4"
                              href={item.href}
                              aria-current={isActive ? 'page' : undefined}
                              onClick={handleMenuItemClick}
                            />
                          )
                        }
                        tooltip={
                          isDisabled
                            ? `${item.label} - ${DASHBOARD_DISABLED_HINT}`
                            : item.label
                        }
                        aria-disabled={isDisabled}
                        aria-label={
                          isDisabled
                            ? `${item.label} - ${DASHBOARD_DISABLED_HINT}`
                            : item.label
                        }
                        tabIndex={isDisabled ? -1 : undefined}
                        className={cn(
                          'w-full rounded-full px-4 transition-colors',
                          'group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-4! group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center',
                          'data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:hover:bg-sidebar-primary data-active:hover:text-sidebar-primary-foreground',
                          isDisabled
                            ? 'cursor-not-allowed text-sidebar-foreground/50'
                            : 'text-sidebar-foreground/80 hover:text-sidebar-foreground',
                        )}
                        size="lg"
                      >
                        <Icon aria-hidden className="size-6 shrink-0" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="min-w-0 p-3 group-data-[collapsible=icon]:hidden">
        <div className="rounded-xl bg-sidebar-accent/80 p-4 text-sidebar-foreground">
          <p className="font-semibold text-sidebar-foreground">
            Inventory Alert
          </p>
          {showCount && (
            <p className="mt-1 text-sm text-muted-foreground">
              {NOTICE_MESSAGES.LOW_STOCK(count)}
            </p>
          )}
          <Link
            href={`${ROUTES.DASHBOARD_INVENTORY}?lowStock=true`}
            onClick={handleMenuItemClick}
            className={cn(
              buttonVariants({ variant: 'default' }),
              'mt-3 h-11 w-full rounded-lg border-0 bg-sidebar-primary text-sm font-medium text-sidebar-primary-foreground shadow-none hover:bg-sidebar-primary/90',
            )}
          >
            Manage Now
          </Link>
        </div>
      </SidebarFooter>
    </>
  )
}

export default Sidebar
