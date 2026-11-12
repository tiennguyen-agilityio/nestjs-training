import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ResilienceModule } from '@nestjs/resilience';
import { ScheduleModule } from '@nestjs/schedule';

import mikroOrmConfig from './configs/mikro-orm.config.js';
import { validate } from './configs/env.validation.js';
import { rateLimitConfig } from './configs/rate-limit.config.js';
import { ObserveModule, observeConfig } from './configs/observe.config.js';
import { UserModule } from './modules/user/user.module.js';
import { WebhookModule } from './modules/webhook/webhook.module.js';
import { CategoryModule } from './modules/category/category.module.js';
import { ProductModule } from './modules/product/product.module.js';
import { IdempotencyStoreModule } from './modules/idempotency/idempotency.module.js';
import { OutboxStoreModule } from './modules/outbox/outbox.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';
import { createStandardSchemaValidationPipe } from './configs/validation-pipe.config.js';
import { ClerkAuthMiddleware } from './common/middlewares/clerk-auth.middleware.js';
import { UserResolutionMiddleware } from './common/middlewares/user-resolution.middleware.js';
import { AuthProviderModule } from './common/providers/auth-provider.module.js';
import { HEALTH_ROUTES } from './common/constants/env.constant.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate }),
    ResilienceModule.forRoot(),
    // App-wide scheduler for @Interval/@Cron jobs (the idempotency prune job).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: rateLimitConfig,
    }),
    MikroOrmModule.forRoot(mikroOrmConfig),
    IdempotencyStoreModule,
    OutboxStoreModule.forRoot(),
    AuthProviderModule,
    UserModule,
    WebhookModule,
    CategoryModule,
    ProductModule,
    HealthModule,
    ...(process.env.NODE_ENV !== 'production'
      ? [
          ObserveModule.forRootAsync({
            inject: [ConfigService],
            useFactory: observeConfig,
          }),
        ]
      : []),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_PIPE,
      useFactory: createStandardSchemaValidationPipe,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ClerkAuthMiddleware, UserResolutionMiddleware)
      // Health probes are public and must answer even when Clerk or the users table cannot.
      .exclude(
        { path: 'webhooks/clerk', method: RequestMethod.POST },
        ...HEALTH_ROUTES,
      )
      .forRoutes('*');
  }
}
