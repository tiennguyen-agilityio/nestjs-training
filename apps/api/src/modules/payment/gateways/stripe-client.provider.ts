import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export const stripeClientProvider: FactoryProvider<Stripe> = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService) =>
    new Stripe(config.getOrThrow<string>('STRIPE_SECRET_KEY')),
};
