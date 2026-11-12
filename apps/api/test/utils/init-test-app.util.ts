import {
  INestApplication,
  NestApplicationOptions,
  RequestMethod,
  VersioningType,
} from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import type { App } from 'supertest/types';
import {
  API_PREFIX,
  DEFAULT_API_VERSION,
  ROUTE_CONFLICT_POLICY,
  HEALTH_ROUTES,
} from './../../src/common/constants/env.constant.js';

/**
 * Mirrors main.ts's bootstrap (global prefix and its exclusions + URI versioning + route conflict
 * policy) so e2e tests hit the app the same way production does, without
 * repeating it per spec.
 */
export async function initTestApp<
  T extends INestApplication = INestApplication<App>,
>(moduleFixture: TestingModule, options?: NestApplicationOptions): Promise<T> {
  const app = moduleFixture.createNestApplication<T>({
    routeConflictPolicy: ROUTE_CONFLICT_POLICY,
    ...options,
  });
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
  await app.init();
  return app;
}
