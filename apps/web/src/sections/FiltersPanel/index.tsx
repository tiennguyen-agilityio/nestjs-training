'use client'

import type * as React from 'react'

import { type RoastPriceFilter, type RoastSortValue } from '@/constants/roast'
import type { RoastLevel } from '@repo/constants'
import { SearchInput } from '@/components/SearchInput'
import { Select } from '@/components/Select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { type OptionItem } from '@/types/common'

export interface FiltersPanelProps {
  searchQuery: string
  onSearchChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  priceOptions: OptionItem[]
  priceFilter: RoastPriceFilter
  onPriceFilterChange: (value: RoastPriceFilter) => void
  roastLevelOptions: { value: RoastLevel; label: string }[]
  selectedRoastLevels: RoastLevel[]
  onToggleRoastLevel: (value: RoastLevel) => void
  sortOptions: OptionItem[]
  sortBy: RoastSortValue
  onSortByChange: (value: RoastSortValue) => void
  disabled?: boolean
}

export default function FiltersPanel({
  searchQuery,
  onSearchChange,
  priceOptions,
  priceFilter,
  onPriceFilterChange,
  roastLevelOptions,
  selectedRoastLevels,
  onToggleRoastLevel,
  sortOptions,
  sortBy,
  onSortByChange,
  disabled = false,
}: FiltersPanelProps) {
  return (
    <aside className="space-y-8 rounded-3xl bg-surface-container-low p-6 lg:sticky lg:top-20">
      <header className="space-y-1">
        <p className="text-xl font-semibold text-on-surface">
          Refine Your Selection
        </p>
        <p className="text-sm italic text-on-surface-variant">
          Find the profile that speaks to you.
        </p>
      </header>

      <SearchInput
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Search by name..."
        aria-label="Search roasts by product name"
        disabled={disabled}
        containerClassName="h-11 rounded-sm bg-surface-container-high"
      />

      <section className="space-y-2" aria-labelledby="price-range-title">
        <h2
          id="price-range-title"
          className="text-sm font-bold tracking-wide text-on-surface-variant uppercase"
        >
          Price Range
        </h2>
        <Select
          options={priceOptions}
          selected={priceFilter}
          ariaLabel="Price range"
          classNameTrigger="h-11 bg-surface-container-high rounded-sm"
          onValueChange={(value) => {
            if (typeof value !== 'string') return
            onPriceFilterChange(value as RoastPriceFilter)
          }}
          disabled={disabled}
        />
      </section>

      <section className="space-y-3" aria-labelledby="roast-level-title">
        <h2
          id="roast-level-title"
          className="text-sm font-bold tracking-wide text-on-surface-variant uppercase"
        >
          Roast Level
        </h2>
        <div className="space-y-3">
          {roastLevelOptions.map((option) => {
            const checked = selectedRoastLevels.includes(option.value)
            return (
              <Checkbox
                key={option.value}
                label={option.label}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(next) => {
                  if (next !== checked) onToggleRoastLevel(option.value)
                }}
                wrapperClassName="w-full items-start gap-3"
                labelClassName="text-sm font-normal leading-snug text-on-surface peer-disabled:cursor-not-allowed"
                className="mt-0.5 border-outline-variant data-checked:border-primary dark:data-unchecked:border-border"
              />
            )
          })}
        </div>
      </section>

      <section className="space-y-2" aria-labelledby="sort-by-title">
        <h2
          id="sort-by-title"
          className="text-sm font-bold tracking-wide text-on-surface-variant uppercase"
        >
          Sort By
        </h2>
        <Select
          options={sortOptions}
          selected={sortBy}
          placeholder="Curated Selection"
          ariaLabel="Sort by"
          classNameTrigger="h-11 bg-surface-container-high rounded-sm"
          onValueChange={(value) => {
            if (typeof value !== 'string') return
            onSortByChange(value as RoastSortValue)
          }}
          disabled={disabled}
        />
      </section>

      <section className="space-y-3 rounded-md bg-surface p-5 text-center">
        <h3 className="text-lg font-semibold text-on-surface">Brew Better</h3>
        <p className="text-xs text-on-surface-variant">
          Join our subscription and get 15% off your first three months.
        </p>
        <Button className="w-full rounded-full" size="sm" disabled>
          Subscribe Now
        </Button>
      </section>
    </aside>
  )
}
