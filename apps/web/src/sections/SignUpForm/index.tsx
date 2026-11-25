'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import * as SignUp from '@clerk/elements/sign-up'
import * as Clerk from '@clerk/elements/common'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Lock, Mail, User } from 'lucide-react'

import { ROUTES } from '@/constants/routes'
import { useCleanClerkUrl } from '@/hooks/useCleanClerkUrl'
import { parseSignUpStartForm } from '@/schemas/user'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import Loading from '@/components/Loading'
import { Spinner } from '@/components/ui/spinner'

import SocialButtons from '../SocialButtons'
import ClerkField from '../ClerkField'

interface StartFieldErrors {
  firstName?: string
  lastName?: string
  emailAddress?: string
  password?: string
}

const SignUpForm = () => {
  const pathname = usePathname()
  const isSsoCallback = pathname?.endsWith('/sso-callback') ?? false
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
  useCleanClerkUrl()
  const [startErrors, setStartErrors] = useState<StartFieldErrors>({})
  const hasCheckedInitialAuth = useRef(false)

  // Only bounce users who were already signed in when they opened /sign-up.
  // After a sign-up completes here, Clerk's setActive navigates to
  // `redirect_url` or NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL itself.
  useEffect(() => {
    if (!isLoaded || hasCheckedInitialAuth.current) return
    hasCheckedInitialAuth.current = true
    if (isSignedIn) router.replace(ROUTES.HOME)
  }, [isLoaded, isSignedIn, router])

  const handleSignUpStartClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const form = event.currentTarget.closest('form')
      if (!form) {
        return
      }

      const parsed = parseSignUpStartForm(new FormData(form))
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        setStartErrors({
          firstName: fieldErrors.firstName?.[0],
          lastName: fieldErrors.lastName?.[0],
          emailAddress: fieldErrors.emailAddress?.[0],
          password: fieldErrors.password?.[0],
        })
        event.preventDefault()
        return
      }

      setStartErrors({})
    },
    [],
  )

  return (
    <>
      <SignUp.Root
        fallback={<Loading fullScreen size="lg" label="Loading sign up form" />}
      >
        {isSsoCallback && (
          <Loading fullScreen size="lg" label="Completing sign up" />
        )}
        <Clerk.Loading scope="global">
          {(isGlobalLoading) => (
            <div className="mx-auto w-full max-w-[1440px] h-full overflow-hidden rounded-3xl text-sm shadow-[0_0_15px_5px_rgba(0,0,0,0.1)]">
              <SignUp.Step
                name="start"
                aria-label="Create account: your details"
                className="grid items-stretch overflow-hidden rounded-3xl lg:grid-cols-[1.02fr_1fr]"
              >
                <div className="relative hidden min-h-[850px] overflow-hidden bg-surface-container lg:block">
                  <Image
                    src="/images/glass-coffee-cup-layers.png"
                    alt="Freshly brewed coffee in glass cup"
                    fill
                    priority
                    className="object-cover grayscale-20 sepia-10 contrast-110"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-on-surface/40 via-on-surface/10 to-transparent" />
                  <div className="absolute inset-x-0 top-0 p-16">
                    <p className="text-xs font-semibold tracking-[0.24em] text-primary-container">
                      THE EDITORIAL CHEMIST
                    </p>
                    <h2 className="mt-5 max-w-md text-5xl leading-tight text-surface">
                      Elevating the morning ritual into a sensory science.
                    </h2>
                    <p className="mt-6 max-w-md text-base leading-7 text-surface/80">
                      Join our community of tactile brewers and explore the
                      complex chemistry behind every single-origin roast.
                    </p>
                  </div>
                </div>
                <Clerk.Loading>
                  {(isSubmitting) => {
                    const isLoading = isGlobalLoading || isSubmitting

                    return (
                      <div className="flex bg-surface px-6 py-8 md:items-center md:px-10 md:py-10 lg:px-16 lg:py-12">
                        <div className="mx-auto w-full max-w-md space-y-10">
                          <div className="space-y-2">
                            <h1 className="text-3xl leading-tight font-headline font-bold tracking-tight text-on-surface">
                              Create your account
                            </h1>
                            <p className="text-base text-on-surface-variant">
                              Create your sensory profile to unlock a curated
                              world of premium coffee.
                            </p>
                          </div>

                          <SocialButtons disabled={isLoading} />

                          <Separator
                            text="OR CONTINUE WITH"
                            className="[&>span]:bg-surface [&>span]:px-4 [&>span]:text-[0.7rem] [&>span]:font-semibold [&>span]:tracking-[0.2em] **:data-[slot=separator]:bg-outline-variant/30"
                          />

                          <div className="space-y-6">
                            <div className="space-y-2 md:grid grid-cols-2 gap-4">
                              <ClerkField
                                required
                                name="firstName"
                                label="First name"
                                placeholder="First name"
                                type="text"
                                icon={<User className="size-4" aria-hidden />}
                                disabled={isLoading}
                                clientError={startErrors.firstName}
                                onChange={() =>
                                  setStartErrors((prev) => ({
                                    ...prev,
                                    firstName: undefined,
                                  }))
                                }
                              />

                              <ClerkField
                                required
                                name="lastName"
                                label="Last name"
                                placeholder="Last name"
                                type="text"
                                icon={<User className="size-4" aria-hidden />}
                                disabled={isLoading}
                                clientError={startErrors.lastName}
                                onChange={() =>
                                  setStartErrors((prev) => ({
                                    ...prev,
                                    lastName: undefined,
                                  }))
                                }
                              />
                            </div>

                            <ClerkField
                              required
                              name="emailAddress"
                              label="Email Address"
                              placeholder="example@gmail.com"
                              type="email"
                              icon={<Mail className="size-4" aria-hidden />}
                              disabled={isLoading}
                              clientError={startErrors.emailAddress}
                              onChange={() =>
                                setStartErrors((prev) => ({
                                  ...prev,
                                  emailAddress: undefined,
                                }))
                              }
                            />

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-4 px-1">
                                <span className="text-sm font-semibold text-on-surface-variant">
                                  Password
                                </span>
                              </div>
                              <ClerkField
                                required
                                name="password"
                                label=""
                                placeholder="Enter your password"
                                type="password"
                                icon={<Lock className="size-4" aria-hidden />}
                                disabled={isLoading}
                                clientError={startErrors.password}
                                onChange={() =>
                                  setStartErrors((prev) => ({
                                    ...prev,
                                    password: undefined,
                                  }))
                                }
                              />
                            </div>

                            <SignUp.Captcha />

                            <Checkbox
                              defaultChecked
                              disabled
                              label="Keep me signed in"
                              wrapperClassName="gap-3 px-1"
                              className="size-5 border data-unchecked:border-outline-variant data-unchecked:bg-surface-container-low"
                              labelClassName="text-sm font-medium text-on-surface-variant"
                            />

                            <SignUp.Action submit asChild disabled={isLoading}>
                              <Button
                                type="submit"
                                className="h-14 rounded-full text-base shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleSignUpStartClick}
                              >
                                Sign up
                                {isSubmitting && (
                                  <Spinner decorative size="md" />
                                )}
                              </Button>
                            </SignUp.Action>
                          </div>

                          <p className="pt-2 text-center text-base font-medium text-on-surface-variant">
                            Already have an account?{' '}
                            <Clerk.Link
                              navigate="sign-in"
                              aria-disabled={isLoading}
                              tabIndex={isLoading ? -1 : undefined}
                              onClick={(event) => {
                                if (isLoading) event.preventDefault()
                              }}
                              className="ml-1 font-bold text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-50"
                            >
                              Sign in
                            </Clerk.Link>
                          </p>
                        </div>
                      </div>
                    )
                  }}
                </Clerk.Loading>
              </SignUp.Step>

              <SignUp.Step
                name="continue"
                aria-label="Create account: additional details"
                className="flex min-h-[360px] items-center bg-surface px-6 py-10 md:px-10 lg:px-16"
              >
                <Clerk.Loading>
                  {(isSubmitting) => {
                    const isLoading = isGlobalLoading || isSubmitting

                    return (
                      <div className="mx-auto w-full max-w-md space-y-8">
                        <div className="space-y-2">
                          <h1 className="text-3xl leading-tight font-headline font-bold tracking-tight text-on-surface">
                            Almost there
                          </h1>
                          <p className="text-base text-on-surface-variant">
                            If your sign-in provider still needs extra details,
                            submit this step or go back to edit your
                            information.
                          </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <SignUp.Action
                            navigate="start"
                            asChild
                            disabled={isLoading}
                          >
                            <Button
                              type="button"
                              variant="outline"
                              className="h-12 flex-1 rounded-full"
                            >
                              Back
                            </Button>
                          </SignUp.Action>
                          <SignUp.Action submit asChild disabled={isLoading}>
                            <Button
                              type="submit"
                              className="h-12 flex-1 rounded-full text-base shadow-lg shadow-primary/20"
                            >
                              Continue
                              {isSubmitting && <Spinner decorative size="md" />}
                            </Button>
                          </SignUp.Action>
                        </div>
                      </div>
                    )
                  }}
                </Clerk.Loading>
              </SignUp.Step>

              <SignUp.Step
                name="verifications"
                aria-label="Verify your account"
                className="flex min-h-[520px] items-center bg-surface px-6 py-10 md:px-10 lg:px-16"
              >
                <Clerk.Loading scope="submit">
                  {(isSubmitting) => {
                    const isLoading = isGlobalLoading || isSubmitting

                    return (
                      <div className="mx-auto w-full max-w-md space-y-8">
                        <div className="space-y-2">
                          <h1 className="text-3xl leading-tight font-headline font-bold tracking-tight text-on-surface">
                            Verify your account
                          </h1>
                          <p className="text-base text-on-surface-variant">
                            Complete verification using the code we sent you.
                          </p>
                        </div>

                        <SignUp.Strategy name="email_code">
                          <div className="space-y-6">
                            <ClerkField
                              required
                              name="code"
                              label="Email code"
                              placeholder="Enter verification code"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              disabled={isLoading}
                            />
                            <SignUp.Action submit asChild disabled={isLoading}>
                              <Button
                                type="submit"
                                disabled={isLoading}
                                className="h-12 w-full rounded-full text-base shadow-lg shadow-primary/20"
                              >
                                Verify email
                                {isLoading && <Spinner decorative size="md" />}
                              </Button>
                            </SignUp.Action>
                            <SignUp.Action
                              resend
                              disabled={isLoading}
                              fallback={({ resendableAfter }) => (
                                <p className="text-center text-sm text-on-surface-variant">
                                  Resend available in {resendableAfter}s
                                </p>
                              )}
                              className="text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
                            >
                              Resend code
                            </SignUp.Action>
                          </div>
                        </SignUp.Strategy>

                        <SignUp.Strategy name="phone_code">
                          <div className="space-y-6">
                            <ClerkField
                              required
                              name="code"
                              label="Phone code"
                              placeholder="Enter SMS code"
                              type="text"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              disabled={isLoading}
                            />
                            <SignUp.Action submit asChild disabled={isLoading}>
                              <Button
                                type="submit"
                                disabled={isLoading}
                                className="h-12 w-full rounded-full text-base shadow-lg shadow-primary/20"
                              >
                                Verify phone
                                {isLoading && <Spinner decorative size="md" />}
                              </Button>
                            </SignUp.Action>
                          </div>
                        </SignUp.Strategy>
                      </div>
                    )
                  }}
                </Clerk.Loading>
              </SignUp.Step>
            </div>
          )}
        </Clerk.Loading>
      </SignUp.Root>
    </>
  )
}

export default SignUpForm
