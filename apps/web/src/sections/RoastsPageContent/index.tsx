'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'

// Types
import { ProductStatus, type RoastLevel } from '@repo/constants'

// Constants
import {
  ROAST_LEVEL_OPTIONS,
  ROAST_PRICE_MAX,
  ROAST_PRICE_MIN,
  ROAST_SORT_OPTIONS,
  ROAST_SORT_VALUE,
  type RoastSortValue,
} from '@/constants/roast'
import { SEARCH_URL_DEBOUNCE_MS } from '@/constants/common'

// Hooks
import { useUrlState } from '@/hooks/useUrlState'
import { useProducts } from '@/hooks/useProduct'

// Services
import type { ProductOptions } from '@/services/product'

// Utils
import { mapProductToRoastCollection } from '@/utils/product'
import { shopRoastsUrlSchema } from '@/utils/url'

// Components
import { BadgeAction } from '@/components/BadgeAction'
import { ProductsGrid } from '@/components/ProductsGrid'
import { Button } from '@/components/ui/button'
import { PaginationBar } from '@/components/Pagination'
import FiltersPanel from '../FiltersPanel'
import { EMPTY_IMAGE } from '@/constants/images'

const getRoastLabel = (value: RoastLevel) =>
  ROAST_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? value

export default function RoastsPageContent() {
  const { state: urlState, update: updateUrl } =
    useUrlState(shopRoastsUrlSchema)
  const {
    page: listPage,
    limit: listLimit,
    search: listSearch,
    minPrice: urlMinPrice,
    maxPrice: urlMaxPrice,
    roastLevel: selectedRoastLevels,
    sortBy: sortBy,
  } = urlState

  const [searchDraft, setSearchDraft] = useState(listSearch)
  const searchDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    setSearchDraft(listSearch)
  }, [listSearch])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current !== null) {
        window.clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setSearchDraft(next)
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
    }
    searchDebounceRef.current = window.setTimeout(() => {
      const trimmed = next.trim()
      updateUrl({
        search: trimmed === '' ? null : trimmed,
        page: 1,
      })
    }, SEARCH_URL_DEBOUNCE_MS)
  }

  const priceRange = useMemo((): [number, number] => {
    const lo = Math.min(urlMinPrice, urlMaxPrice)
    const hi = Math.max(urlMinPrice, urlMaxPrice)
    return [lo, hi]
  }, [urlMinPrice, urlMaxPrice])

  const listParams = useMemo((): ProductOptions => {
    const [lo, hi] = priceRange
    const params: ProductOptions = {
      page: listPage,
      limit: listLimit,
      search: listSearch.trim(),
      status: ProductStatus.ACTIVE,
    }
    if (lo > ROAST_PRICE_MIN || hi < ROAST_PRICE_MAX) {
      params.minPrice = lo
      params.maxPrice = hi
    }
    if (selectedRoastLevels.length > 0) {
      params.roastLevel = selectedRoastLevels.join(',')
    }
    if (sortBy !== ROAST_SORT_VALUE.CURATED) {
      params.sortBy = sortBy
    }
    return params
  }, [listPage, listLimit, listSearch, priceRange, selectedRoastLevels, sortBy])

  const hasActiveFilters = useMemo(
    () =>
      listSearch.trim().length > 0 ||
      selectedRoastLevels.length > 0 ||
      urlMinPrice > ROAST_PRICE_MIN ||
      urlMaxPrice < ROAST_PRICE_MAX ||
      sortBy !== ROAST_SORT_VALUE.CURATED,
    [listSearch, selectedRoastLevels.length, urlMinPrice, urlMaxPrice, sortBy],
  )

  const { products, meta, isLoading, isError, errorMessage, refetch } =
    useProducts(listParams)

  const collections = useMemo(
    () =>
      products.map((product) =>
        mapProductToRoastCollection(product, EMPTY_IMAGE),
      ),
    [products],
  )

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  const currentPage = Math.min(Math.max(1, listPage), totalPages)
  const totalCount = meta?.totalCount ?? 0

  // Default: all roast levels checked until the user touches the filter.
  // Unchecking the last one goes back to that default: all checked, no filter.
  const [isRoastLevelTouched, setIsRoastLevelTouched] = useState(false)
  const checkedRoastLevels =
    !isRoastLevelTouched && selectedRoastLevels.length === 0
      ? ROAST_LEVEL_OPTIONS.map((option) => option.value)
      : selectedRoastLevels

  const handleToggleRoastLevel = (value: RoastLevel) => {
    const next = checkedRoastLevels.includes(value)
      ? checkedRoastLevels.filter((item) => item !== value)
      : [...checkedRoastLevels, value]
    setIsRoastLevelTouched(next.length > 0)
    updateUrl({
      page: 1,
      roastLevel: next.length === 0 ? null : next.join(','),
    })
  }

  const handlePriceRangeChange = (next: [number, number]) => {
    const lo = Math.min(next[0], next[1])
    const hi = Math.max(next[0], next[1])
    updateUrl({ minPrice: lo, maxPrice: hi, page: 1 })
  }

  const handleSortByChange = (next: RoastSortValue) => {
    updateUrl({
      page: 1,
      sortBy: next === ROAST_SORT_VALUE.CURATED ? null : next,
    })
  }

  const handleResetFilters = () => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    setSearchDraft('')
    setIsRoastLevelTouched(false)
    updateUrl({
      page: 1,
      minPrice: null,
      maxPrice: null,
      roastLevel: null,
      sortBy: null,
      search: null,
    })
  }

  const hasEmptyList = !isLoading && !isError && products.length === 0
  const showNoMatches = hasEmptyList && hasActiveFilters
  const showNoProducts = hasEmptyList && !hasActiveFilters

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        <FiltersPanel
          searchQuery={searchDraft}
          onSearchChange={handleSearchChange}
          priceRange={priceRange}
          onPriceRangeChange={handlePriceRangeChange}
          minPrice={ROAST_PRICE_MIN}
          maxPrice={ROAST_PRICE_MAX}
          roastLevelOptions={ROAST_LEVEL_OPTIONS}
          selectedRoastLevels={checkedRoastLevels}
          onToggleRoastLevel={handleToggleRoastLevel}
          sortBy={sortBy}
          sortOptions={ROAST_SORT_OPTIONS}
          onSortByChange={handleSortByChange}
          disabled={isLoading}
        />

        <div className="space-y-6">
          {isLoading ? (
            <div
              className="space-y-4 rounded-3xl bg-surface-container-low p-6"
              data-testid="roasts-loading"
            >
              <div className="h-7 w-60 animate-pulse rounded-md bg-surface-container-high" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={`loading-${index}`}
                    className="h-72 animate-pulse rounded-3xl bg-surface-container-high"
                  />
                ))}
              </div>
            </div>
          ) : isError ? (
            <section className="space-y-4 rounded-3xl bg-surface-container-low p-6 text-center">
              <p className="text-on-surface-variant">
                {errorMessage ?? 'Unable to load products.'}
              </p>
              <Button onClick={() => void refetch()} variant="outline">
                Retry
              </Button>
            </section>
          ) : showNoProducts ? (
            <section className="space-y-4 rounded-3xl bg-surface-container-low p-6 text-center">
              <p className="text-on-surface-variant">
                No products available yet.
              </p>
            </section>
          ) : showNoMatches ? (
            <section className="space-y-4 rounded-3xl bg-surface-container-low p-6 text-center">
              <p className="text-on-surface-variant">
                No collections match your current filters.
              </p>
              <Button onClick={handleResetFilters} variant="outline">
                Clear filters
              </Button>
            </section>
          ) : (
            <section className="space-y-8">
              <header className="space-y-3">
                <h1 className="text-4xl leading-tight font-semibold text-on-surface md:text-5xl">
                  The Sensory Brew Shop
                </h1>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-on-surface-variant">
                    {`${totalCount} Collections Found`}
                  </p>
                  {selectedRoastLevels.length > 0 ? (
                    <>
                      <span className="text-on-surface-variant" aria-hidden>
                        |
                      </span>
                      {selectedRoastLevels.map((roastLevel) => (
                        <BadgeAction
                          key={roastLevel}
                          variant="secondary"
                          className="h-6!"
                          badgeClassName="h-6! w-fit! text-xs"
                          label={getRoastLabel(roastLevel)}
                          onClick={() => handleToggleRoastLevel(roastLevel)}
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              </header>

              <ProductsGrid collections={collections} />
              <PaginationBar
                hideSummary
                currentPage={currentPage}
                totalPages={totalPages}
                showingCount={collections.length}
                totalCount={totalCount}
                entityLabel="collections"
                onPageChange={(next) => updateUrl({ page: next })}
                className="w-full justify-center"
              />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
