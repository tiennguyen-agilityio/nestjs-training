'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import { toast } from 'sonner'

import AlertDialog from '@/components/AlertDialog'
import { getErrorMessage } from '@/utils/form'

interface ConfirmActionDialogProps<T extends { id?: string }> {
  item: T | null
  onClose: () => void
  mutate: (
    id: string,
    options: { onSuccess: () => void; onError: (error: unknown) => void },
  ) => void
  isPending: boolean
  successMessage: string
  title: string
  renderDescription: (item: T | null) => ReactNode
  textAction: string
  textCancel?: string
  /** Turns a failed mutation's error into the shown text (default `getErrorMessage`). */
  formatError?: (error: unknown) => string
  actionVariant?: ComponentProps<typeof AlertDialog>['actionVariant']
  children?: ReactNode
  'data-testid'?: string
}

/**
 * Confirms an action on a list item (delete, restore): runs `mutate` with the
 * item's id, toasts and closes on success, shows the error on failure, and
 * cannot be closed while the mutation is pending.
 */
const ConfirmActionDialog = <T extends { id?: string }>({
  item,
  onClose,
  mutate,
  isPending,
  successMessage,
  title,
  renderDescription,
  textAction,
  textCancel,
  formatError = getErrorMessage,
  actionVariant,
  children,
  'data-testid': dataTestId,
}: ConfirmActionDialogProps<T>) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const close = () => {
    setErrorMessage(null)
    onClose()
  }

  return (
    <AlertDialog
      data-testid={dataTestId}
      open={item !== null}
      isLoading={isPending}
      errorMessage={errorMessage}
      onOpenChange={(open) => {
        if (!open && !isPending) close()
      }}
      title={title}
      description={renderDescription(item)}
      textAction={textAction}
      textCancel={textCancel}
      actionVariant={actionVariant}
      onClickAction={() => {
        const id = item?.id
        if (!id) return
        setErrorMessage(null)
        mutate(id, {
          onSuccess: () => {
            toast.success(successMessage)
            close()
          },
          onError: (error) => setErrorMessage(formatError(error)),
        })
      }}
    >
      {children}
    </AlertDialog>
  )
}

export default ConfirmActionDialog
