'use client'

import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import AlertDialog from '@/components/AlertDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SUCCESS_MESSAGES } from '@/constants/messages'
import { useRestockVariant } from '@/hooks/useInventory'
import { restockFormSchema, type RestockFormValues } from '@/schemas/inventory'
import type { InventoryItem } from '@/types/inventory'
import { mapServerErrors, setServerFieldErrors } from '@/utils/form'

export interface RestockStockFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null
}

const restockErrorField = (apiField: string) =>
  apiField === 'quantity' ? ('quantity' as const) : undefined

/** Adds received units to a variant's stock. */
export default function RestockStockForm({
  open,
  onOpenChange,
  item,
}: RestockStockFormProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const { mutate, isPending } = useRestockVariant()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<RestockFormValues>({
    resolver: zodResolver(restockFormSchema),
  })

  useEffect(() => {
    if (!open) return
    reset({ quantity: undefined })
    setFormError(null)
  }, [open, reset])

  const handleClose = () => {
    if (isPending) return
    onOpenChange(false)
  }

  const onSubmit = (values: RestockFormValues) => {
    if (!item) return
    setFormError(null)
    mutate(
      { variantId: item.id, body: { quantity: values.quantity } },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.STOCK_RESTOCKED)
          onOpenChange(false)
        },
        onError: (error) => {
          const { fieldErrors, unmatched } = mapServerErrors(
            error,
            restockErrorField,
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
      title="Restock"
      description={
        item ? `${item.product.name} · ${item.name} (${item.sku})` : undefined
      }
      actionVariant="default"
      textAction="Restock"
      textCancel="Cancel"
      isLoading={isPending}
      errorMessage={formError}
      onClickAction={handleSubmit(onSubmit)}
      onClickCancel={handleClose}
      data-testid="modal-restock-stock"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Current stock: <b>{item?.stockQuantity ?? 0}</b>
        </p>
        <div>
          <Label
            htmlFor="restock-quantity"
            className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            Quantity to add
          </Label>
          <Input
            id="restock-quantity"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            disabled={isPending}
            {...register('quantity', { valueAsNumber: true })}
          />
          {errors.quantity && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {errors.quantity.message}
            </p>
          )}
        </div>
      </div>
    </AlertDialog>
  )
}
