'use client'

import { Heart, ShoppingCart } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Quantity } from '@/components/Quantity'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { useCart, type CartActionResult } from '@/hooks/useCart'
import type { Product } from '@/types/product'
import {
  getPrimaryVariantQuantity,
  isProductOutOfStock,
} from '@/utils/inventory'
import { cn } from '@/utils/styles'

export interface ProductPurchasePanelProps {
  product: Product
  className?: string
}

export function ProductPurchasePanel({
  product,
  className,
}: ProductPurchasePanelProps) {
  const router = useRouter()
  const { addItem } = useCart()
  const productName = product.name
  const maxQuantity = getPrimaryVariantQuantity(product)
  const isOutOfStock = isProductOutOfStock(product)
  const [quantity, setQuantity] = useState(1)
  const [isAdding, setIsAdding] = useState(false)

  const handleAddToCart = async () => {
    if (isOutOfStock || isAdding) {
      return
    }

    const primaryImage = [...product.images]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((image) => Boolean(image.url))
    const unitPrice = product.variants[0]?.price ?? 0
    const meta = [product.roastLevel, product.tastingNotes]
      .filter(Boolean)
      .join(' • ')

    setIsAdding(true)
    let result: CartActionResult
    try {
      result = await addItem({
        variantId: product.variants[0]?.id ?? '',
        productId: product.id,
        name: productName,
        meta,
        imageUrl: primaryImage?.url ?? '',
        unitPrice,
        quantity,
        maxQuantity: maxQuantity,
      })
    } catch {
      result = { ok: false, error: API_FALLBACK_ERRORS.CART_ADD }
    } finally {
      setIsAdding(false)
    }

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Added to cart', {
      description: `${quantity} × ${productName}`,
    })
    router.push(ROUTES.CART)
  }

  const handleWishlist = () => {
    toast.info('Wishlist is coming soon.', {
      description: productName,
    })
  }

  return (
    <div
      className={cn('w-full space-y-4', className)}
      data-testid="product-purchase-panel"
    >
      <div className="flex w-full gap-6">
        <Quantity
          value={quantity}
          min={1}
          max={Math.max(maxQuantity, 1)}
          onChange={setQuantity}
          disabled={isOutOfStock}
        />

        <Button
          type="button"
          className="flex-1 h-14 w-auto w-max-content rounded-2xl text-base font-bold shadow-md"
          onClick={() => void handleAddToCart()}
          disabled={isOutOfStock || isAdding}
        >
          <ShoppingCart className="size-4" aria-hidden />
          Add to Cart
        </Button>
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button
          disabled
          type="button"
          variant="outline"
          className="h-12 w-full rounded-2xl border-2 border-primary bg-transparent font-semibold text-primary hover:bg-primary/5 dark:hover:bg-primary/10"
          onClick={handleWishlist}
        >
          <Heart className="size-4" aria-hidden />
          Add to Wishlist
        </Button>
      </div>
    </div>
  )
}
