import type { ConfigService } from '@nestjs/config';
import { terminusConfig } from './terminus.config.js';

describe('terminusConfig', () => {
  const configWith = (value: unknown) => {
    const get = vi.fn().mockReturnValue(value);
    return { configService: { get } as unknown as ConfigService, get };
  };

  it('terminusConfig uses GRACEFUL_SHUTDOWN_TIMEOUT_MS', () => {
    const { configService, get } = configWith(8000);

    expect(terminusConfig(configService)).toEqual({
      gracefulShutdownTimeoutMs: 8000,
    });
    expect(get).toHaveBeenCalledWith('GRACEFUL_SHUTDOWN_TIMEOUT_MS');
  });

  it('terminusConfig defaults to 5000 ms when unset', () => {
    const { configService } = configWith(undefined);

    expect(terminusConfig(configService).gracefulShutdownTimeoutMs).toBe(5000);
  });

  it('terminusConfig keeps 0 to disable the wait', () => {
    const { configService } = configWith(0);

    expect(terminusConfig(configService).gracefulShutdownTimeoutMs).toBe(0);
  });
});
