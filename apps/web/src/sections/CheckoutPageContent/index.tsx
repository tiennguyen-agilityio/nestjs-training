'use client'

// import { Lock } from 'lucide-react'
// import { useAuth as useClerkAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { toast } from 'sonner'

import { CheckoutOrderSummary } from '@/components/CheckoutOrderSummary'
import { CheckoutPaymentMethod } from '@/components/CheckoutPaymentMethod'
import CheckoutShippingMethods from '@/components/CheckoutShippingMethods'
import { Input } from '@/components/Input'
import { Button } from '@/components/ui/button'
// import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
// import { ERROR_MESSAGES } from '@/constants/messages'
import { API_FALLBACK_ERRORS } from '@/constants/messages'
import { CHECKOUT_PLACE_ORDER_BLOCKED_MESSAGE } from '@/constants/order'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { useActiveShippingMethods } from '@/hooks/useShippingMethod'
// import { useCreateOrder } from '@/hooks/useOrder'
import { parseCheckoutValues } from '@/schemas/checkout'
import {
  findMapboxAddressSuggestions,
  mapboxFeatureToCheckoutAddress,
  type MapboxAddressSuggestion,
} from '@/services/mapboxGeocode'
import { useCartStore } from '@/store/useCartStore'
import type { ApiErrorResponse } from '@/types/api'
import type { CartTotals } from '@/types/cart'
import {
  PAYMENT_METHOD,
  type CheckoutFormValues,
  type AddressSnapshot,
  type PaymentMethod,
} from '@/types/checkout'
import Loading from '@/components/Loading'
import {
  ORDER_STATUS,
  SHIPPING_STATUS,
  type Order,
  type OrderItem,
  type OrderPayload,
} from '@/types/order'
import type { User } from '@/types/user'
import {
  mapItemFieldErrorsToLineIdMessages,
  omitSubmitErrorsForRemovedLine,
  // tagItemErrorsWithLineRefs,
} from '@/utils/order'
import { isCartItemBlocked } from '@/utils/inventory'

type CheckoutFieldErrors = Partial<Record<keyof CheckoutFormValues, string>>

const DEFAULT_VALUES: CheckoutFormValues = {
  firstName: '',
  lastName: '',
  phoneNumber: '',
  addressLine: '',
  city: '',
  district: '',
  ward: '',
  postalCode: '',
  paymentMethod: PAYMENT_METHOD.STRIPE,
  cardNumber: '',
  expiryDate: '',
  cvc: '',
}

const CheckoutPageContent = () => {
  const router = useRouter()
  // const { getToken } = useClerkAuth()
  const { user } = useAuth()

  const [values, setValues] = useState<CheckoutFormValues>(DEFAULT_VALUES)
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({})
  const [submitErrors, setSubmitErrors] = useState<ApiErrorResponse | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState('')
  const [addressSuggestions, setAddressSuggestions] = useState<
    MapboxAddressSuggestion[]
  >([])
  const [isAddressLookupLoading, setIsAddressLookupLoading] = useState(false)
  const [hasAddressLookupError, setHasAddressLookupError] = useState(false)
  const [isAddressSuggestionsOpen, setIsAddressSuggestionsOpen] =
    useState(false)
  const [isAddressInputFocused, setIsAddressInputFocused] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const selectedSuggestionRef = useRef<string | null>(null)

  // The shopper is always signed in here (middleware), so this is the server cart.
  const {
    items,
    totals,
    isLoading,
    isError,
    errorMessage,
    refetch,
    removeItem,
  } = useCart()
  // The mocked Place Order keeps writing the browser store only (#28).
  const { clearCart, setItemSnapshots } = useCartStore()
  // const { mutate: createOrder } = useCreateOrder()
  const {
    shippingMethods,
    isLoading: isShippingMethodsLoading,
    isError: isShippingMethodsError,
    errorMessage: shippingMethodsErrorMessage,
    refetch: refetchShippingMethods,
  } = useActiveShippingMethods()

  const hasItems = items.length > 0
  const hasOutOfStockItems = items.some(isCartItemBlocked)
  // const showCardFields = values.paymentMethod === PAYMENT_METHOD.STRIPE
  // The shopper's pick while it is still listed; otherwise the first method.
  const selectedShippingMethod =
    shippingMethods.find((method) => method.id === selectedShippingMethodId) ??
    shippingMethods[0]
  const isPlaceOrderDisabled =
    isLoading ||
    isSubmitting ||
    !hasItems ||
    hasOutOfStockItems ||
    !selectedShippingMethod
  const shippingFee = selectedShippingMethod?.price ?? 0
  const checkoutTotals: CartTotals = {
    ...totals,
    shipping: shippingFee,
    total: totals.subtotal + totals.tax + shippingFee,
  }

  const normalizedTotal = useMemo(
    () => checkoutTotals.total.toFixed(2),
    [checkoutTotals.total],
  )
  const initialUserValues = useMemo<AddressSnapshot>(() => {
    const userAddress = user?.address

    return {
      firstName: userAddress?.firstName ?? user?.firstName ?? '',
      lastName: userAddress?.lastName ?? user?.lastName ?? '',
      phoneNumber: userAddress?.phoneNumber ?? '',
      addressLine: userAddress?.addressLine ?? '',
      city: userAddress?.city ?? '',
      district: userAddress?.district ?? '',
      ward: userAddress?.ward ?? '',
      postalCode: userAddress?.postalCode ?? '',
    }
  }, [user])

  useEffect(() => {
    setValues((previousValues) => ({
      ...previousValues,
      firstName: previousValues.firstName || initialUserValues.firstName,
      lastName: previousValues.lastName || initialUserValues.lastName,
      phoneNumber:
        previousValues.phoneNumber.length > 0
          ? previousValues.phoneNumber
          : initialUserValues.phoneNumber,
      addressLine: previousValues.addressLine || initialUserValues.addressLine,
      city: previousValues.city || initialUserValues.city,
      district:
        previousValues.district.length > 0
          ? previousValues.district
          : initialUserValues.district,
      ward:
        previousValues.ward.length > 0
          ? previousValues.ward
          : initialUserValues.ward,
      postalCode: previousValues.postalCode || initialUserValues.postalCode,
    }))
  }, [initialUserValues])

  const handleValueChange = (
    field: keyof CheckoutFormValues,
    nextValue: string | PaymentMethod,
  ) => {
    setValues((previousValues) => ({
      ...previousValues,
      [field]: nextValue,
    }))

    setFieldErrors((previousErrors) => ({
      ...previousErrors,
      [field]: undefined,
    }))
  }

  const handleInputChange =
    (field: keyof CheckoutFormValues) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      handleValueChange(field, event.target.value)
    }

  const handleAddressInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectedSuggestionRef.current = null
    setHasAddressLookupError(false)
    const nextLine = event.target.value
    setValues((previousValues) => ({
      ...previousValues,
      addressLine: nextLine,
      district: '',
      ward: '',
      postalCode: '',
    }))
    setFieldErrors((previousErrors) => ({
      ...previousErrors,
      addressLine: undefined,
      district: undefined,
      ward: undefined,
      postalCode: undefined,
    }))
  }

  const handleAddressSuggestionSelect = (
    suggestion: MapboxAddressSuggestion,
  ) => {
    const parsed = mapboxFeatureToCheckoutAddress(suggestion.feature)
    const props = suggestion.feature.properties ?? {}
    const streetNumber =
      typeof props.address === 'string' ? props.address.trim() : ''
    const primary = suggestion.primaryText.trim()
    const nextAddressLine =
      [streetNumber, primary].filter(Boolean).join(' ').trim() ||
      parsed.addressLine.trim() ||
      primary
    selectedSuggestionRef.current = nextAddressLine
    setIsAddressSuggestionsOpen(false)
    setAddressSuggestions([])
    setHasAddressLookupError(false)

    setValues((previousValues) => ({
      ...previousValues,
      addressLine: nextAddressLine,
      city: parsed.city.trim() ? parsed.city : previousValues.city,
      district: parsed.district.trim()
        ? parsed.district
        : previousValues.district,
      ward: parsed.ward.trim() ? parsed.ward : previousValues.ward,
      postalCode: parsed.postalCode.trim()
        ? parsed.postalCode
        : previousValues.postalCode,
    }))
    setFieldErrors((previousErrors) => ({
      ...previousErrors,
      addressLine: undefined,
      city: undefined,
      district: undefined,
      ward: undefined,
      postalCode: undefined,
    }))
  }

  const handlePaymentMethodChange = (paymentMethod: PaymentMethod) => {
    handleValueChange('paymentMethod', paymentMethod)
  }

  useEffect(() => {
    const addressInput = values.addressLine.trim()

    if (selectedSuggestionRef.current === addressInput) {
      return
    }
    if (!addressInput || addressInput.length < 3) {
      setAddressSuggestions([])
      setIsAddressSuggestionsOpen(false)
      setHasAddressLookupError(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setIsAddressLookupLoading(true)
        const response = await findMapboxAddressSuggestions(addressInput)
        setIsAddressLookupLoading(false)

        if (!response.ok) {
          setAddressSuggestions([])
          setIsAddressSuggestionsOpen(false)
          setHasAddressLookupError(true)
          return
        }

        setAddressSuggestions(response.suggestions)
        setHasAddressLookupError(false)
        setIsAddressSuggestionsOpen(response.suggestions.length > 0)
      })()
    }, 350)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [values.addressLine])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitErrors(null)

    const result = parseCheckoutValues(values)
    if (!result.success) {
      const nextErrors: CheckoutFieldErrors = {}
      result.error.issues.forEach((issue) => {
        const issuePath = issue.path[0]
        if (typeof issuePath !== 'string') {
          return
        }
        const fieldName = issuePath as keyof CheckoutFormValues
        nextErrors[fieldName] ??= issue.message
      })
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    const orderItemPayloads = items.map((item) => ({
      variantId: item.variantId,
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
    // const linesAtSubmit = items.map((item) => ({
    //   id: item.id,
    //   productId: item.productId,
    // }))

    const orderPayload: OrderPayload = {
      shippingAddress: {
        firstName: result.data.firstName,
        lastName: result.data.lastName,
        phoneNumber: result.data.phoneNumber,
        addressLine: result.data.addressLine,
        city: result.data.city,
        district: result.data.district,
        ward: result.data.ward,
        postalCode: result.data.postalCode,
      },
      paymentMethod: result.data.paymentMethod,
      shippingMethodId: selectedShippingMethod?.id ?? '',
      items: orderItemPayloads,
    }

    const fallbackUser: User = {
      id: '',
      email: null,
      firstName: null,
      lastName: null,
      name: null,
      avatarUrl: null,
    }

    const orderItems: OrderItem[] = items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      productName: item.name,
      productImage: item.imageUrl,
      variantName: item.meta,
      finalPrice: item.unitPrice,
      subTotal: item.unitPrice * item.quantity,
      discountAmount: 0,
    }))

    const now = new Date().toISOString()
    const orderSnapshot: Order = {
      id: crypto.randomUUID(),
      userId: user?.id ?? '',
      orderNumber: `#NB-${Date.now().toString().slice(-6)}`,
      status: ORDER_STATUS.PENDING,
      shippingStatus: SHIPPING_STATUS.PENDING,
      paymentStatus: ORDER_STATUS.PENDING,
      subTotal: checkoutTotals.subtotal,
      tax: checkoutTotals.tax,
      shippingFee,
      totalAmount: checkoutTotals.total,
      shippingMethodId: selectedShippingMethod?.id ?? '',
      shippingMethodName: selectedShippingMethod?.name ?? '',
      paymentMethod: orderPayload.paymentMethod,
      addressSnapshot: orderPayload.shippingAddress,
      items: orderItems,
      user: user ?? fallbackUser,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }

    setItemSnapshots(orderSnapshot)
    toast.success('Order placed successfully', {
      description: `Total charged: $${normalizedTotal}`,
    })
    router.push(ROUTES.ORDER_SUCCESS)
    setIsSubmitting(false)
    setTimeout(() => {
      clearCart()
    }, 1000)

    // createOrder(
    //   {
    //     body: orderPayload,
    //     getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
    //   },
    //   {
    //     onSuccess: (data) => {
    //       setItemSnapshots(data)
    //       setSubmitErrors(null)
    //       toast.success('Order placed successfully', {
    //         description: `Total charged: $${normalizedTotal}`,
    //       })
    //       setIsSubmitting(false)
    //       router.push(ROUTES.ORDER_SUCCESS)

    //       setTimeout(() => {
    //         clearCart()
    //       }, 200)
    //     },
    //     onError: (error) => {
    //       setIsSubmitting(false)
    //       const defaultMessage =
    //         error instanceof Error
    //           ? error.message
    //           : ERROR_MESSAGES.SOMETHING_WENT_WRONG

    //       const responseData = (error as { response?: { data?: unknown } })
    //         .response?.data

    //       if (responseData && typeof responseData === 'object') {
    //         const data = responseData as Partial<ApiErrorResponse>
    //         const rawErrors = Array.isArray(data.errors) ? data.errors : []
    //         setSubmitErrors({
    //           statusCode:
    //             typeof data.statusCode === 'number' ? data.statusCode : 400,
    //           message:
    //             typeof data.message === 'string'
    //               ? data.message
    //               : defaultMessage,
    //           errors: tagItemErrorsWithLineRefs(rawErrors, linesAtSubmit),
    //         })
    //         return
    //       }

    //       setSubmitErrors({
    //         statusCode: 400,
    //         message: defaultMessage,
    //         errors: [],
    //       })
    //     },
    //   },
    // )
  }

  const submitLineRefs = useMemo(
    () => items.map((item) => ({ id: item.id, productId: item.productId })),
    [items],
  )

  const itemQuantityErrors = useMemo(
    () =>
      mapItemFieldErrorsToLineIdMessages(submitErrors?.errors, submitLineRefs),
    [submitErrors?.errors, submitLineRefs],
  )

  const hasVisibleLineSubmitErrors = useMemo(
    () => items.some((item) => Boolean(itemQuantityErrors[item.id])),
    [items, itemQuantityErrors],
  )

  const hasRootSubmissionError = Boolean(
    submitErrors &&
    (submitErrors.errors?.length ?? 0) === 0 &&
    Boolean(submitErrors.message),
  )

  const hasBlockingItemErrors =
    hasVisibleLineSubmitErrors || hasRootSubmissionError

  // One removal at a time per line: a second DELETE would answer 404.
  const removingLineIds = useRef(new Set<string>())

  const handleRemoveCheckoutLine = (lineId: string, productId: string) => {
    if (removingLineIds.current.has(lineId)) return
    removingLineIds.current.add(lineId)
    void removeItem(lineId)
      .then((result) => {
        if (!result.ok) toast.error(result.error)
      })
      .catch(() => toast.error(API_FALLBACK_ERRORS.CART_REMOVE))
      .finally(() => removingLineIds.current.delete(lineId))
    setSubmitErrors((previous) => {
      if (!previous) {
        return null
      }
      const next = omitSubmitErrorsForRemovedLine(previous, lineId, productId)
      const remainingCount = next?.errors?.length ?? 0
      if (remainingCount === 0) {
        return null
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div
        className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12"
        data-testid="checkout-loading"
      >
        <Loading />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6"
        data-testid="checkout-error"
      >
        <h1 className="text-3xl font-semibold text-on-surface">
          Finalize Your Brew Order
        </h1>
        <p className="mt-4 text-on-surface-variant">
          {errorMessage ?? 'Unable to load checkout right now.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button className="w-auto px-8" onClick={() => void refetch()}>
            Retry
          </Button>
          <Button
            variant="outline"
            className="w-auto px-8"
            onClick={() => router.push(ROUTES.CART)}
          >
            Back to Cart
          </Button>
        </div>
      </div>
    )
  }

  if (!hasItems) {
    return (
      <div
        className="mx-auto max-w-4xl px-4 py-16 text-center md:px-6"
        data-testid="checkout-empty"
      >
        <h1 className="text-3xl font-semibold text-on-surface">
          Your Cart Is Empty
        </h1>
        <p className="mt-4 text-on-surface-variant">
          Add products to your cart before checking out.
        </p>
        <Button
          className="mt-6 w-auto px-8"
          onClick={() => router.push(ROUTES.HOME)}
        >
          Continue Shopping
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
        Secure checkout
      </p>
      <h1 className="mt-3 text-4xl font-semibold text-on-surface md:text-5xl">
        Finalize Your Brew Order
      </h1>

      {hasOutOfStockItems ? (
        <div
          className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          data-testid="checkout-out-of-stock-alert"
          role="alert"
        >
          {CHECKOUT_PLACE_ORDER_BLOCKED_MESSAGE}
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          ref={formRef}
          className="space-y-8"
          onSubmit={handleSubmit}
          noValidate
        >
          <section aria-label="Shipping Information">
            <div className="flex items-center justify-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ring text-sm font-semibold text-primary-foreground">
                1
              </div>
              <h2 className="text-2xl font-medium text-on-surface">
                Shipping Information
              </h2>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="First Name"
                value={values.firstName}
                onChange={handleInputChange('firstName')}
                errorMessage={fieldErrors.firstName}
                placeholder="Enter your first name"
                disabled={isSubmitting}
              />
              <Input
                label="Last Name"
                value={values.lastName}
                onChange={handleInputChange('lastName')}
                errorMessage={fieldErrors.lastName}
                placeholder="Enter your last name"
                disabled={isSubmitting}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone Number"
                value={values.phoneNumber}
                maxLength={10}
                onChange={handleInputChange('phoneNumber')}
                errorMessage={fieldErrors.phoneNumber}
                placeholder="Enter your phone number"
                disabled={isSubmitting}
                inputMode="numeric"
              />
              <div className="relative">
                <Input
                  label="Delivery Address"
                  value={values.addressLine}
                  onChange={handleAddressInputChange}
                  onFocus={() => setIsAddressInputFocused(true)}
                  onBlur={() => setIsAddressInputFocused(false)}
                  errorMessage={fieldErrors.addressLine}
                  placeholder="Enter your delivery address"
                  disabled={isSubmitting}
                />
                {isAddressInputFocused && isAddressSuggestionsOpen && (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-outline-variant bg-surface shadow-lg">
                    {addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        className="block w-full cursor-pointer border-b border-outline-variant/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-container-low"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() =>
                          handleAddressSuggestionSelect(suggestion)
                        }
                      >
                        <p className="text-sm font-medium text-on-surface">
                          {suggestion.primaryText}
                        </p>
                        {suggestion.secondaryText ? (
                          <p className="text-xs text-on-surface-variant">
                            {suggestion.secondaryText}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {(isAddressLookupLoading || hasAddressLookupError) && (
              <p
                className={`mt-2 text-xs ${
                  hasAddressLookupError
                    ? 'text-destructive'
                    : 'text-on-surface-variant'
                }`}
              >
                {hasAddressLookupError
                  ? 'Could not load address suggestions right now.'
                  : 'Looking up address suggestions...'}
              </p>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Input
                label="City"
                value={values.city}
                onChange={handleInputChange('city')}
                errorMessage={fieldErrors.city}
                placeholder="Enter your city"
                disabled={isSubmitting}
              />
              <Input
                label="District"
                value={values.district}
                onChange={handleInputChange('district')}
                errorMessage={fieldErrors.district}
                placeholder="Enter your district"
                disabled={isSubmitting}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Ward"
                value={values.ward}
                onChange={handleInputChange('ward')}
                errorMessage={fieldErrors.ward}
                placeholder="Enter your ward"
                disabled={isSubmitting}
              />
              <Input
                label="Postal Code"
                value={values.postalCode}
                onChange={handleInputChange('postalCode')}
                errorMessage={fieldErrors.postalCode}
                placeholder="Enter your postal code"
                disabled={isSubmitting}
              />
            </div>
          </section>

          <section aria-label="Payment Method">
            <div className="flex items-center justify-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ring text-sm font-semibold text-primary-foreground">
                2
              </div>
              <h2 className="text-2xl font-medium text-on-surface">
                Payment Method
              </h2>
            </div>
            <div className="mt-5">
              <CheckoutPaymentMethod
                value={values.paymentMethod}
                onChange={handlePaymentMethodChange}
                disabled={isSubmitting}
              />
            </div>

            {/* {showCardFields && (
              <div className="mt-5">
                <Input
                  label="Card Number"
                  value={values.cardNumber}
                  onChange={handleInputChange('cardNumber')}
                  errorMessage={fieldErrors.cardNumber}
                  placeholder="0000 0000 0000 0000"
                  endIcon={<Lock className="size-4" aria-hidden />}
                  disabled={isSubmitting}
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Expiry Date"
                    value={values.expiryDate}
                    onChange={handleInputChange('expiryDate')}
                    errorMessage={fieldErrors.expiryDate}
                    placeholder="MM/YY"
                    disabled={isSubmitting}
                  />
                  <Input
                    label="CVC"
                    value={values.cvc}
                    onChange={handleInputChange('cvc')}
                    errorMessage={fieldErrors.cvc}
                    placeholder="123"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
            )} */}
          </section>

          <CheckoutShippingMethods
            methods={shippingMethods}
            selectedId={selectedShippingMethod?.id ?? ''}
            onSelect={setSelectedShippingMethodId}
            isLoading={isShippingMethodsLoading}
            isError={isShippingMethodsError}
            errorMessage={shippingMethodsErrorMessage}
            onRetry={() => void refetchShippingMethods()}
            disabled={isSubmitting}
          />
        </form>

        <CheckoutOrderSummary
          items={items}
          totals={checkoutTotals}
          onRemoveItem={handleRemoveCheckoutLine}
          submissionErrorMessage={
            submitErrors?.errors?.length === 0
              ? (submitErrors.message ?? null)
              : null
          }
          itemQuantityErrors={itemQuantityErrors}
          hasBlockingItemErrors={hasBlockingItemErrors}
          onPlaceOrder={() => {
            if (!formRef.current) {
              return
            }
            formRef.current.requestSubmit()
          }}
          isPlacingOrder={isSubmitting}
          isPlaceOrderDisabled={isPlaceOrderDisabled}
        />
      </div>
    </div>
  )
}

export default CheckoutPageContent
