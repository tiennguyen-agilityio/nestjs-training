import { ConfigService } from '@nestjs/config';
import type { TerminusAsyncModuleOptions } from '@nestjs/terminus';
import { DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS } from '../common/constants/env.constant.js';

export function terminusConfig(
  configService: ConfigService,
): TerminusAsyncModuleOptions {
  return {
    // `??`, not `||`: 0 is a valid value that disables the wait after SIGTERM.
    gracefulShutdownTimeoutMs:
      configService.get<number>('GRACEFUL_SHUTDOWN_TIMEOUT_MS') ??
      DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS,
  };
}
