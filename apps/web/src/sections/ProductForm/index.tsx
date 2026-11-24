'use client'

import { useCallback, useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { BadgeCheck, Leaf, Plus, X } from 'lucide-react'
import {
  Controller,
  type FieldPath,
  type PathValue,
  type Resolver,
  useForm,
} from 'react-hook-form'
import { toast } from 'sonner'

// Types
import type { ProductFormValues } from '@/types/product'
import { DiscountType, RoastLevel, VALIDATION_RULES } from '@repo/constants'

// Constants
import { CATEGORY_QUERY_OPTIONS } from '@/constants/category'
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '@/constants/messages'
import {
  DISCOUNT_TYPE_OPTIONS,
  PERCENT_DISCOUNT_INPUT_MAX,
  QUANTITY_MAX,
  UNIT_OPTIONS,
} from '@/constants/product'

// Hooks
import { useCategories } from '@/hooks/useCategory'

// Schemas
import {
  createProductFormSchema,
  editProductFormSchema,
} from '@/schemas/product'

// Components
import { type BreadcrumbNavItem } from '@/components/Breadcrumb'
import { Input } from '@/components/Input'
import NumberInput from '@/components/NumberInput'
import PageHeader from '@/components/PageHeader'
import { Select } from '@/components/Select'
import UploadImage from '@/components/UploadImage'
import UploadImageGallery, {
  type UploadImageGalleryItem,
} from '@/components/UploadImage/Gallery'
import BrainIcon from '@/components/icon/BrainIcon'
import DollarIcon from '@/components/icon/DollarIcon'
import PublishIcon from '@/components/icon/PublishIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

// Utils
import { getCategoryOptions } from '@/utils/common'
import { mapServerErrors, setServerFieldErrors } from '@/utils/form'
import {
  type CreateProductErrorTarget,
  splitImageErrors,
} from '@/utils/product'
import { uploadProductImages } from '@/utils/product-images'
import { cn } from '@/utils/styles'

const { PRICE } = VALIDATION_RULES

export type ProductFormMode = 'create' | 'edit'

export interface ProductFormState {
  values: ProductFormValues
  tastingNotes: string[]
  isListedOnStorefront: boolean
  /** The saved primary image (Edit), kept unless removed or replaced. */
  primaryUrl: string | null
  /** The saved gallery images (Edit), kept unless removed. */
  galleryItems: UploadImageGalleryItem[]
}

export interface ProductFormSubmission {
  values: ProductFormValues
  /** The tasting notes joined with ', '. */
  tastingNotes: string
  isListedOnStorefront: boolean
  /** The new upload, else the kept saved primary image. */
  primaryUrl: string | null
  /** The kept saved gallery images, then the new uploads. */
  galleryUrls: string[]
}

export interface ProductFormActions {
  /** Image errors go to the image boxes, field errors under their fields (the first focused), the rest to toasts; then `finish`. */
  handleServerError: (
    error: unknown,
    resolve: (apiField: string) => CreateProductErrorTarget | undefined,
  ) => void
  /** Ends the submitting state once the request settles. */
  finish: () => void
  /** Goes back to the initial state. */
  reset: () => void
}

export interface ProductFormProps {
  mode: ProductFormMode
  formId: string
  title: string
  description: string
  breadcrumbItems: BreadcrumbNavItem[]
  submitLabel: string
  resetLabel: string
  /** What the reset button goes back to; when it changes, the whole form is reset to it. */
  initialState: ProductFormState
  /** Keeps reset and submit disabled until something changed. */
  requireChange?: boolean
  isPending: boolean
  onSubmit: (
    submission: ProductFormSubmission,
    actions: ProductFormActions,
  ) => void
}

interface LocalImage {
  url: string
  name: string
  file: File
}

interface ImageValidationErrors {
  avatar: string
  gallery: string
}

const NO_IMAGE_ERRORS: ImageValidationErrors = { avatar: '', gallery: '' }

const roastLevels: RoastLevel[] = [
  RoastLevel.LIGHT,
  RoastLevel.MEDIUM,
  RoastLevel.DARK,
]

const ETHICS_TOGGLE_CLASSES =
  'inline-flex h-12 w-max max-w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-xs font-semibold uppercase tracking-wider whitespace-nowrap disabled:pointer-events-none disabled:opacity-50'

const getRoastIndex = (value: RoastLevel) => {
  const found = roastLevels.indexOf(value)
  return found === -1 ? 0 : found
}

// Everything the form edits, kept in react-hook-form so isDirty covers it.
type ProductFormFields = ProductFormValues &
  Omit<ProductFormState, 'values'> & {
    avatarImage: LocalImage | null
    galleryFiles: File[]
  }

const toFormFields = ({
  values,
  ...rest
}: ProductFormState): ProductFormFields => ({
  ...values,
  ...rest,
  avatarImage: null,
  galleryFiles: [],
})

const MARK_DIRTY = { shouldDirty: true }

const ProductForm = ({
  mode,
  formId,
  title,
  description,
  breadcrumbItems,
  submitLabel,
  resetLabel,
  initialState,
  requireChange = false,
  isPending,
  onSubmit,
}: ProductFormProps) => {
  const isCreate = mode === 'create'
  const { categories, isLoading: isCategoryLoading } = useCategories(
    CATEGORY_QUERY_OPTIONS,
  )
  const categoryOptions = getCategoryOptions(
    categories.filter((category) => !category.deletedAt),
  )

  const [imageErrors, setImageErrors] =
    useState<ImageValidationErrors>(NO_IMAGE_ERRORS)
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [pendingNote, setPendingNote] = useState('')

  const {
    control,
    register,
    handleSubmit,
    clearErrors,
    getValues,
    setError,
    setFocus,
    trigger,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProductFormFields>({
    // The schemas take numbers; an empty numeric field ('') fails them as
    // required, which is the message the form wants.
    resolver: zodResolver(
      isCreate ? createProductFormSchema : editProductFormSchema,
    ) as unknown as Resolver<ProductFormFields>,
    defaultValues: toFormFields(initialState),
    mode: 'onTouched',
    reValidateMode: 'onChange',
  })

  const resetTo = useCallback(
    (state: ProductFormState) => {
      reset(toFormFields(state))
      setImageErrors(NO_IMAGE_ERRORS)
      setPendingNote('')
    },
    [reset],
  )

  useEffect(() => {
    resetTo(initialState)
  }, [initialState, resetTo])

  const roastLevel = watch('roastLevel')
  const isOrganic = watch('isOrganic')
  const isFairTrade = watch('isFairTrade')
  const isPercentDiscount = watch('discountType') === DiscountType.PERCENT
  const tastingNotes = watch('tastingNotes')
  const primaryUrl = watch('primaryUrl')
  const galleryItems = watch('galleryItems')
  const avatarImage = watch('avatarImage')
  const galleryFiles = watch('galleryFiles')
  const isSubmitting = isPending || isUploadingImages

  const isActionBlocked = isSubmitting || (requireChange && !isDirty)

  const finish = () => setIsUploadingImages(false)

  // Builds the next value from the current one, not from a render-time watch().
  const update = <K extends FieldPath<ProductFormFields>>(
    name: K,
    next: (
      prev: PathValue<ProductFormFields, K>,
    ) => PathValue<ProductFormFields, K>,
  ) => setValue(name, next(getValues(name)), MARK_DIRTY)

  const handleReset = () => {
    resetTo(initialState)
    toast.success(SUCCESS_MESSAGES.DRAFT_DISCARDED)
  }

  const handlePrimaryImageChange = (file: File | null) => {
    setImageErrors((prev) => ({ ...prev, avatar: '' }))
    if (file) {
      setValue(
        'avatarImage',
        { url: URL.createObjectURL(file), name: file.name, file },
        MARK_DIRTY,
      )
      return
    }
    // Removing a new pick shows the saved image again; removing the saved
    // image leaves none.
    if (getValues('avatarImage')) setValue('avatarImage', null, MARK_DIRTY)
    else setValue('primaryUrl', null, MARK_DIRTY)
  }

  const handleGalleryImagesChange = (files: File[]) => {
    setImageErrors((prev) => ({ ...prev, gallery: '' }))
    if (files.length) update('galleryFiles', (prev) => [...prev, ...files])
  }

  const handleRemoveGalleryImage = (
    removeIndex: number,
    item?: UploadImageGalleryItem,
  ) => {
    const isOtherIndex = (_: unknown, index: number) => index !== removeIndex
    if (item?.id) update('galleryItems', (prev) => prev.filter(isOtherIndex))
    else update('galleryFiles', (prev) => prev.filter(isOtherIndex))
  }

  const validateImageInputs = (): boolean => {
    const { avatarImage, primaryUrl, galleryFiles, galleryItems } = getValues()
    const nextErrors: ImageValidationErrors = {
      avatar:
        avatarImage || primaryUrl?.trim()
          ? ''
          : ERROR_MESSAGES.PRODUCT_AVATAR_REQUIRED,
      gallery:
        galleryFiles.length > 0 || galleryItems.length > 0
          ? ''
          : ERROR_MESSAGES.PRODUCT_GALLERY_REQUIRED,
    }
    setImageErrors(nextErrors)
    return !nextErrors.avatar && !nextErrors.gallery
  }

  const handleAddNote = () => {
    const next = pendingNote.trim()
    const notes = getValues('tastingNotes')
    if (!next || notes.includes(next)) return
    setValue('tastingNotes', [...notes, next], MARK_DIRTY)
    setPendingNote('')
  }

  const handleServerError: ProductFormActions['handleServerError'] = (
    error,
    resolve,
  ) => {
    const { fieldErrors, unmatched } = mapServerErrors(error, resolve)
    const { imageErrors: serverImageErrors, formErrors } =
      splitImageErrors(fieldErrors)
    setImageErrors((prev) => ({ ...prev, ...serverImageErrors }))
    setServerFieldErrors(setError, formErrors, setFocus)
    unmatched.forEach((message) => toast.error(message))
    finish()
  }

  const submitValues = async (values: ProductFormFields) => {
    if (!validateImageInputs()) return
    clearErrors()

    // The schemas strip the fields they do not know, so these come from the
    // form itself.
    const {
      avatarImage,
      galleryFiles,
      galleryItems,
      primaryUrl,
      tastingNotes,
      isListedOnStorefront,
    } = getValues()

    setIsUploadingImages(true)
    const uploaded = await uploadProductImages({
      primaryFile: avatarImage?.file ?? null,
      galleryFiles,
    })
    if (!uploaded.ok) {
      toast.error(uploaded.error)
      finish()
      return
    }

    onSubmit(
      {
        values,
        tastingNotes: tastingNotes.join(', '),
        isListedOnStorefront,
        primaryUrl:
          uploaded.primaryUrl ??
          (primaryUrl?.trim() ? primaryUrl.trim() : null),
        galleryUrls: [
          ...galleryItems.map((item) => item.url),
          ...uploaded.galleryUrls,
        ],
      },
      { handleServerError, finish, reset: () => resetTo(initialState) },
    )
  }

  const handleSubmitClick = () => {
    validateImageInputs()
    void handleSubmit(submitValues)()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumbItems={breadcrumbItems}
        title={title}
        description={description}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              className="px-4 text-muted-foreground"
              disabled={isActionBlocked}
              onClick={handleReset}
            >
              {resetLabel}
            </Button>
            <Button
              type="button"
              className="px-8"
              disabled={isActionBlocked}
              loading={isSubmitting}
              onClick={handleSubmitClick}
            >
              <PublishIcon />
              {submitLabel}
            </Button>
          </>
        }
      />

      <form
        id={formId}
        className="flex flex-col gap-6"
        noValidate
        onSubmit={handleSubmit(submitValues)}
      >
        <section className="grid gap-6 lg:grid-cols-[3fr_5fr] [&>*]:min-w-0">
          <article className="rounded-4xl border border-outline-variant/30 bg-surface-container-low p-6">
            <h2 className="text-xl leading-none font-medium text-on-surface-variant">
              Visual Identity
            </h2>
            <div className="mt-5 space-y-4">
              <UploadImage
                name="avatar"
                type="primary"
                imageUrl={avatarImage?.url ?? primaryUrl ?? undefined}
                imageAlt={avatarImage?.name ?? 'Product image'}
                title="Main Hero Shot"
                helperText="PNG/JPG up to 5MB"
                buttonText="Browse"
                onChange={handlePrimaryImageChange}
                disabled={isSubmitting}
                invalid={Boolean(imageErrors.avatar)}
                className="min-h-68"
              />
              {Boolean(imageErrors.avatar) && (
                <p
                  role="alert"
                  className="-mt-1 text-xs font-medium text-destructive"
                >
                  {imageErrors.avatar}
                </p>
              )}

              <div className="space-y-3">
                <p className="text-[0.68rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                  Gallery Assets
                </p>
                <UploadImageGallery
                  name="gallery"
                  files={galleryFiles}
                  items={galleryItems}
                  onAddImages={handleGalleryImagesChange}
                  onRemoveItem={handleRemoveGalleryImage}
                  disabled={isSubmitting}
                  invalid={Boolean(imageErrors.gallery)}
                />
                {Boolean(imageErrors.gallery) && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-destructive"
                  >
                    {imageErrors.gallery}
                  </p>
                )}
              </div>
            </div>
          </article>

          <div className="space-y-6">
            <article className="rounded-4xl border border-outline-variant/30 bg-surface-container-low p-6">
              <h2 className="text-xl leading-none font-medium text-on-surface-variant">
                General Information
              </h2>
              <div className="mt-5 grid gap-4 [&>*]:min-w-0">
                <Input
                  className="h-14"
                  label="Product Name"
                  placeholder="e.g. Ethiopian Yirgacheffe G1"
                  disabled={isSubmitting}
                  errorMessage={errors.name?.message}
                  {...register('name')}
                />
                <div className="space-y-2">
                  <Label htmlFor="product-description">Description</Label>
                  <Textarea
                    id="product-description"
                    placeholder="Describe the flavor profile, origin story, and unique characteristics..."
                    aria-invalid={errors.description ? true : undefined}
                    disabled={isSubmitting}
                    {...register('description')}
                  />
                  {Boolean(errors.description?.message) && (
                    <p
                      role="alert"
                      className="text-xs font-medium text-destructive"
                    >
                      {errors.description?.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                  <Controller
                    control={control}
                    name="categoryId"
                    render={({ field }) => (
                      <Select
                        classNameTrigger="h-14"
                        label="Category"
                        placeholder="Select category"
                        options={categoryOptions}
                        selected={field.value}
                        onValueChange={field.onChange}
                        errorMessage={errors.categoryId?.message}
                        disabled={isCategoryLoading || isSubmitting}
                      />
                    )}
                  />
                  <div className="space-y-2">
                    <Label
                      htmlFor="product-status"
                      className="mb-0 text-xs font-semibold tracking-wider"
                    >
                      Active Status
                    </Label>
                    <div className="flex h-14 w-full mt-2 align-center items-center gap-3 rounded-xs px-3">
                      <Controller
                        control={control}
                        name="isListedOnStorefront"
                        render={({ field }) => (
                          <Switch
                            id="product-status"
                            checked={field.value}
                            onCheckedChange={(checked) =>
                              field.onChange(checked === true)
                            }
                            disabled={isSubmitting}
                          />
                        )}
                      />
                      <span className="text-sm leading-none text-on-surface-variant">
                        Listed on Storefront
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-4xl border border-outline-variant/30 bg-surface-container-low p-6">
              <h2 className="text-xl leading-none font-medium text-on-surface-variant">
                Inventory &amp; Value
              </h2>
              <div className="mt-5 grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                <Controller
                  control={control}
                  name="size"
                  render={({ field }) => (
                    <NumberInput
                      ref={field.ref}
                      className="h-14"
                      label="Size"
                      type="number"
                      min={1}
                      step={0.01}
                      maxDecimalPlaces={2}
                      disabled={isSubmitting}
                      errorMessage={errors.size?.message}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Select
                      label="Unit"
                      classNameTrigger="h-14"
                      placeholder="Select unit"
                      options={UNIT_OPTIONS}
                      selected={field.value}
                      onValueChange={(value) => field.onChange(value)}
                      disabled={isSubmitting}
                      errorMessage={errors.unit?.message}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="price"
                  render={({ field }) => (
                    <NumberInput
                      ref={field.ref}
                      className="h-14"
                      label="Base Price"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 24.95"
                      startIcon={<DollarIcon className="size-4" />}
                      min={PRICE.MIN}
                      max={PRICE.MAX}
                      maxDecimalPlaces={2}
                      disabled={isSubmitting}
                      errorMessage={errors.price?.message}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="stockQuantity"
                  render={({ field }) => (
                    <NumberInput
                      ref={field.ref}
                      className="h-14"
                      label="Quantity"
                      type="number"
                      min={0}
                      max={isCreate ? QUANTITY_MAX : undefined}
                      step={1}
                      maxDecimalPlaces={0}
                      disabled={isSubmitting}
                      errorMessage={errors.stockQuantity?.message}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="discountType"
                  render={({ field }) => (
                    <div className="min-w-0 space-y-2">
                      <Label>Discount Type</Label>
                      <div className="grid min-h-14 grid-cols-2 items-center gap-3 rounded-xs">
                        {DISCOUNT_TYPE_OPTIONS.map((option) => {
                          const isActive = field.value === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isActive}
                              className={cn(
                                'inline-flex h-11 min-w-0 cursor-pointer items-center justify-center truncate rounded-full border px-3 text-xs font-semibold uppercase tracking-wider transition-colors',
                                isActive
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-outline-variant/70 text-on-surface-variant',
                              )}
                              onClick={() => {
                                field.onChange(option.value)
                                void trigger('discountValue')
                              }}
                              disabled={isSubmitting}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                />
                <Controller
                  control={control}
                  name="discountValue"
                  render={({ field }) => (
                    <NumberInput
                      ref={field.ref}
                      className="h-14"
                      label={
                        isPercentDiscount ? 'Discount (%)' : 'Discount Amount'
                      }
                      type="number"
                      min={0}
                      max={
                        isPercentDiscount
                          ? PERCENT_DISCOUNT_INPUT_MAX
                          : undefined
                      }
                      step={0.01}
                      maxDecimalPlaces={2}
                      endIcon={
                        isPercentDiscount ? (
                          <span className="text-sm">%</span>
                        ) : undefined
                      }
                      disabled={isSubmitting}
                      errorMessage={errors.discountValue?.message}
                      name={field.name}
                      onBlur={field.onBlur}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
            </article>
          </div>
        </section>

        <article className="rounded-4xl border border-outline-variant/30 bg-surface-container-low p-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-surface-container-high">
              <BrainIcon className="size-4" />
            </span>
            <h2 className="text-xl leading-tight font-medium text-on-surface-variant">
              Roast Characteristics
            </h2>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr] [&>*]:min-w-0">
            <div className="space-y-3 p-2">
              <Label htmlFor="roast-level">Roast Level</Label>
              <Slider
                id="roast-level"
                min={0}
                max={2}
                step={1}
                disabled={isSubmitting}
                value={[getRoastIndex(roastLevel)]}
                onValueChange={(values) => {
                  const nextIndex = Array.isArray(values)
                    ? (values[0] ?? 0)
                    : values
                  setValue(
                    'roastLevel',
                    roastLevels[nextIndex] ?? RoastLevel.LIGHT,
                    MARK_DIRTY,
                  )
                }}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Light</span>
                <Badge
                  variant="outline"
                  className="h-7 rounded-full border-primary/20 bg-primary/8 px-3 uppercase text-primary"
                >
                  {roastLevel}
                </Badge>
                <span>Dark</span>
              </div>
            </div>

            <div className="space-y-4">
              <Input
                className="h-14"
                label="Origin"
                placeholder="e.g. Sidama Region, Ethiopia"
                disabled={isSubmitting}
                errorMessage={errors.origin?.message}
                {...register('origin')}
              />
              <Input
                className="h-14"
                label="Processing Method"
                placeholder="e.g. Natural / Washed"
                disabled={isSubmitting}
                errorMessage={errors.processingMethod?.message}
                {...register('processingMethod')}
              />
            </div>

            <div className="space-y-2">
              <Label className="tracking-wider">Sourcing Ethics</Label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-pressed={isOrganic}
                  className={cn(
                    ETHICS_TOGGLE_CLASSES,
                    isOrganic
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/70 text-on-surface-variant',
                  )}
                  disabled={isSubmitting}
                  onClick={() => update('isOrganic', (prev) => !prev)}
                >
                  <Leaf className="size-3.5 shrink-0" aria-hidden />
                  <span>Organic</span>
                </button>
                <button
                  type="button"
                  aria-pressed={isFairTrade}
                  className={cn(
                    ETHICS_TOGGLE_CLASSES,
                    isFairTrade
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-outline-variant/70 text-on-surface-variant',
                  )}
                  disabled={isSubmitting}
                  onClick={() => update('isFairTrade', (prev) => !prev)}
                >
                  <BadgeCheck className="size-3.5 shrink-0" aria-hidden />
                  <span>Fair Trade</span>
                </button>
              </div>
            </div>
          </div>
          <div className="mt-5">
            <h2 className="text-xl leading-none font-medium text-on-surface-variant">
              Primary Tasting Notes
            </h2>
            <div className="mt-4 rounded-2xl border border-outline-variant/30 bg-surface-container px-5 py-5">
              <div className="flex flex-wrap items-center gap-2">
                {tastingNotes.map((note) => (
                  <Badge
                    key={note}
                    className="h-8 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
                  >
                    <span>{note}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${note}`}
                      className="ml-1 cursor-pointer rounded-full p-0.5 text-primary-foreground/90 hover:bg-primary-foreground/20 disabled:pointer-events-none disabled:opacity-50"
                      disabled={isSubmitting}
                      onClick={() =>
                        update('tastingNotes', (prev) =>
                          prev.filter((item) => item !== note),
                        )
                      }
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="mt-4 border-t border-outline-variant/20 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-h-12 flex-1 items-center gap-3 rounded-full bg-transparent px-1 text-muted-foreground">
                    <span className="text-lg leading-none opacity-60">#</span>
                    <input
                      value={pendingNote}
                      onChange={(event) => setPendingNote(event.target.value)}
                      placeholder="Add a new flavor note (e.g. Caramel, Citrus)..."
                      className="w-full border-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                      disabled={isSubmitting}
                    />
                  </div>
                  <Button
                    type="button"
                    className="h-11.5 w-auto rounded-full bg-primary px-5 text-xs font-semibold tracking-wide uppercase"
                    onClick={handleAddNote}
                    disabled={isSubmitting || !pendingNote.length}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add note
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </article>
      </form>
    </div>
  )
}

export default ProductForm
