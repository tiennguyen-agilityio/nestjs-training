import { ProductStatus, ProductUnit, RoastLevel } from '@repo/constants'
import { type Product } from '@/types/product'
import { mapProductToRoastCollection } from '@/utils/product'

const PLACEHOLDER = 'https://example.com/placeholder.jpg'

describe('mapProductToRoastCollection', () => {
  it('maps API product to shop grid item', () => {
    const product: Product = {
      id: 'p-1',
      categoryId: 'cat',
      name: 'Test Bean',
      description: 'Smooth',
      roastLevel: RoastLevel.MEDIUM,
      isOrganic: false,
      isFairTrade: false,
      status: ProductStatus.ACTIVE,
      tastingNotes: 'Chocolate, caramel',
      origin: 'Colombia',
      processingMethod: 'Washed',
      variants: [
        {
          sku: 's',
          size: 250,
          unit: ProductUnit.G,
          name: '250g',
          price: 18.5,
          discountType: null,
          discountValue: null,
          stockQuantity: 50,
        },
      ],
      images: [],
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    }

    const item = mapProductToRoastCollection(product, PLACEHOLDER)

    expect(item.id).toBe('p-1')
    expect(item.name).toBe('Test Bean')
    expect(item.price).toBe(18.5)
    expect(item.roastLevel).toBe(RoastLevel.MEDIUM)
    expect(item.imageUrl).toBe(PLACEHOLDER)
    expect(item.flavorNotes).toBe('Chocolate, caramel')
    expect(item.roastMeta).toContain('Colombia')
    expect(item.roastMeta).toContain('Medium roast')
    expect(item.badgeLabel).toBeUndefined()
  })

  it('sets low stock badge when stockQuantity is below threshold', () => {
    const product: Product = {
      id: 'p-2',
      categoryId: 'cat',
      name: 'Low Stock Bean',
      description: '',
      roastLevel: RoastLevel.DARK,
      isOrganic: false,
      isFairTrade: false,
      status: ProductStatus.ACTIVE,
      tastingNotes: '',
      origin: '',
      processingMethod: '',
      variants: [
        {
          sku: 's',
          size: 250,
          unit: ProductUnit.G,
          name: '250g',
          price: 20,
          discountType: null,
          discountValue: null,
          stockQuantity: 3,
        },
      ],
      images: [],
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    }

    const item = mapProductToRoastCollection(product, PLACEHOLDER)
    expect(item.badgeLabel).toBe('Low Stock')
  })

  describe('starts the roast line with the variant name', () => {
    const baseProduct: Product = {
      id: 'p-3',
      categoryId: 'cat',
      name: 'Huila Bean',
      description: '',
      roastLevel: RoastLevel.MEDIUM,
      isOrganic: false,
      isFairTrade: false,
      status: ProductStatus.ACTIVE,
      tastingNotes: '',
      origin: 'Huila, Colombia',
      processingMethod: '',
      variants: [
        {
          sku: 's',
          size: 250,
          unit: ProductUnit.G,
          name: '250g',
          price: 20,
          discountType: null,
          discountValue: null,
          stockQuantity: 30,
        },
      ],
      images: [],
      createdAt: null,
      updatedAt: null,
      deletedAt: null,
    }

    it('prefixes the first variant name', () => {
      const item = mapProductToRoastCollection(baseProduct, PLACEHOLDER)
      expect(item.roastMeta).toBe('250g · Huila, Colombia | Medium roast')
    })

    it('keeps the roast line when the product has no variant', () => {
      const item = mapProductToRoastCollection(
        { ...baseProduct, variants: [] },
        PLACEHOLDER,
      )
      expect(item.roastMeta).toBe('Huila, Colombia | Medium roast')
    })
  })
})
