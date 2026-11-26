import {
  DiscountType,
  ProductStatus,
  ProductUnit,
  RoastLevel,
} from '@repo/constants'

import type { CreateProductPayload, UpdateProductPayload } from '@repo/schemas'

import type { EditProductFormValues } from '@/schemas/product'
import type { Product, ProductVariantSummary } from '@/types/product'
import {
  buildVariantUpdates,
  createProductErrorTarget,
  formatVariantName,
  mapProductToEditFormValues,
  parseTastingNotesString,
  resolveEditedProductStatus,
  toCreateVariantPayload,
  updateProductErrorTarget,
  getProductPricing,
} from '@/utils/product'
import { getPrimaryVariantQuantity } from '@/utils/inventory'

const variant = (
  overrides: Partial<ProductVariantSummary> = {},
): ProductVariantSummary => ({
  id: 'variant-a',
  sku: 'SKU-A',
  size: 250,
  unit: ProductUnit.G,
  name: '250g',
  price: 100,
  discountType: DiscountType.PERCENT,
  discountValue: 10,
  stockQuantity: 30,
  ...overrides,
})

const product = (variants: ProductVariantSummary[]): Product => ({
  id: 'product-1',
  categoryId: 'category-1',
  name: 'Single Origin',
  description: 'Bright and floral',
  roastLevel: RoastLevel.LIGHT,
  isOrganic: false,
  isFairTrade: false,
  status: ProductStatus.ACTIVE,
  tastingNotes: '',
  origin: 'Ethiopia',
  processingMethod: 'Washed',
  variants,
  images: [],
  createdAt: null,
  updatedAt: null,
  deletedAt: null,
})

const formValues = (
  overrides: Partial<EditProductFormValues> = {},
): EditProductFormValues => ({
  ...mapProductToEditFormValues(product([variant()])),
  ...overrides,
})

describe('parseTastingNotesString', () => {
  it('splits and trims the notes', () => {
    expect(parseTastingNotesString(' Cocoa, Plum ,')).toEqual(['Cocoa', 'Plum'])
  })

  it.each([[null], [undefined], ['']])('returns [] for %p', (notes) => {
    expect(parseTastingNotesString(notes)).toEqual([])
  })
})

describe('mapProductToEditFormValues', () => {
  it("prefills the first variant's pricing", () => {
    expect(
      mapProductToEditFormValues(
        product([variant(), variant({ id: 'variant-b', price: 999 })]),
      ),
    ).toMatchObject({
      price: 100,
      discountType: DiscountType.PERCENT,
      discountValue: 10,
      stockQuantity: 30,
      size: 250,
      unit: ProductUnit.G,
    })
  })

  it('reads a null discount as PERCENT 0', () => {
    expect(
      mapProductToEditFormValues(
        product([variant({ discountType: null, discountValue: null })]),
      ),
    ).toMatchObject({ discountType: DiscountType.PERCENT, discountValue: 0 })
  })

  it('uses defaults for a product without variants', () => {
    expect(mapProductToEditFormValues(product([]))).toMatchObject({
      price: 0,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      stockQuantity: 0,
    })
  })
})

describe('buildVariantUpdates', () => {
  it('updates only the first variant', () => {
    expect(
      buildVariantUpdates(
        product([variant(), variant({ id: 'variant-b' })]),
        formValues({ price: 120 }),
      ),
    ).toEqual([
      {
        id: 'variant-a',
        size: 250,
        unit: ProductUnit.G,
        price: 120,
        discountType: DiscountType.PERCENT,
        discountValue: 10,
      },
    ])
  })

  it('buildVariantUpdates leaves out stockQuantity', () => {
    expect(
      buildVariantUpdates(
        product([variant()]),
        formValues({ size: 500, stockQuantity: 5 }),
      ),
    ).toEqual([
      {
        id: 'variant-a',
        size: 500,
        unit: 'G',
        price: 100,
        discountType: DiscountType.PERCENT,
        discountValue: 10,
      },
    ])
  })

  it('sends PERCENT 0 for a removed discount', () => {
    expect(
      buildVariantUpdates(
        product([variant()]),
        formValues({ discountValue: 0 }),
      )[0],
    ).toMatchObject({ discountType: DiscountType.PERCENT, discountValue: 0 })
  })

  it('keeps a decimal percent of 12.5', () => {
    expect(
      buildVariantUpdates(
        product([variant()]),
        formValues({ discountValue: 12.5 }),
      )[0].discountValue,
    ).toBe(12.5)
  })

  it('returns [] for a product without variants', () => {
    expect(buildVariantUpdates(product([]), formValues())).toEqual([])
  })
})

describe('toCreateVariantPayload', () => {
  const values = {
    size: 250,
    unit: ProductUnit.G,
    price: 100,
    discountType: DiscountType.PERCENT,
    discountValue: 0,
    stockQuantity: 5,
  }

  it('sends PERCENT 0 for no discount', () => {
    expect(toCreateVariantPayload(values, 'SKU-1')).toEqual({
      sku: 'SKU-1',
      size: 250,
      unit: ProductUnit.G,
      price: 100,
      discountType: DiscountType.PERCENT,
      discountValue: 0,
      stockQuantity: 5,
    })
  })

  it('keeps FIXED 0', () => {
    expect(
      toCreateVariantPayload(
        { ...values, discountType: DiscountType.FIXED },
        'SKU-1',
      ),
    ).toMatchObject({ discountType: DiscountType.FIXED, discountValue: 0 })
  })
})

// Top-level fields both product forms render an API error for.
const SHOWN_PRODUCT_FIELDS = [
  'categoryId',
  'name',
  'description',
  'origin',
  'processingMethod',
] as const

describe('updateProductErrorTarget', () => {
  const target = (field: string, payload: UpdateProductPayload = {}) =>
    updateProductErrorTarget(field, payload)

  it('maps updateVariants.0.size', () => {
    expect(target('updateVariants.0.size')).toBe('size')
  })

  it('maps updateVariants.0 fields', () => {
    expect(target('updateVariants.0.discountValue')).toBe('discountValue')
    expect(target('updateVariants.0.stockQuantity')).toBeUndefined()
    expect(target('updateVariants.0.id')).toBeUndefined()
  })

  it('maps top-level fields by name', () => {
    for (const name of SHOWN_PRODUCT_FIELDS) {
      expect(target(name)).toBe(name)
    }
    expect(target('roastLevel')).toBeUndefined()
    expect(target('isOrganic')).toBeUndefined()
    expect(target('isFairTrade')).toBeUndefined()
  })

  it('leaves updateVariants.0.discountType to the fallback', () => {
    expect(target('updateVariants.0.discountType')).toBeUndefined()
  })

  it('maps addImages.N by its isPrimary', () => {
    const payload: UpdateProductPayload = {
      addImages: [
        { url: 'https://example.com/a.jpg', isPrimary: true, sortOrder: 0 },
        { url: 'https://example.com/b.jpg', isPrimary: false, sortOrder: 1 },
      ],
    }

    expect(target('addImages.0.url', payload)).toBe('avatar')
    expect(target('addImages.1.url', payload)).toBe('gallery')
  })

  it('maps updateImages and removeImageIds to gallery unless the entry is primary', () => {
    const payload: UpdateProductPayload = {
      updateImages: [
        { id: '6f1c1f9e-1a4b-4c7e-9a43-6b0f2a1d2e3f', isPrimary: true },
      ],
    }

    expect(target('updateImages.0.url', payload)).toBe('avatar')
    expect(target('removeImageIds.0', payload)).toBe('gallery')
  })
})

describe('createProductErrorTarget', () => {
  const payload = {
    images: [
      { url: 'https://example.com/a.jpg', isPrimary: true, sortOrder: 0 },
      { url: 'https://example.com/b.jpg', isPrimary: false, sortOrder: 1 },
    ],
  } as CreateProductPayload

  const target = (field: string) => createProductErrorTarget(field, payload)

  it('maps top-level fields by name', () => {
    for (const name of SHOWN_PRODUCT_FIELDS) {
      expect(target(name)).toBe(name)
    }
    expect(target('status')).toBeUndefined()
    expect(target('tastingNotes')).toBeUndefined()
  })

  it('maps variants.0 fields', () => {
    expect(target('variants.0.price')).toBe('price')
    expect(target('variants.0.unit')).toBe('unit')
    expect(target('variants.1.price')).toBeUndefined()
  })

  it('leaves fields the form shows no error for to the fallback', () => {
    expect(target('roastLevel')).toBeUndefined()
    expect(target('isOrganic')).toBeUndefined()
    expect(target('isFairTrade')).toBeUndefined()
    expect(target('variants.0.discountType')).toBeUndefined()
  })

  it('maps variants.0.size and sku to size', () => {
    expect(target('variants.0.size')).toBe('size')
    expect(target('sku')).toBe('size')
    expect(target('variants.0.sku')).toBe('size')
  })

  it('maps images.N to avatar only when that entry is primary', () => {
    expect(target('images.0.url')).toBe('avatar')
    expect(target('images.1.url')).toBe('gallery')
  })

  it('maps the images array and an unknown image index to gallery', () => {
    expect(target('images')).toBe('gallery')
    expect(target('images.9.url')).toBe('gallery')
  })
})

describe('resolveEditedProductStatus', () => {
  it.each(Object.values(ProductStatus))(
    'sends ACTIVE for a %s product listed on the storefront',
    (current) => {
      expect(resolveEditedProductStatus(current, true)).toBe(
        ProductStatus.ACTIVE,
      )
    },
  )

  it.each([
    [ProductStatus.ACTIVE, ProductStatus.INACTIVE],
    [ProductStatus.INACTIVE, ProductStatus.INACTIVE],
    [ProductStatus.ARCHIVED, ProductStatus.ARCHIVED],
    [ProductStatus.DRAFT, ProductStatus.DRAFT],
  ])('sends %s → %s when not listed on the storefront', (current, expected) => {
    expect(resolveEditedProductStatus(current, false)).toBe(expected)
  })
})

describe('formatVariantName', () => {
  it('names a variant like the API', () => {
    expect(formatVariantName(250, ProductUnit.G)).toBe('250g')
    expect(formatVariantName(1.5, ProductUnit.KG)).toBe('1.5kg')
    expect(formatVariantName(1, ProductUnit.L)).toBe('1l')
  })
})

describe('getPrimaryVariantQuantity', () => {
  it('reads stockQuantity', () => {
    expect(
      getPrimaryVariantQuantity(product([variant({ stockQuantity: 7 })])),
    ).toBe(7)
  })
})

describe('getProductPricing', () => {
  const withVariant = (variant: Partial<ProductVariantSummary>): Product =>
    ({
      variants: [
        {
          size: 250,
          unit: ProductUnit.G,
          name: '250g',
          price: 20,
          discountType: null,
          discountValue: null,
          stockQuantity: 5,
          ...variant,
        },
      ],
    }) as unknown as Product

  it("applies the first variant's discount", () => {
    expect(
      getProductPricing(
        withVariant({ discountType: DiscountType.PERCENT, discountValue: 25 }),
      ),
    ).toEqual({ listPrice: 20, salePrice: 15 })
  })

  it('returns the list price as the sale price with no discount', () => {
    expect(getProductPricing(withVariant({}))).toEqual({
      listPrice: 20,
      salePrice: 20,
    })
  })

  it('returns 0 for a product with no variant', () => {
    expect(getProductPricing({ variants: [] } as unknown as Product)).toEqual({
      listPrice: 0,
      salePrice: 0,
    })
  })
})
