'use client'

// import { Lock } from 'lucide-react'
import { useAuth as useClerkAuth } from '@clerk/nextjs'
import { useQueryClient } from '@tanstack/react-query'
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
import { CLERK_SESSION_TEMPLATE } from '@/constants/common'
import {
  API_FALLBACK_ERRORS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from '@/constants/messages'
import { CHECKOUT_PLACE_ORDER_BLOCKED_MESSAGE } from '@/constants/order'
import { orderSuccessPath, ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { cartQueryKeys, useCart } from '@/hooks/useCart'
import { useCreateOrder } from '@/hooks/useOrder'
import { useStartPayment } from '@/hooks/usePayment'
import { useActiveShippingMethods } from '@/hooks/useShippingMethod'
import { parseCheckoutValues, validateCheckoutField } from '@/schemas/checkout'
import {
  findMapboxAddressSuggestions,
  mapboxFeatureToCheckoutAddress,
  suggestionAddressLine,
  type MapboxAddressSuggestion,
} from '@/services/mapboxGeocode'
import { useCartStore } from '@/store/useCartStore'
import type { ApiErrorResponse, ErrorDetail } from '@/types/api'
import type { CartItem, CartTotals } from '@/types/cart'
import type { PlacedOrder } from '@/types/order'
import {
  PAYMENT_METHOD,
  type CheckoutFormValues,
  type AddressSnapshot,
  type PaymentMethod,
} from '@/types/checkout'
import Loading from '@/components/Loading'
import { calculateTotal, formatCurrency } from '@/utils/cart'
import {
  buildPlaceOrderPayload,
  mapItemFieldErrorsToLineIdMessages,
  omitSubmitErrorsForRemovedLine,
  paymentErrorMessage,
  PLACE_ORDER_ERR_CODES,
  tagItemErrorsWithLineRefs,
} from '@/utils/order'
import { ServiceError } from '@/utils/query'
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

const ADDRESS_FIELDS = [
  'addressLine',
  'city',
  'district',
  'ward',
  'postalCode',
] as const satisfies readonly (keyof CheckoutFormValues)[]

const LINE_ERR_CODES = new Set<string>([
  PLACE_ORDER_ERR_CODES.OUT_OF_STOCK,
  PLACE_ORDER_ERR_CODES.ITEM_UNAVAILABLE,
])

type TaggedLineError = ErrorDetail & {
  submitLineId?: string
  submitProductId?: string
}

/** The same match the row errors use (`mapItemFieldErrorsToLineMessages`). */
const isErrorOfLine = (error: TaggedLineError, line: CartItem): boolean =>
  error.submitLineId === line.id &&
  (error.submitProductId === undefined ||
    error.submitProductId === line.productId)

const LINE_MESSAGES = [
  [PLACE_ORDER_ERR_CODES.OUT_OF_STOCK, ERROR_MESSAGES.ORDER_OUT_OF_STOCK],
  [
    PLACE_ORDER_ERR_CODES.ITEM_UNAVAILABLE,
    ERROR_MESSAGES.ORDER_ITEM_UNAVAILABLE,
  ],
] as const

/**
 * The page-level message for the line errors still kept: it names the shown
 * lines they match, and says the cart changed when one matches no shown line
 * (gone or replaced after the refetch), so a failed order always says so.
 */
const lineErrorMessages = (
  errors: ErrorDetail[] | undefined,
  lines: readonly CartItem[],
): string[] => {
  const tagged = (errors ?? []) as TaggedLineError[]
  const messages = LINE_MESSAGES.map(([errCode, message]) => {
    const names = lines
      .filter((line) =>
        tagged.some(
          (error) => error.errCode === errCode && isErrorOfLine(error, line),
        ),
      )
      .map((line) => line.name)
    return names.length > 0 ? message(names.join(', ')) : null
  }).filter((message): message is string => Boolean(message))
  const hasUnmatched = tagged.some(
    (error) => !lines.some((line) => isErrorOfLine(error, line)),
  )
  if (hasUnmatched) messages.push(ERROR_MESSAGES.ORDER_ITEMS_CHANGED)
  return messages
}

/**
 * The page-level message for an error that names no line. Only mapped codes
 * get their own text: the API's `description` of other errors can be its
 * developer message (the exception filter copies it there).
 */
const placeOrderErrorMessage = (errors: ErrorDetail[]): string => {
  const errCodes = new Set(errors.map((error) => error.errCode))
  if (errCodes.has(PLACE_ORDER_ERR_CODES.CART_EMPTY)) {
    return ERROR_MESSAGES.ORDER_CART_EMPTY
  }
  if (errCodes.has(PLACE_ORDER_ERR_CODES.SHIPPING_METHOD_UNAVAILABLE)) {
    return ERROR_MESSAGES.ORDER_SHIPPING_METHOD_UNAVAILABLE
  }
  return API_FALLBACK_ERRORS.ORDER_CREATE
}

const CheckoutPageContent = () => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { getToken } = useClerkAuth()
  const { user, refresh: refreshUser } = useAuth()
  const defaultAddress =
    user?.addresses?.find((address) => address.isDefault) ?? null
  const { mutateAsync: createOrder } = useCreateOrder()
  const { mutateAsync: startPayment } = useStartPayment()

  const [values, setValues] = useState<CheckoutFormValues>(DEFAULT_VALUES)
  const [fieldErrors, setFieldErrors] = useState<CheckoutFieldErrors>({})
  const [submitErrors, setSubmitErrors] = useState<ApiErrorResponse | null>(
    null,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState('')
  // After the API rejected the method, the shopper picks one again: no fallback.
  const [mustPickShippingMethod, setMustPickShippingMethod] = useState(false)
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null)
  const [hasPlacedOrder, setHasPlacedOrder] = useState(false)
  // A line error the API sent for a line Checkout does not show (cart changed).
  const [hasUnmatchedLineError, setHasUnmatchedLineError] = useState(false)
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
  // Order success reads the placed order from the browser store.
  const { setItemSnapshots } = useCartStore()
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
  // The shopper's pick while it is still listed; otherwise the first method,
  // unless the API rejected the method and the shopper must pick again.
  const selectedShippingMethod =
    shippingMethods.find((method) => method.id === selectedShippingMethodId) ??
    (mustPickShippingMethod ? undefined : shippingMethods[0])

  const handleSelectShippingMethod = (methodId: string) => {
    setSelectedShippingMethodId(methodId)
    setMustPickShippingMethod(false)
    setPlaceOrderError(null)
  }
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
    // In cents, as the API adds subTotal + shippingFee + tax.
    total: calculateTotal({
      subtotal: totals.subtotal,
      shipping: shippingFee,
      tax: totals.tax,
    }),
  }

  const initialUserValues = useMemo<AddressSnapshot>(
    () => ({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      phoneNumber: user?.phoneNumber ?? '',
      addressLine: defaultAddress?.addressLine ?? '',
      city: defaultAddress?.city ?? '',
      district: defaultAddress?.district ?? '',
      ward: defaultAddress?.ward ?? '',
      postalCode: defaultAddress?.postalCode ?? '',
    }),
    [user, defaultAddress],
  )

  useEffect(() => {
    setValues((previousValues) => {
      const isAddressEmpty = ADDRESS_FIELDS.every(
        (field) => previousValues[field].length === 0,
      )
      const applyAddress =
        isAddressEmpty && initialUserValues.addressLine.length > 0
      if (applyAddress) {
        selectedSuggestionRef.current = initialUserValues.addressLine.trim()
      }

      return {
        ...previousValues,
        firstName: previousValues.firstName || initialUserValues.firstName,
        lastName: previousValues.lastName || initialUserValues.lastName,
        phoneNumber:
          previousValues.phoneNumber || initialUserValues.phoneNumber,
        ...(applyAddress
          ? {
              addressLine: initialUserValues.addressLine,
              city: initialUserValues.city,
              district: initialUserValues.district,
              ward: initialUserValues.ward,
              postalCode: initialUserValues.postalCode,
            }
          : {}),
      }
    })
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

  // A field shows its schema error once the shopper leaves it.
  const handleFieldBlur = (field: keyof CheckoutFormValues) => () => {
    setFieldErrors((previousErrors) => ({
      ...previousErrors,
      [field]: validateCheckoutField(values, field),
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
    }))
    setFieldErrors((previousErrors) => ({
      ...previousErrors,
      addressLine: undefined,
    }))
  }

  const handleAddressSuggestionSelect = (
    suggestion: MapboxAddressSuggestion,
  ) => {
    const parsed = mapboxFeatureToCheckoutAddress(suggestion.feature)
    const nextAddressLine =
      suggestionAddressLine(suggestion, values.addressLine) ||
      parsed.addressLine.trim()
    selectedSuggestionRef.current = nextAddressLine
    setIsAddressSuggestionsOpen(false)
    setAddressSuggestions([])
    setHasAddressLookupError(false)

    setValues((previousValues) => ({
      ...previousValues,
      addressLine: nextAddressLine,
      city: parsed.city.trim(),
      district: parsed.district.trim(),
      ward: parsed.ward.trim(),
      postalCode: parsed.postalCode.trim(),
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

  const payPlacedOrder = async (orderId: string) => {
    try {
      const checkout = await startPayment(orderId)
      router.replace(checkout.checkoutUrl)
    } catch (error) {
      const errCode =
        error instanceof ServiceError ? error.errors[0]?.errCode : undefined
      toast.error(paymentErrorMessage(errCode))
      router.push(orderSuccessPath(orderId, errCode ?? 'unknown'))
    }
  }

  /**
   * Validates the form and places the order; `null` when the form is invalid
   * or the API refused it (its errors are already shown).
   */
  const placeOrder = async (): Promise<PlacedOrder | null> => {
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
      return null
    }

    if (isSubmitting || !selectedShippingMethod) {
      return null
    }

    setFieldErrors({})
    setPlaceOrderError(null)
    setHasUnmatchedLineError(false)
    setIsSubmitting(true)
    // The API names failing lines by index, in the order shown at submit.
    const linesAtSubmit = items

    try {
      const order = await createOrder({
        body: buildPlaceOrderPayload(result.data, selectedShippingMethod.id),
        getToken: () => getToken({ template: CLERK_SESSION_TEMPLATE }),
      })
      // The API emptied the server cart: read it again (header count → 0).
      void queryClient.invalidateQueries({ queryKey: cartQueryKeys.root })
      // The API saves the first order's address as the default: read the user again.
      void refreshUser()
      return order
    } catch (error) {
      const errors = error instanceof ServiceError ? error.errors : []
      const errCodes = new Set(errors.map((detail) => detail.errCode))
      const lineErrors = errors.filter((detail) =>
        LINE_ERR_CODES.has(detail.errCode),
      )

      const lineRefs = linesAtSubmit.map((line) => ({
        id: line.id,
        productId: line.productId,
      }))
      const tagged = tagItemErrorsWithLineRefs(
        lineErrors,
        lineRefs,
      ) as TaggedLineError[]
      // Only errors tied to a shown line are kept: an untagged one would fall
      // back to its raw index and flag whatever line the refetch puts there.
      const taggedLineErrors = tagged.filter(
        (detail) => detail.submitLineId !== undefined,
      )
      const otherErrors = errors.filter(
        (detail) => !LINE_ERR_CODES.has(detail.errCode),
      )
      setHasUnmatchedLineError(taggedLineErrors.length < tagged.length)
      // Tagged line errors get their banner from the lines still shown (render).
      setPlaceOrderError(
        otherErrors.length > 0 || lineErrors.length === 0
          ? placeOrderErrorMessage(otherErrors)
          : null,
      )
      setSubmitErrors(
        taggedLineErrors.length > 0
          ? {
              statusCode: 400,
              message: API_FALLBACK_ERRORS.ORDER_CREATE,
              errors: taggedLineErrors,
            }
          : null,
      )
      if (
        lineErrors.length > 0 ||
        errCodes.has(PLACE_ORDER_ERR_CODES.CART_EMPTY)
      ) {
        // The cart changed on the server: show what it holds now.
        void queryClient.invalidateQueries({ queryKey: cartQueryKeys.root })
      }
      if (errCodes.has(PLACE_ORDER_ERR_CODES.SHIPPING_METHOD_UNAVAILABLE)) {
        setSelectedShippingMethodId('')
        setMustPickShippingMethod(true)
        void refetchShippingMethods()
      }
      setIsSubmitting(false)
      return null
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const order = await placeOrder()
    if (!order) return
    setItemSnapshots(order)
    // Keeps the empty-cart state from flashing while the route changes.
    setHasPlacedOrder(true)
    if (values.paymentMethod !== PAYMENT_METHOD.COD) {
      await payPlacedOrder(order.id)
      return
    }
    toast.success(SUCCESS_MESSAGES.ORDER_PLACED, {
      description: SUCCESS_MESSAGES.ORDER_TOTAL(
        formatCurrency(order.totalAmount),
      ),
    })
    router.push(ROUTES.ORDER_SUCCESS)
  }

  const isFormLocked = isSubmitting

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

  // A page-level error leaves Place order enabled, so the shopper can retry.
  const hasBlockingItemErrors = hasVisibleLineSubmitErrors

  // One removal at a time per line: a second DELETE would answer 404.
  const removingLineIds = useRef(new Set<string>())

  const handleRemoveCheckoutLine = (lineId: string, productId: string) => {
    if (removingLineIds.current.has(lineId)) return
    removingLineIds.current.add(lineId)
    void removeItem(lineId)
      .then((result) => {
        if (!result.ok) {
          // The line stays, so its error and the banner stay too.
          toast.error(result.error)
          return
        }
        setSubmitErrors((previous) => {
          const next = omitSubmitErrorsForRemovedLine(
            previous,
            lineId,
            productId,
          )
          return (next?.errors?.length ?? 0) === 0 ? null : next
        })
      })
      .catch(() => toast.error(API_FALLBACK_ERRORS.CART_REMOVE))
      .finally(() => removingLineIds.current.delete(lineId))
  }

  // One banner for the whole reply; the cart-changed notice shows once.

  const submissionMessage =
    [
      ...new Set([
        ...lineErrorMessages(submitErrors?.errors, items),
        ...(hasUnmatchedLineError ? [ERROR_MESSAGES.ORDER_ITEMS_CHANGED] : []),
        ...(placeOrderError ? [placeOrderError] : []),
      ]),
    ].join(' ') || null

  // After a placed order the emptied cart shows the loader until the route changes.
  if (isLoading || (hasPlacedOrder && !hasItems)) {
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

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
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
                onBlur={handleFieldBlur('firstName')}
                errorMessage={fieldErrors.firstName}
                placeholder="Enter your first name"
                disabled={isFormLocked}
              />
              <Input
                label="Last Name"
                value={values.lastName}
                onChange={handleInputChange('lastName')}
                onBlur={handleFieldBlur('lastName')}
                errorMessage={fieldErrors.lastName}
                placeholder="Enter your last name"
                disabled={isFormLocked}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Phone Number"
                value={values.phoneNumber}
                // Digits only, typed or pasted. No maxLength or cut: either
                // would drop digits ("090 123 4567", "+84 …") without a
                // word; the schema reports a number that is not 10 digits.
                onChange={(event) =>
                  handleValueChange(
                    'phoneNumber',
                    event.target.value.replace(/\D/g, ''),
                  )
                }
                onBlur={handleFieldBlur('phoneNumber')}
                errorMessage={fieldErrors.phoneNumber}
                placeholder="Enter your phone number"
                disabled={isFormLocked}
                inputMode="numeric"
                type="tel"
              />
              <div className="relative">
                <Input
                  label="Delivery Address"
                  value={values.addressLine}
                  onChange={handleAddressInputChange}
                  onFocus={() => setIsAddressInputFocused(true)}
                  onBlur={() => {
                    setIsAddressInputFocused(false)
                    handleFieldBlur('addressLine')()
                  }}
                  errorMessage={fieldErrors.addressLine}
                  placeholder="Enter your delivery address"
                  disabled={isFormLocked}
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
                onBlur={handleFieldBlur('city')}
                errorMessage={fieldErrors.city}
                placeholder="Enter your city"
                disabled={isFormLocked}
              />
              <Input
                label="District"
                value={values.district}
                onChange={handleInputChange('district')}
                onBlur={handleFieldBlur('district')}
                errorMessage={fieldErrors.district}
                placeholder="Enter your district"
                disabled={isFormLocked}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Ward"
                value={values.ward}
                onChange={handleInputChange('ward')}
                onBlur={handleFieldBlur('ward')}
                errorMessage={fieldErrors.ward}
                placeholder="Enter your ward"
                disabled={isFormLocked}
              />
              <Input
                label="Postal Code"
                value={values.postalCode}
                onChange={handleInputChange('postalCode')}
                onBlur={handleFieldBlur('postalCode')}
                errorMessage={fieldErrors.postalCode}
                placeholder="Enter your postal code"
                disabled={isFormLocked}
              />
            </div>
          </section>

          <CheckoutShippingMethods
            methods={shippingMethods}
            selectedId={selectedShippingMethod?.id ?? ''}
            onSelect={handleSelectShippingMethod}
            isLoading={isShippingMethodsLoading}
            isError={isShippingMethodsError}
            errorMessage={shippingMethodsErrorMessage}
            onRetry={() => void refetchShippingMethods()}
            disabled={isFormLocked}
          />

          <section aria-label="Payment Method">
            <div className="flex items-center justify-start gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ring text-sm font-semibold text-primary-foreground">
                3
              </div>
              <h2 className="text-2xl font-medium text-on-surface">
                Payment Method
              </h2>
            </div>
            <div className="mt-5">
              <CheckoutPaymentMethod
                value={values.paymentMethod}
                onChange={handlePaymentMethodChange}
                disabled={isFormLocked}
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
                  disabled={isFormLocked}
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Expiry Date"
                    value={values.expiryDate}
                    onChange={handleInputChange('expiryDate')}
                    errorMessage={fieldErrors.expiryDate}
                    placeholder="MM/YY"
                    disabled={isFormLocked}
                  />
                  <Input
                    label="CVC"
                    value={values.cvc}
                    onChange={handleInputChange('cvc')}
                    errorMessage={fieldErrors.cvc}
                    placeholder="123"
                    disabled={isFormLocked}
                  />
                </div>
              </div>
            )} */}
          </section>
        </form>

        <CheckoutOrderSummary
          items={items}
          totals={checkoutTotals}
          onRemoveItem={handleRemoveCheckoutLine}
          submissionErrorMessage={submissionMessage}
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
          placeOrderLabel={
            values.paymentMethod === PAYMENT_METHOD.COD
              ? 'Place Order'
              : 'Continue to payment'
          }
        />
      </div>
    </div>
  )
}

export default CheckoutPageContent
