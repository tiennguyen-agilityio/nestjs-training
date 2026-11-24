import type { Metadata } from 'next'
import { Abel, Plus_Jakarta_Sans } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ROUTES } from '@/constants/routes'
import { AuthTokenBridge } from '@/providers/AuthTokenBridge'
import { CartMergeBridge } from '@/providers/CartMergeBridge'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'

import './globals.css'

const fontBody = Plus_Jakarta_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
})

const fontHeading = Abel({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['400'],
})

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Public storefront and admin dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${fontBody.variable} ${fontHeading.variable} antialiased`}
      >
        <ClerkProvider signInUrl={ROUTES.SIGN_IN} signUpUrl={ROUTES.SIGN_UP}>
          <AuthTokenBridge />
          <QueryProvider>
            <CartMergeBridge />
            <ThemeProvider>
              <TooltipProvider delay={0}>
                {children}
                <Toaster />
              </TooltipProvider>
            </ThemeProvider>
          </QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
