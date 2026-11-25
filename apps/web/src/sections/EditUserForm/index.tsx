'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'

import AlertDialog from '@/components/AlertDialog'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/Select'

import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import { ROLES_OPTIONS, STATUS_OPTIONS } from '@/constants/user'
import { useUpdateUserInfo } from '@/hooks/useUser'
import { updateUserFormSchema, type UpdateUserFormValues } from '@/schemas/user'
import { uploadImageToImgBB } from '@/services/image'
import { UserRole, UserStatus } from '@repo/constants'
import { type User } from '@/types/user'
import { mapServerErrors, setServerFieldErrors } from '@/utils/form'

interface EditUserFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: User | null
}

const USER_FORM_FIELDS = ['firstName', 'lastName', 'role', 'status'] as const

const userErrorField = (apiField: string) =>
  USER_FORM_FIELDS.find((field) => field === apiField)

export function EditUserForm({ open, onOpenChange, user }: EditUserFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const { mutate, isPending } = useUpdateUserInfo()

  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    },
  })

  useEffect(() => {
    if (!open) return
    reset({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      role: user?.role ?? UserRole.USER,
      status: user?.status ?? UserStatus.ACTIVE,
    })
    setAvatarPreview(user?.avatarUrl ?? '')
    setPendingAvatarUrl(null)
    setFormError(null)
  }, [open, user, reset])

  const handleClose = () => {
    if (isPending) return
    onOpenChange(false)
  }

  const handleAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setAvatarPreview(URL.createObjectURL(file))
    setIsUploadingAvatar(true)
    setFormError(null)

    const result = await uploadImageToImgBB(file)
    setIsUploadingAvatar(false)

    if (!result.ok) {
      setFormError(result.error)
      setAvatarPreview(user?.avatarUrl ?? '')
      return
    }

    setPendingAvatarUrl(result.url)
    setAvatarPreview(result.url)
  }

  const onSubmit = (values: UpdateUserFormValues) => {
    if (!user?.id) {
      setFormError(ERROR_MESSAGES.SOMETHING_WENT_WRONG)
      return
    }

    setFormError(null)
    mutate(
      {
        id: user.id,
        payload: {
          firstName: values.firstName,
          lastName: values.lastName,
          role: values.role,
          status: values.status,
          ...(pendingAvatarUrl ? { avatarUrl: pendingAvatarUrl } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(SUCCESS_MESSAGES.PROFILE_UPDATED)
          onOpenChange(false)
        },
        onError: (error) => {
          const { fieldErrors, unmatched } = mapServerErrors(
            error,
            userErrorField,
          )
          setServerFieldErrors(setError, fieldErrors, setFocus)
          setFormError(unmatched.length ? unmatched.join(' ') : null)
        },
      },
    )
  }

  const name =
    `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'User'

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      title="Edit User"
      actionVariant="default"
      textAction="Save Changes"
      textCancel="Cancel"
      isLoading={isPending}
      isActionDisabled={isUploadingAvatar}
      errorMessage={formError}
      onClickAction={handleSubmit(onSubmit)}
      onClickCancel={handleClose}
      data-testid="modal-edit-user"
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Avatar name={name} src={avatarPreview} alt={name} size="lg" />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploadingAvatar || isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="size-4" aria-hidden />
              {isUploadingAvatar ? 'Uploading…' : 'Change photo'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Upload user photo"
              onChange={(event) => void handleAvatarChange(event)}
            />
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label
              htmlFor="edit-user-first-name"
              className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              First Name
            </Label>
            <Input
              id="edit-user-first-name"
              disabled={isPending}
              {...register('firstName')}
            />
            {errors.firstName && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.firstName.message}
              </p>
            )}
          </div>
          <div>
            <Label
              htmlFor="edit-user-last-name"
              className="mb-2 block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
            >
              Last Name
            </Label>
            <Input
              id="edit-user-last-name"
              disabled={isPending}
              {...register('lastName')}
            />
            {errors.lastName && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.lastName.message}
              </p>
            )}
          </div>
          <div>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select
                  variant="form"
                  label="Role"
                  disabled={isPending}
                  selected={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  options={[...ROLES_OPTIONS]}
                />
              )}
            />
            {errors.role && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.role.message}
              </p>
            )}
          </div>
          <div>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  variant="form"
                  label="Status"
                  disabled={isPending}
                  selected={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  options={[...STATUS_OPTIONS]}
                />
              )}
            />
            {errors.status && (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errors.status.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </AlertDialog>
  )
}
