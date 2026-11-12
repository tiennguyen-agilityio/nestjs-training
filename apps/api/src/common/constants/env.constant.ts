import { RequestMethod, type RouteConflictPolicy } from '@nestjs/common';

export const DEFAULT_PORT = 3000;
export const DEFAULT_DB_PORT = 5432;
export const DEFAULT_CLERK_SYNC_TIMEOUT_MS = 5000;
export const DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000;
export const DEFAULT_API_VERSION = '1';
export const API_PREFIX = 'api';
export const ROUTE_CONFLICT_POLICY: RouteConflictPolicy = {
  duplicate: 'error',
  shadow: 'warn',
};
export const OBSERVE_SERVICE_ID = 'coffee-shop-api';

// Health probes sit at the root, outside the API prefix and versions, so their
// path never moves with the API (the controller is VERSION_NEUTRAL). HEAD is
// listed too: Express answers it with the GET handler, and the auth middlewares
// must skip it as well.
export const HEALTH_ROUTES = ['health/live', 'health/ready'].flatMap((path) => [
  { path, method: RequestMethod.GET },
  { path, method: RequestMethod.HEAD },
]);
