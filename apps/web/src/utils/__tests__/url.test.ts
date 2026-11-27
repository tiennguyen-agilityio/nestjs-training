import {
  ROAST_PRICE_FILTER,
  ROAST_PRICE_OPTIONS,
  ROAST_SORT_OPTIONS,
  ROAST_SORT_VALUE,
} from '@/constants/roast'
import { parseRoastPriceFilterParam, parseRoastSortParam } from '@/utils/url'

describe('parseRoastSortParam', () => {
  it.each(Object.values(ROAST_SORT_VALUE))('accepts %s', (value) => {
    expect(parseRoastSortParam(value)).toBe(value)
  })

  it('trims the value', () => {
    expect(parseRoastSortParam(' PRICE_ASC ')).toBe(ROAST_SORT_VALUE.PRICE_ASC)
  })

  it.each([null, '', 'price_asc', 'NEWEST'])(
    'falls back to curated for %p',
    (value) => {
      expect(parseRoastSortParam(value)).toBe(ROAST_SORT_VALUE.CURATED)
    },
  )
})

describe('ROAST_SORT_OPTIONS', () => {
  it('lists every sort value with its label', () => {
    expect(ROAST_SORT_OPTIONS).toEqual([
      { value: 'curated', label: 'Curated Selection' },
      { value: 'PRICE_ASC', label: 'Price: Low to High' },
      { value: 'PRICE_DESC', label: 'Price: High to Low' },
      { value: 'NAME_ASC', label: 'Name: A to Z' },
      { value: 'NAME_DESC', label: 'Name: Z to A' },
    ])
    expect(ROAST_SORT_OPTIONS.map((option) => option.value).sort()).toEqual(
      Object.values(ROAST_SORT_VALUE).sort(),
    )
  })
})

describe('parseRoastPriceFilterParam', () => {
  it.each(Object.values(ROAST_PRICE_FILTER))('accepts %s', (value) => {
    expect(parseRoastPriceFilterParam(value)).toBe(value)
  })

  it.each([null, '', 'cheap', 'under-25'])(
    'falls back to all prices for %p',
    (value) => {
      expect(parseRoastPriceFilterParam(value)).toBe(ROAST_PRICE_FILTER.ALL)
    },
  )
})

describe('ROAST_PRICE_OPTIONS', () => {
  it('lists the price ranges in order', () => {
    expect(ROAST_PRICE_OPTIONS).toEqual([
      { value: 'all', label: 'All prices' },
      { value: 'under-50', label: 'Under $50' },
      { value: '50-100', label: '$50 – $100' },
      { value: '100-150', label: '$100 – $150' },
      { value: '150-200', label: '$150 – $200' },
      { value: 'over-200', label: 'Above $200' },
    ])
  })
})
