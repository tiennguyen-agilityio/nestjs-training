import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'

import { ROUTES } from '@/constants/routes'
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))

const push = jest.fn()

const Page = ({ enabled }: { enabled: boolean }) => {
  const { pendingHref } = useUnsavedChangesWarning(enabled)
  return (
    <>
      <a href={ROUTES.DASHBOARD_PRODUCTS}>Products</a>
      <a href={ROUTES.DASHBOARD_PRODUCTS} target="_blank" rel="noreferrer">
        Products in a new tab
      </a>
      <a href="https://example.com/docs">Docs</a>
      <p>{pendingHref ?? 'none'}</p>
    </>
  )
}

const clickAndReport = async (name: string, init: MouseEventInit = {}) => {
  const link = screen.getByRole('link', { name })
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  act(() => {
    link.dispatchEvent(event)
  })
  return event.defaultPrevented
}

describe('useUnsavedChangesWarning', () => {
  beforeEach(() => {
    push.mockClear()
    jest
      .mocked(useRouter)
      .mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>)
  })

  it('holds an in-app link click while there are unsaved changes', async () => {
    render(<Page enabled />)

    expect(await clickAndReport('Products')).toBe(true)
    expect(screen.getByText(ROUTES.DASHBOARD_PRODUCTS)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })

  it('lets links through when there is nothing unsaved', async () => {
    render(<Page enabled={false} />)

    await clickAndReport('Products')

    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it.each([
    ['a new-tab link', 'Products in a new tab', {}],
    ['an external link', 'Docs', {}],
    ['a modifier click', 'Products', { metaKey: true }],
  ])('lets %s through', async (_, name, init) => {
    render(<Page enabled />)

    await clickAndReport(name, init)

    expect(screen.getByText('none')).toBeInTheDocument()
  })

  it('goes to the held link on leave and drops it on stay', () => {
    const { result } = renderHook(() => useUnsavedChangesWarning(true))
    const link = document.createElement('a')
    link.href = ROUTES.DASHBOARD_ORDERS
    link.textContent = 'Orders'
    document.body.appendChild(link)

    act(() => {
      link.click()
    })
    expect(result.current.pendingHref).toBe(ROUTES.DASHBOARD_ORDERS)

    act(() => result.current.stay())
    expect(result.current.pendingHref).toBeNull()
    expect(push).not.toHaveBeenCalled()

    act(() => {
      link.click()
    })
    act(() => result.current.leave())
    expect(push).toHaveBeenCalledWith(ROUTES.DASHBOARD_ORDERS)
    expect(result.current.pendingHref).toBeNull()
    link.remove()
  })

  it('asks the browser to confirm a reload or tab close only while enabled', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useUnsavedChangesWarning(enabled),
      { initialProps: { enabled: true } },
    )
    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(unload()).toBe(true)

    rerender({ enabled: false })
    expect(unload()).toBe(false)
  })

  it('keeps the user on the page with a userEvent click too', async () => {
    const user = userEvent.setup()
    render(<Page enabled />)

    await user.click(screen.getByRole('link', { name: 'Products' }))

    expect(screen.getByText(ROUTES.DASHBOARD_PRODUCTS)).toBeInTheDocument()
  })
})
