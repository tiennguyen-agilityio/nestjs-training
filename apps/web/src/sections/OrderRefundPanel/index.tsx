'use client'

import { useId, useState } from 'react'
import { toast } from 'sonner'

import type { OrderDetail } from '@/types/order'
import { useCreateRefund } from '@/hooks/useOrder'
import { DIALOG_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { refundFormSchema } from '@/schemas/refund'
import { refundableOf } from '@/utils/order'
import { formatPrice } from '@/utils/common'
import { getErrorMessage } from '@/utils/form'
import { cn } from '@/utils/styles'
import AlertDialog from '@/components/AlertDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface OrderRefundPanelProps {
  order: OrderDetail
  className?: string
}

/**
 * The admin's "Refund" panel: refunds part or all of what is still refundable
 * of the order's paid card or PayPal charge. Hidden when nothing is left.
 */
export default function OrderRefundPanel({
  order,
  className,
}: OrderRefundPanelProps) {
  const headingId = useId()
  const amountId = useId()
  const refundable = refundableOf(order)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const createRefund = useCreateRefund()

  if (refundable <= 0) return null

  const close = () => {
    setOpen(false)
    setErrorMessage(null)
  }

  const submit = () => {
    const parsed = refundFormSchema(refundable).safeParse({
      amount: amount.trim() === '' ? undefined : Number(amount),
    })
    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? null)
      return
    }
    setErrorMessage(null)
    createRefund.mutate(
      { orderId: order.id, amount: parsed.data.amount },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.REFUND_STARTED)
          close()
        },
        onError: (error: unknown) => setErrorMessage(getErrorMessage(error)),
      },
    )
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-xl bg-surface-container-low p-6',
        className,
      )}
    >
      <h2 id={headingId} className="font-semibold text-on-surface">
        Refund
      </h2>
      <p className="text-sm text-on-surface-variant">
        {formatPrice(refundable)} can still be refunded.
      </p>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => {
          setAmount(refundable.toFixed(2))
          setErrorMessage(null)
          setOpen(true)
        }}
      >
        Refund
      </Button>
      <AlertDialog
        open={open}
        isLoading={createRefund.isPending}
        errorMessage={errorMessage}
        onOpenChange={(next) => {
          if (!next && !createRefund.isPending) close()
        }}
        title={DIALOG_MESSAGES.ORDER.REFUND.TITLE}
        description={DIALOG_MESSAGES.ORDER.REFUND.DESCRIPTION(
          order.orderNumber,
        )}
        textAction={DIALOG_MESSAGES.ORDER.REFUND.ACTION}
        textCancel={DIALOG_MESSAGES.ORDER.REFUND.KEEP}
        actionVariant="destructive"
        onClickAction={submit}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor={amountId}>Refund amount</Label>
          <Input
            id={amountId}
            type="number"
            inputMode="decimal"
            min={0.01}
            max={refundable}
            step={0.01}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-xs text-on-surface-variant">
            At most {formatPrice(refundable)}.
          </p>
        </div>
      </AlertDialog>
    </section>
  )
}
