'use client'

import { useCallback, useState, type MouseEvent } from 'react'
import * as SignIn from '@clerk/elements/sign-in'
import * as Clerk from '@clerk/elements/common'
import Image from 'next/image'
import { Lock, Mail } from 'lucide-react'

import { useCleanClerkUrl } from '@/hooks/useCleanClerkUrl'
import { parseSignInCredentialsForm } from '@/schemas/user'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import Loading from '@/components/Loading'
import { Spinner } from '@/components/ui/spinner'

import SocialButtons from '../SocialButtons'
import ClerkField from '../ClerkField'

interface ClientFieldErrors {
  identifier?: string
  password?: string
}

const SignInForm = () => {
  useCleanClerkUrl()
  const [clientErrors, setClientErrors] = useState<ClientFieldErrors>({})

  const handleSignInClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const form = event.currentTarget.closest('form')
      if (!form) {
        return
      }

      const parsed = parseSignInCredentialsForm(new FormData(form))
      if (!parsed.success) {
        const fieldErrors = parsed.error.flatten().fieldErrors
        setClientErrors({
          identifier: fieldErrors.identifier?.[0],
          password: fieldErrors.password?.[0],
        })
        event.preventDefault()
        return
      }

      setClientErrors({})
    },
    [],
  )

  return (
    <>
      <SignIn.Root
        fallback={<Loading fullScreen size="lg" label="Loading sign in form" />}
      >
        <SignIn.Step name="sso-callback">
          <Loading fullScreen size="lg" label="Completing sign in" />
        </SignIn.Step>
        <Clerk.Loading scope="global">
          {(isGlobalLoading) => (
            <div className="mx-auto w-full max-w-[1440px] h-full overflow-hidden rounded-3xl text-sm shadow-[0_0_15px_5px_rgba(0,0,0,0.1)]">
              <SignIn.Step
                name="start"
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
                              Welcome Back
                            </h1>
                            <p className="text-base text-on-surface-variant">
                              Continue your sensory journey with CoffeeHub.
                            </p>
                          </div>

                          <Clerk.GlobalError className="block rounded-xs border border-error/30 bg-error-container px-4 py-3 text-sm text-on-error-container" />

                          <SocialButtons disabled={isLoading} />

                          <Separator
                            text="OR CONTINUE WITH"
                            className="[&>span]:bg-surface [&>span]:px-4 [&>span]:text-[0.7rem] [&>span]:font-semibold [&>span]:tracking-[0.2em] **:data-[slot=separator]:bg-outline-variant/30"
                          />

                          <div className="space-y-6">
                            <ClerkField
                              required
                              name="identifier"
                              label="Email Address"
                              placeholder="example@gmail.com"
                              type="email"
                              icon={<Mail className="size-4" aria-hidden />}
                              disabled={isLoading}
                              clientError={clientErrors.identifier}
                              onChange={() =>
                                setClientErrors((prev) => ({
                                  ...prev,
                                  identifier: undefined,
                                }))
                              }
                            />

                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-4 px-1">
                                <span className="text-sm font-semibold text-on-surface-variant">
                                  Password
                                </span>
                                <button
                                  type="button"
                                  disabled
                                  className="text-xs font-semibold text-primary opacity-50 pointer-events-none"
                                >
                                  Forgot Password?
                                </button>
                              </div>
                              <ClerkField
                                required
                                name="password"
                                label=""
                                placeholder="Enter your password"
                                type="password"
                                icon={<Lock className="size-4" aria-hidden />}
                                disabled={isLoading}
                                clientError={clientErrors.password}
                                onChange={() =>
                                  setClientErrors((prev) => ({
                                    ...prev,
                                    password: undefined,
                                  }))
                                }
                              />
                            </div>

                            <Checkbox
                              defaultChecked
                              disabled
                              label="Keep me signed in"
                              wrapperClassName="gap-3 px-1"
                              className="size-5 border data-unchecked:border-outline-variant data-unchecked:bg-surface-container-low"
                              labelClassName="text-sm font-medium text-on-surface-variant"
                            />

                            <SignIn.Action submit asChild disabled={isLoading}>
                              <Button
                                type="submit"
                                className="h-14 rounded-full text-base shadow-lg shadow-primary/20 transition-transform duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                onClick={handleSignInClick}
                              >
                                Sign In
                                {isSubmitting && (
                                  <Spinner decorative size="md" />
                                )}
                              </Button>
                            </SignIn.Action>
                          </div>

                          <p className="pt-2 text-center text-base font-medium text-on-surface-variant">
                            New to CoffeeHub?{' '}
                            <Clerk.Link
                              navigate="sign-up"
                              aria-disabled={isLoading}
                              tabIndex={isLoading ? -1 : undefined}
                              onClick={(event) => {
                                if (isLoading) event.preventDefault()
                              }}
                              className="ml-1 font-bold text-primary underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-50"
                            >
                              Create an account
                            </Clerk.Link>
                          </p>
                        </div>
                      </div>
                    )
                  }}
                </Clerk.Loading>
              </SignIn.Step>
            </div>
          )}
        </Clerk.Loading>
      </SignIn.Root>
    </>
  )
}

export default SignInForm
