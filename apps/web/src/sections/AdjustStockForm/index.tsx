'use client'

import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import AlertDialog from '@/components/AlertDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { useAdjustVariant, useInventoryItem } from '@/hooks/useInventory'
import { adjustFormSchema, type AdjustFormValues } from '@/schemas/inventory'
import type { InventoryItem } from '@/types/inventory'
import { mapServerErrors, setServerFieldErrors } from '@/utils/form'

export interface AdjustStockFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
}

// The API's `quantity` is the change, which the admin enters as the count.
const adjustErrorField = (apiField: string) =>
  apiField === 'quantity'
    ? ('counted' as const)
    : apiField === 'reason'
      ? ('reason' as const)
      : undefined

const formatChange = (change: number) =>
  change > 0 ? `+${change}` : `−${Math.abs(change)}`

/** Sets a variant's stock to the counted quantity, with a reason. */
export default function AdjustStockForm({
  open,
  onOpenChange,
  item,
}: AdjustStockFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const { mutate, isPending } = useAdjustVariant()
  // Fresh numbers: the list row may be older than the last order or restock,
  // so Adjust waits for them.
  const {
    item: fresh,
    isFetching,
    isError: isStockError,
    isNotFound,
    errorMessage: stockErrorMessage,
    refetch: refetchStock,
  } = useInventoryItem(open && item ? item.id : null)
  const current = fresh ?? item
  const stock = current?.stockQuantity ?? 0
  // A failed refetch keeps the cached copy: only a successful read counts.
  const isStockReady = Boolean(fresh) && !isFetching && !isStockError
  const stockError = isNotFound
    ? ERROR_MESSAGES.PRODUCT_VARIANT_NOT_FOUND
    : isStockError
      ? (stockErrorMessage ?? API_FALLBACK_ERRORS.INVENTORY_ITEM_LOAD)
      : null

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<AdjustFormValues>({
    resolver: zodResolver(adjustFormSchema),
  })

  useEffect(() => {
    if (!open) return
    reset({ counted: undefined, reason: '' })
    setFormError(null)
  }, [open, reset])

  const counted = watch('counted')
  const change = Number.isInteger(counted) ? counted - stock : null

  const handleClose = () => {
    if (isPending) return
    onOpenChange(false)
  }

  const onSubmit = (values: AdjustFormValues) => {
    if (!current || !isStockReady) return
    setFormError(null)
    mutate(
      {
        variantId: current.id,
        body: { quantity: values.counted - stock, reason: values.reason },
      },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.STOCK_ADJUSTED)
          onOpenChange(false)
        },
        onError: (error) => {
          // The numbers may have moved: the next try uses the current ones.
          void refetchStock()
          const { fieldErrors, unmatched } = mapServerErrors(
            error,
            adjustErrorField,
          )
          setServerFieldErrors(setError, fieldErrors, setFocus)
          setFormError(unmatched.length ? unmatched.join(' ') : null)
        },
      },
    )
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      title="Adjust stock"
      description={
        current
          ? `${current.product.name} · ${current.name} (${current.sku})`
          : undefined
      }
      actionVariant="default"
      textAction="Adjust"
      textCancel="Cancel"
      isLoading={isPending}
      isActionDisabled={!isStockReady || change === null || change === 0}
      // A failed read explains the disabled button before an older refusal.
      errorMessage={stockError ?? formError}
      onClickAction={handleSubmit(onSubmit)}
      onClickCancel={handleClose}
      data-testid="modal-adjust-stock"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Current stock: <b>{stock}</b> · Reserved:{' '}
          <b>{current?.reservedQuantity ?? 0}</b>
        </p>
        <div>
          <Label
            htmlFor="adjust-counted"
            className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Counted quantity
          </Label>
          <Input
            id="adjust-counted"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            disabled={isPending}
            {...register('counted', { valueAsNumber: true })}
          />
          {change !== null && change !== 0 && counted >= 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              Change: {formatChange(change)}
            </p>
          )}
          {errors.counted && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.counted.message}
            </p>
          )}
        </div>
        <div>
          <Label
            htmlFor="adjust-reason"
            className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Reason
          </Label>
          <Input
            id="adjust-reason"
            disabled={isPending}
            {...register('reason')}
          />
          {errors.reason && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.reason.message}
            </p>
          )}
        </div>
      </div>
    </AlertDialog>
  )
}
