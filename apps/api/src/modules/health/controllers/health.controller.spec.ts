import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  type HealthCheckResult,
  type HealthIndicatorFunction,
} from '@nestjs/terminus';
import type { Mock } from 'vitest';
import { HealthController } from './health.controller.js';
import { DatabaseHealthIndicator } from '../indicators/database-health.indicator.js';
import { DependencyUnavailableException } from '../../../common/exceptions/base.exception.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

describe('HealthController', () => {
  let controller: HealthController;
  let health: { check: Mock };
  let db: { pingCheck: Mock };

  const okResult: HealthCheckResult = {
    status: 'ok',
    info: {},
    error: {},
    details: {},
  };

  const failingResult = (
    status: HealthCheckResult['status'],
  ): HealthCheckResult => ({
    status,
    info: {},
    error: { database: { status: 'down', message: 'x' } },
    details: { database: { status: 'down', message: 'x' } },
  });

  const captured = async (
    run: () => Promise<unknown>,
  ): Promise<DependencyUnavailableException> => {
    const error: unknown = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DependencyUnavailableException);
    return error as DependencyUnavailableException;
  };

  beforeEach(async () => {
    health = { check: vi.fn() };
    db = { pingCheck: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: health },
        { provide: DatabaseHealthIndicator, useValue: db },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('live runs a check with no indicators', async () => {
    health.check.mockResolvedValue(okResult);

    await expect(controller.live()).resolves.toBe(okResult);
    expect(health.check).toHaveBeenCalledWith([]);
  });

  it('ready pings the database indicator', async () => {
    health.check.mockResolvedValue(okResult);

    await expect(controller.ready()).resolves.toBe(okResult);

    const [indicators] = health.check.mock.calls[0] as [
      HealthIndicatorFunction[],
    ];
    expect(indicators).toHaveLength(1);
    await indicators[0]();
    expect(db.pingCheck).toHaveBeenCalledWith('database');
  });

  it('maps a failing check to SERVICE_UNAVAILABLE without the Terminus result', async () => {
    health.check.mockRejectedValue(
      new ServiceUnavailableException(failingResult('error')),
    );

    const error = await captured(() => controller.ready());

    expect(error.getStatus()).toBe(503);
    expect(error.message).toBe(ERROR_MESSAGES.EXCEPTION.SERVICE_UNAVAILABLE);
    expect(error.retryAfterSeconds).toBeUndefined();
    expect(error.getErrors()).toEqual([
      {
        errCode: 'serviceUnavailable',
        field: '',
        message: ERROR_MESSAGES.HEALTH.SERVICE_UNAVAILABLE,
        description: ERROR_DESCRIPTIONS.HEALTH.SERVICE_UNAVAILABLE,
      },
    ]);
    expect(JSON.stringify(error.getErrors())).not.toContain('database');
  });

  it.each([
    ['live', () => controller.live()],
    ['ready', () => controller.ready()],
  ])(
    'maps a shutting-down check to SHUTTING_DOWN (%s)',
    async (_route, run) => {
      health.check.mockRejectedValue(
        new ServiceUnavailableException(failingResult('shutting_down')),
      );

      const error = await captured(run);

      expect(error.getStatus()).toBe(503);
      expect(error.getErrors()).toEqual([
        {
          errCode: 'shuttingDown',
          field: '',
          message: ERROR_MESSAGES.HEALTH.SHUTTING_DOWN,
          description: ERROR_DESCRIPTIONS.HEALTH.SHUTTING_DOWN,
        },
      ]);
    },
  );

  it('rethrows any other error unchanged', async () => {
    const boom = new Error('boom');
    health.check.mockRejectedValue(boom);

    await expect(controller.ready()).rejects.toBe(boom);
  });
});
