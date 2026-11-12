import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  HealthCheck,
  HealthCheckService,
  type HealthCheckResult,
  type HealthIndicatorFunction,
} from '@nestjs/terminus';
import { ApiErrorResponse } from '../../../common/decorators/api-response.decorator.js';
import { DependencyUnavailableException } from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import type { ErrorDetailDto } from '../../../common/dto/error.dto.js';
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js';

const NOT_READY: ErrorDetailDto = {
  errCode: ERROR_CODES.SERVICE_UNAVAILABLE,
  field: '',
  message: ERROR_MESSAGES.HEALTH.SERVICE_UNAVAILABLE,
  description: ERROR_DESCRIPTIONS.HEALTH.SERVICE_UNAVAILABLE,
};

const SHUTTING_DOWN: ErrorDetailDto = {
  errCode: ERROR_CODES.SHUTTING_DOWN,
  field: '',
  message: ERROR_MESSAGES.HEALTH.SHUTTING_DOWN,
  description: ERROR_DESCRIPTIONS.HEALTH.SHUTTING_DOWN,
};

const ApiShuttingDownResponse = (): MethodDecorator =>
  ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.HEALTH.SHUTTING_DOWN,
    {
      errCode: ERROR_CODES.SHUTTING_DOWN,
      description: ERROR_DESCRIPTIONS.HEALTH.SHUTTING_DOWN,
    },
  );

// Public probes at the root (HEALTH_ROUTES: no API prefix, no version): no
// guard, never throttled, and excluded from the auth middlewares in AppModule.
// Terminus's own Swagger docs describe its raw body, which the 503 here does
// not return, so they are off.
@ApiTags('health')
@SkipThrottle()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck({ swaggerDocumentation: false, noCache: true })
  @ApiOperation({ summary: 'Liveness probe: checks no dependency' })
  @ApiOkResponse({ description: 'The process answers' })
  @ApiShuttingDownResponse()
  live(): Promise<HealthCheckResult> {
    return this.run([]);
  }

  @Get('ready')
  @HealthCheck({ swaggerDocumentation: false, noCache: true })
  @ApiOperation({ summary: 'Readiness probe: checks the database' })
  @ApiOkResponse({ description: 'The database answers' })
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.HEALTH.SERVICE_UNAVAILABLE,
    {
      errCode: ERROR_CODES.SERVICE_UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.HEALTH.SERVICE_UNAVAILABLE,
    },
  )
  @ApiShuttingDownResponse()
  ready(): Promise<HealthCheckResult> {
    return this.run([() => this.db.pingCheck('database')]);
  }

  // The Terminus result (indicator names and messages) never reaches the body.
  private async run(
    indicators: HealthIndicatorFunction[],
  ): Promise<HealthCheckResult> {
    try {
      return await this.health.check(indicators);
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) {
        throw error;
      }
      const result = error.getResponse() as Partial<HealthCheckResult>;
      throw new DependencyUnavailableException(
        result.status === 'shutting_down' ? SHUTTING_DOWN : NOT_READY,
      );
    }
  }
}
