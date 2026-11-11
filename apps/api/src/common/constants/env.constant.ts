import type { RouteConflictPolicy } from '@nestjs/common';

export const DEFAULT_PORT = 3000;
export const DEFAULT_DB_PORT = 5432;
export const DEFAULT_CLERK_SYNC_TIMEOUT_MS = 5000;
export const DEFAULT_API_VERSION = '1';
export const API_PREFIX = 'api';
export const ROUTE_CONFLICT_POLICY: RouteConflictPolicy = {
  duplicate: 'error',
  shadow: 'warn',
};
export const OBSERVE_SERVICE_ID = 'coffee-shop-api';
