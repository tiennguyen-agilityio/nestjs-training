import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Payment } from '../order/entities/payment.entity.js';
import { OrderModule } from '../order/order.module.js';
import { PaymentRepository } from './repositories/payment.repository.js';
import { PaymentService } from './services/payment.service.js';
import { PaymentController } from './controllers/payment.controller.js';
import { PaymentGateways } from './gateways/payment-gateways.js';
import { StripePaymentGateway } from './gateways/stripe-payment.gateway.js';
import { stripeClientProvider } from './gateways/stripe-client.provider.js';
import { PaymentCheckoutExpireHandler } from './handlers/payment-checkout-expire.handler.js';
import { PayPalHttpClient } from './gateways/paypal-http.client.js';
import { PayPalPaymentGateway } from './gateways/paypal-payment.gateway.js';

@Module({
  imports: [MikroOrmModule.forFeature([Payment]), OrderModule],
  providers: [
    PaymentService,
    PaymentRepository,
    PaymentGateways,
    StripePaymentGateway,
    stripeClientProvider,
    PaymentCheckoutExpireHandler,
    PayPalHttpClient,
    PayPalPaymentGateway,
  ],
  controllers: [PaymentController],
  exports: [PaymentService],
})
export class PaymentModule {}
