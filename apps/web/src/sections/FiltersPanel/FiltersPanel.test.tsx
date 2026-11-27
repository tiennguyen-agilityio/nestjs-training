import { render, screen } from '@testing-library/react'

import {
  ROAST_LEVEL_OPTIONS,
  ROAST_PRICE_FILTER,
  ROAST_PRICE_OPTIONS,
  ROAST_SORT_OPTIONS,
  ROAST_SORT_VALUE,
} from '@/constants/roast'
import FiltersPanel from '@/sections/FiltersPanel'

const renderPanel = () =>
  render(
    <FiltersPanel
      searchQuery=""
      onSearchChange={jest.fn()}
      priceOptions={ROAST_PRICE_OPTIONS}
      priceFilter={ROAST_PRICE_FILTER.ALL}
      onPriceFilterChange={jest.fn()}
      roastLevelOptions={ROAST_LEVEL_OPTIONS}
      selectedRoastLevels={[]}
      onToggleRoastLevel={jest.fn()}
      sortOptions={ROAST_SORT_OPTIONS}
      sortBy={ROAST_SORT_VALUE.CURATED}
      onSortByChange={jest.fn()}
    />,
  )

describe('FiltersPanel', () => {
  it('names the sort select', () => {
    renderPanel()

    expect(
      screen.getByRole('combobox', { name: 'Sort by' }),
    ).toBeInTheDocument()
  })

  it('filters price with a named select instead of a slider', () => {
    renderPanel()

    expect(
      screen.getByRole('combobox', { name: 'Price range' }),
    ).toHaveTextContent('All prices')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })
})
