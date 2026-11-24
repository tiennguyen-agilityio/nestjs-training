import { render } from '@testing-library/react'

import { useCartMerge } from '@/hooks/useCartMerge'
import { CartMergeBridge } from '@/providers/CartMergeBridge'

jest.mock('@/hooks/useCartMerge', () => ({ useCartMerge: jest.fn() }))

describe('CartMergeBridge', () => {
  it('renders nothing and runs the merge', () => {
    const { container } = render(<CartMergeBridge />)

    expect(container).toBeEmptyDOMElement()
    expect(jest.mocked(useCartMerge)).toHaveBeenCalled()
  })
})
