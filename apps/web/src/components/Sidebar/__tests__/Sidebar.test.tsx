import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  Sidebar as ContainerSidebar,
  SidebarProvider,
} from '@/components/ui/sidebar'
import Sidebar from '@/components/Sidebar'
import { usePathname } from 'next/navigation'
import { ROUTES } from '@/constants/routes'

const mockUsePathname = jest.mocked(usePathname)
const mockUseIsMobile = jest.fn(() => false)

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    alt: string
    priority?: boolean
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

jest.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}))

const mockUseLowStockCount = jest.fn<
  { count: number | null; isLoading: boolean; isError: boolean },
  []
>(() => ({
  count: 3,
  isLoading: false,
  isError: false,
}))

jest.mock('@/hooks/useInventory', () => ({
  useLowStockCount: () => mockUseLowStockCount(),
}))

const renderSidebar = () => {
  return render(
    <TooltipProvider delay={0}>
      <SidebarProvider defaultOpen>
        <ContainerSidebar collapsible="icon" variant="inset">
          <Sidebar />
        </ContainerSidebar>
      </SidebarProvider>
    </TooltipProvider>,
  )
}

describe('Dashboard Sidebar', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseIsMobile.mockReturnValue(false)
  })

  it('renders enabled item as link', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /products/i })).toHaveAttribute(
      'href',
      '/dashboard/products',
    )
  })

  it('renders disabled menu item as non-navigable button', () => {
    renderSidebar()

    expect(
      screen.queryByRole('link', { name: /favorites/i }),
    ).not.toBeInTheDocument()

    const disabledButton = screen.getByRole('button', {
      name: /favorites - coming soon/i,
    })

    expect(disabledButton).toHaveAttribute('aria-disabled', 'true')
    expect(disabledButton).toHaveAttribute('tabindex', '-1')
    expect(disabledButton).toHaveClass('cursor-not-allowed')
  })

  it('does not mark disabled route as active even when pathname matches', () => {
    mockUsePathname.mockReturnValue('/dashboard/favorites')
    renderSidebar()

    const disabledButton = screen.getByRole('button', {
      name: /favorites - coming soon/i,
    })

    expect(disabledButton).not.toHaveAttribute('data-active', 'true')
  })

  it('marks enabled item active when pathname matches', () => {
    mockUsePathname.mockReturnValue('/dashboard/products')
    renderSidebar()

    const productsLink = screen.getByRole('link', { name: /products/i })

    expect(productsLink).toHaveAttribute('aria-current', 'page')
    expect(
      productsLink.closest('[data-slot="sidebar-menu-button"]'),
    ).toHaveAttribute('data-active')
  })

  it('Sidebar shows the real low-stock count and links to the low-stock list', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseLowStockCount.mockReturnValue({
      count: 7,
      isLoading: false,
      isError: false,
    })
    renderSidebar()

    expect(
      screen.getByText('7 items are running low on stock.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage Now' })).toHaveAttribute(
      'href',
      `${ROUTES.DASHBOARD_INVENTORY}?lowStock=true`,
    )
  })

  it('Sidebar hides the count while loading or on error', () => {
    mockUsePathname.mockReturnValue('/dashboard')
    mockUseLowStockCount.mockReturnValue({
      count: null,
      isLoading: true,
      isError: false,
    })
    renderSidebar()

    expect(screen.queryByText(/running low on stock/)).toBeNull()
  })
})
