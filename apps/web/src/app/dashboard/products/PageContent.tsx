'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Download, Plus, Printer } from 'lucide-react'

import ConfirmActionDialog from '@/components/ConfirmActionDialog'
import PageHeader from '@/components/PageHeader'
import { PaginationBar } from '@/components/Pagination'
import { SearchInput } from '@/components/SearchInput'
import Table from '@/components/Table'
import { Button, buttonVariants } from '@/components/ui/button'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import {
  PRODUCT_STATUS_OPTIONS,
  PRODUCTS_TABLE_COLUMNS,
} from '@/constants/product'
import { ROUTES } from '@/constants/routes'
import { CATEGORY_QUERY_OPTIONS } from '@/constants/category'
import { useCategories } from '@/hooks/useCategory'
import { useDeleteProduct, useProducts } from '@/hooks/useProduct'
import { ProductDeletePreview } from '@/sections/ProductDeletePreview'
import { ProductTableRow } from '@/sections/ProductTableRow'
import { getProductListPrice, getProductPrimaryImageUrl } from '@/utils/product'
import { getCategoryOptions } from '@/utils/common'
import { productUrlSchema } from '@/utils/url'
import { cn } from '@/utils/styles'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedUrlSearch } from '@/hooks/useDebouncedUrlSearch'
import { usePageClamp } from '@/hooks/usePageClamp'
import { Select } from '@/components/Select'
import { type Product } from '@/types/product'
import ListBody from '@/components/ListBody'

const ALL_CATEGORIES_VALUE = 'all-categories'

export const PageContent = () => {
  const { state, update: updateUrl } = useUrlState(productUrlSchema)
  const { page, search, limit, categoryId, status } = state
  const { searchInput, setSearchInput, searchInputRef } = useDebouncedUrlSearch(
    search,
    updateUrl,
  )
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const { mutate: deleteProductMutate, isPending: isDeletePending } =
    useDeleteProduct()

  const { categories, isLoading: isCategoryLoading } = useCategories(
    CATEGORY_QUERY_OPTIONS,
  )
  const activeCategories = categories.filter((category) => !category.deletedAt)

  const categoryOptions = [
    { value: ALL_CATEGORIES_VALUE, label: 'All categories' },
    ...getCategoryOptions(activeCategories),
  ]
  const normalizedCategoryId =
    categoryId &&
    categoryOptions.some((option) => String(option.value) === categoryId)
      ? categoryId
      : null

  const normalizedStatus =
    status &&
    PRODUCT_STATUS_OPTIONS.some((option) => option.value === status) &&
    status !== PRODUCT_STATUS_OPTIONS[0].value
      ? status
      : null

  const {
    products,
    meta,
    isLoading,
    isFetching,
    isError,
    errorMessage,
    refetch,
  } = useProducts({
    asAdmin: true,
    page,
    limit,
    search: search.trim(),
    categoryId: normalizedCategoryId ?? undefined,
    status: normalizedStatus ?? undefined,
  })

  const totalPages = Math.max(1, meta?.pageCount ?? 1)
  const totalCount = meta?.totalCount ?? products.length
  const showingCount = products.length

  usePageClamp({ meta, page, totalPages, updateUrl })

  const handleQueryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchInput(event.target.value)
  }

  const handleCategoryChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      categoryId: value === ALL_CATEGORIES_VALUE ? null : value,
      page: 1,
    })
  }
  const handleProductStatusChange = (value: unknown) => {
    if (typeof value !== 'string') return
    updateUrl({
      status: value === PRODUCT_STATUS_OPTIONS[0].value ? null : value,
      page: 1,
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ConfirmActionDialog
        data-testid="modal-confirm-delete-product"
        item={pendingDelete}
        onClose={() => setPendingDelete(null)}
        mutate={deleteProductMutate}
        isPending={isDeletePending}
        successMessage={SUCCESS_MESSAGES.PRODUCT_DELETED}
        title="Delete Product?"
        renderDescription={(product) => (
          <p>
            Are you sure you want to delete <b>{product?.name}</b>? This action
            cannot be undone.
          </p>
        )}
        textAction="Delete"
      >
        {pendingDelete && (
          <ProductDeletePreview
            name={pendingDelete.name}
            imageUrl={getProductPrimaryImageUrl(pendingDelete)}
            price={getProductListPrice(pendingDelete)}
          />
        )}
      </ConfirmActionDialog>

      <PageHeader
        breadcrumbItems={[
          { label: 'Dashboard', href: ROUTES.DASHBOARD },
          { label: 'Products', href: ROUTES.DASHBOARD_PRODUCTS },
        ]}
        title="Manage Products"
        description="Oversee your products and inventory"
        actions={
          <Link
            href={ROUTES.DASHBOARD_PRODUCTS_ADD}
            className={cn(
              buttonVariants({ variant: 'default', size: 'default' }),
              'inline-flex gap-2 px-8',
            )}
          >
            <Plus className="size-4" aria-hidden />
            Add product
          </Link>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-outline-variant/40 bg-card">
        <div className="flex min-w-0 flex-col gap-3 border-b border-outline-variant/30 p-4 md:flex-row md:flex-wrap md:items-center md:gap-3">
          <SearchInput
            ref={searchInputRef}
            value={searchInput}
            onChange={handleQueryChange}
            placeholder="Filter by product name..."
            aria-label="Filter products by name"
            containerClassName="h-12 bg-surface-container-high w-full md:min-w-0 md:basis-full xl:basis-0 xl:flex-1"
          />
          <div className="flex w-full min-w-0 gap-4 md:w-auto md:flex-1 xl:w-60 xl:flex-none">
            <Select
              variant="filter"
              placeholder="All categories"
              options={categoryOptions}
              selected={normalizedCategoryId ?? ALL_CATEGORIES_VALUE}
              disabled={isCategoryLoading}
              onValueChange={handleCategoryChange}
            />
          </div>
          <div className="flex w-full min-w-0 gap-4 md:w-auto md:flex-1 xl:w-52 xl:flex-none">
            <Select
              variant="filter"
              placeholder="All statuses"
              options={PRODUCT_STATUS_OPTIONS}
              selected={normalizedStatus ?? PRODUCT_STATUS_OPTIONS[0].value}
              onValueChange={handleProductStatusChange}
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-3 md:ml-auto">
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Export products list"
              className="size-11"
            >
              <Download className="size-4" aria-hidden />
            </Button>
            <Button
              disabled
              variant="outline"
              size="icon"
              aria-label="Print products list"
              className="size-11"
            >
              <Printer className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <ListBody
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          isFetching={isFetching}
          onRetry={() => void refetch()}
        >
          <Table
            columns={PRODUCTS_TABLE_COLUMNS}
            data={products}
            isStackedOnMobile
            getRowKey={(product, index) => product.id ?? `product-${index}`}
            resolveRowClassName={(product) =>
              product.deletedAt
                ? 'border-b border-border bg-muted-foreground/20'
                : ''
            }
            renderRow={(product) => (
              <ProductTableRow
                product={product}
                categoryOptions={categoryOptions}
                onRequestDelete={(p) => setPendingDelete(p)}
              />
            )}
            emptyMessage="No products found."
          />
        </ListBody>

        <footer className="border-t border-outline-variant/30 px-6 py-4">
          <PaginationBar
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            showingCount={showingCount}
            totalCount={totalCount}
            entityLabel="products"
          />
        </footer>
      </section>
    </div>
  )
}
