import Image from 'next/image'
import Link from 'next/link'

import { type RoastCollection } from '@/constants/roast'
import { shopRoastDetailPath } from '@/constants/routes'
import { cn } from '@/utils/styles'
import { EMPTY_IMAGE } from '@/constants/images'
import SalePrice from '@/components/SalePrice'

export interface ProductCardProps {
  item: RoastCollection
}

const ProductCard = ({ item }: ProductCardProps) => {
  return (
    <Link
      href={shopRoastDetailPath(item.id)}
      className={cn(
        'group flex h-full flex-col gap-4 rounded-4xl text-inherit no-underline outline-none',
        'transition-opacity hover:opacity-95',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <div className="relative aspect-[4/4.8] w-full overflow-hidden rounded-4xl bg-surface-container">
        <Image
          src={item.imageUrl ?? EMPTY_IMAGE}
          alt={item.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 1024px) 50vw, 25vw"
        />
        {Boolean(item.badgeLabel) && (
          <span
            className={cn(
              'absolute top-3 left-3 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wide',
              'bg-surface-container-highest text-on-surface',
            )}
          >
            {item.badgeLabel}
          </span>
        )}
      </div>

      <div className="min-h-24 space-y-1">
        <div className="flex min-h-12 items-start justify-between gap-4">
          <h3 className="line-clamp-2 font-headline text-lg leading-tight text-on-surface">
            {item.name}
          </h3>
          <span className="shrink-0 text-right font-bold text-primary">
            <SalePrice
              price={item.salePrice}
              listPrice={item.price}
              listPriceClassName="text-xs"
            />
          </span>
        </div>
        <p className="truncate text-xs font-medium tracking-wider text-on-surface-variant uppercase">
          {item.flavorNotes}
        </p>
        <p className="truncate text-xs tracking-wider text-on-surface-variant uppercase">
          {item.roastMeta}
        </p>
      </div>
    </Link>
  )
}

export default ProductCard
