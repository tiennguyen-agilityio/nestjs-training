import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { ErrorDetailDto } from '../dto/error.dto.js';
import {
  DependencyUnavailableException,
  DomainException,
} from '../exceptions/base.exception.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../constants/message.constant.js';
import { ERROR_CODES } from '../constants/error-code.constant.js';

import type { Mock, MockInstance } from 'vitest';
class TestDomainException extends DomainException {
  constructor(status: HttpStatus, message: string, errors: ErrorDetailDto[]) {
    super(status, message, errors);
  }
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let jsonMock: Mock;
  let statusMock: Mock;
  let setHeaderMock: Mock;
  let host: ArgumentsHost;
  let errorSpy: MockInstance;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = vi.fn();
    errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusMock, setHeader: setHeaderMock }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('preserves status, message and full structured errors for a DomainException', () => {
    const exception = new TestDomainException(
      HttpStatus.NOT_FOUND,
      'Category not found',
      [
        {
          errCode: 'CATEGORY_NOT_FOUND',
          field: 'id',
          message: 'Category not found',
          description: 'No category exists with the given id',
        },
      ],
    );

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Category not found',
      errors: [
        {
          errCode: 'CATEGORY_NOT_FOUND',
          field: 'id',
          message: 'Category not found',
          description: 'No category exists with the given id',
        },
      ],
    });
  });

  it('maps a built-in HttpException to a default status-based message and a single generic error entry', () => {
    const exception = new NotFoundException('User not found');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGES.EXCEPTION.ITEM_NOT_FOUND,
      errors: [
        {
          errCode: ERROR_CODES.ITEM_NOT_FOUND,
          field: '',
          message: 'User not found',
          description: 'User not found',
        },
      ],
    });
  });

  it('uses the errorCode carried by a built-in HttpException as errors[0].errCode', () => {
    const exception = new NotFoundException('User not found', {
      errorCode: 'CUSTOM_USER_NOT_FOUND',
    });

    filter.catch(exception, host);

    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: ERROR_MESSAGES.EXCEPTION.ITEM_NOT_FOUND,
      errors: [
        {
          errCode: 'CUSTOM_USER_NOT_FOUND',
          field: '',
          message: 'User not found',
          description: 'User not found',
        },
      ],
    });
  });

  it('returns 500 with a system error entry for a non-HttpException, without leaking internals', () => {
    const exception = new Error('secret db connection string exposed');

    filter.catch(exception, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.EXCEPTION.SYSTEM_ERROR,
      errors: [
        {
          errCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
          field: '',
          message: ERROR_MESSAGES.EXCEPTION.INTERNAL_ERROR,
          description: ERROR_MESSAGES.EXCEPTION.INTERNAL_ERROR,
        },
      ],
    });
    const [body] = jsonMock.mock.calls[0] as [Record<string, unknown>];
    expect(JSON.stringify(body)).not.toContain(
      'secret db connection string exposed',
    );
  });

  it('logs the original error message and stack for a non-HttpException', () => {
    const exception = new Error('boom');

    filter.catch(exception, host);

    expect(errorSpy).toHaveBeenCalledWith('boom', exception.stack);
  });

  describe('Retry-After', () => {
    const unavailableError = {
      errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
      field: '',
      message: ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
    };

    it('sets Retry-After from a DependencyUnavailableException retry hint', () => {
      filter.catch(
        new DependencyUnavailableException(unavailableError, 30),
        host,
      );

      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', '30');
      expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: ERROR_MESSAGES.EXCEPTION.SERVICE_UNAVAILABLE,
        errors: [unavailableError],
      });
    });

    it('does not set Retry-After when the exception has no retry hint', () => {
      filter.catch(new DependencyUnavailableException(unavailableError), host);

      expect(setHeaderMock).not.toHaveBeenCalled();
    });
  });
});
