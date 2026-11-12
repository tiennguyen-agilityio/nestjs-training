import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { RequestMethod, VersioningType } from '@nestjs/common';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import {
  DEFAULT_PORT,
  DEFAULT_API_VERSION,
  API_PREFIX,
  ROUTE_CONFLICT_POLICY,
  HEALTH_ROUTES,
} from './common/constants/env.constant.js';
import { corsConfig } from './configs/cors.config.js';
import { setupSwagger } from './configs/swagger.config.js';
import { ObserveInstrument } from './configs/observe.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    routeConflictPolicy: ROUTE_CONFLICT_POLICY,
    ...(process.env.NODE_ENV !== 'production'
      ? { instrument: ObserveInstrument }
      : {}),
  });
  const configService = app.get(ConfigService);

  app.enableShutdownHooks(undefined, { useProcessExit: true });
  app.use(helmet());
  app.enableCors(corsConfig(configService));
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'webhooks/clerk', method: RequestMethod.POST },
      ...HEALTH_ROUTES,
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
  setupSwagger(app);

  await app.listen(process.env.PORT ?? DEFAULT_PORT);
}
await bootstrap();
