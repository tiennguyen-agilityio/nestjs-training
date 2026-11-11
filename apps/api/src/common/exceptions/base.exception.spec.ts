import { HttpStatus } from '@nestjs/common';
import {
  DomainException,
  ValidationException,
  InvalidRequestException,
  ItemNotFoundException,
  DuplicateResourceException,
  InvalidStateException,
  DependencyTimeoutException,
  DependencyUnavailableException,
} from './base.exception.js';
import { ErrorDetailDto } from '../dto/error.dto.js';
import {
  ERROR_MESSAGES,
  ERROR_DESCRIPTIONS,
} from '../constants/message.constant.js';
import { ERROR_CODES } from '../constants/error-code.constant.js';

class TestDomainException extends DomainException {
  constructor(status: number, message: string, errors: ErrorDetailDto[]) {
    super(status, message, errors);
  }
}

describe('DomainException', () => {
  it('exposes the status and message via HttpException accessors', () => {
    const errors: ErrorDetailDto[] = [
      {
        errCode: 'TEST_ERROR',
        field: 'name',
        message: 'Name is invalid',
        description: 'The name field failed validation',
      },
    ];

    const exception = new TestDomainException(
      HttpStatus.BAD_REQUEST,
      'Invalid request',
      errors,
    );

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.message).toBe('Invalid request');
  });

  it('exposes all structured error entries in order via getErrors()', () => {
    const errors: ErrorDetailDto[] = [
      {
        errCode: 'ERR_1',
        field: 'name',
        message: 'Name is invalid',
        description: 'desc 1',
      },
      {
        errCode: 'ERR_2',
        field: 'email',
        message: 'Email is invalid',
        description: 'desc 2',
      },
    ];

    const exception = new TestDomainException(
      HttpStatus.BAD_REQUEST,
      'Invalid request',
      errors,
    );

    expect(exception.getErrors()).toEqual(errors);
  });
});

describe('ValidationException', () => {
  it('resolves to 400 with a fixed top-level message and the given structured errors', () => {
    const errors = [
      {
        errCode: ERROR_CODES.VALIDATION.IS_STRING,
        field: 'name',
        message: 'name must be a string',
        description: 'name must be a string',
      },
    ];

    const exception = new ValidationException(errors);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED);
    expect(exception.getErrors()).toEqual(errors);
  });
});

describe('InvalidRequestException', () => {
  it('resolves to 400 with a generic top-level message and the given structured error', () => {
    const error = {
      errCode: ERROR_CODES.INVALID_REQUEST,
      field: 'username',
      message: 'User name cannot be blank',
      description: 'Please enter your name',
    };

    const exception = new InvalidRequestException(error);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.BAD_REQUEST);
    expect(exception.getErrors()).toEqual([error]);
  });
});

describe('ItemNotFoundException', () => {
  it('resolves to 404 with a generic top-level message and the given structured error', () => {
    const error = {
      errCode: ERROR_CODES.ITEM_NOT_FOUND,
      field: 'id',
      message: 'Resource not found with the provided ID',
      description:
        'The category might have been deleted, or the link is broken.',
    };

    const exception = new ItemNotFoundException(error);

    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.ITEM_NOT_FOUND);
    expect(exception.getErrors()).toEqual([error]);
  });
});

describe('DuplicateResourceException', () => {
  it('resolves to 409 with a generic top-level message and the given structured error', () => {
    const error = {
      errCode: ERROR_CODES.CATEGORY.NAME_EXISTS,
      field: 'name',
      message: ERROR_MESSAGES.CATEGORY.NAME_EXISTS,
      description: ERROR_DESCRIPTIONS.CATEGORY.NAME_EXISTS,
    };

    const exception = new DuplicateResourceException(error);

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.CONFLICT);
    expect(exception.getErrors()).toEqual([error]);
  });
});

describe('InvalidStateException', () => {
  it('InvalidStateException responds 409 with the CONFLICT message and the given error', () => {
    const error = {
      errCode: ERROR_CODES.CATEGORY.NOT_DELETED,
      field: 'id',
      message: ERROR_MESSAGES.CATEGORY.NOT_DELETED,
      description: ERROR_DESCRIPTIONS.CATEGORY.NOT_DELETED,
    };
    const exception = new InvalidStateException(error);

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.CONFLICT);
    expect(exception.getErrors()).toEqual([error]);
  });
});

describe('dependency exceptions', () => {
  const timeoutError: ErrorDetailDto = {
    errCode: ERROR_CODES.AUTH_PROVIDER.TIMEOUT,
    field: '',
    message: ERROR_MESSAGES.AUTH_PROVIDER.TIMEOUT,
    description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.TIMEOUT,
  };
  const unavailableError: ErrorDetailDto = {
    errCode: ERROR_CODES.AUTH_PROVIDER.UNAVAILABLE,
    field: '',
    message: ERROR_MESSAGES.AUTH_PROVIDER.UNAVAILABLE,
    description: ERROR_DESCRIPTIONS.AUTH_PROVIDER.UNAVAILABLE,
  };

  it('DependencyTimeoutException answers 504 with its single error', () => {
    const exception = new DependencyTimeoutException(timeoutError);

    expect(exception.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(exception.message).toBe(ERROR_MESSAGES.EXCEPTION.GATEWAY_TIMEOUT);
    expect(exception.getErrors()).toEqual([timeoutError]);
  });

  it('DependencyUnavailableException answers 503 and keeps its retry hint', () => {
    const exception = new DependencyUnavailableException(unavailableError, 30);

    expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception.message).toBe(
      ERROR_MESSAGES.EXCEPTION.SERVICE_UNAVAILABLE,
    );
    expect(exception.getErrors()).toEqual([unavailableError]);
    expect(exception.retryAfterSeconds).toBe(30);
  });
});
