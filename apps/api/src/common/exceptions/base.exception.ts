import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorDetailDto } from '../dto/error.dto.js';
import { ERROR_MESSAGES } from '../constants/message.constant.js';

export abstract class DomainException extends HttpException {
  private readonly errors: ErrorDetailDto[];

  protected constructor(
    status: number,
    message: string,
    errors: ErrorDetailDto[],
  ) {
    super(message, status);
    this.errors = errors;
  }

  getErrors(): ErrorDetailDto[] {
    return this.errors;
  }
}

export abstract class SingleErrorDomainException extends DomainException {
  protected constructor(
    status: HttpStatus,
    topLevelMessage: string,
    error: ErrorDetailDto,
  ) {
    super(status, topLevelMessage, [error]);
  }
}

export class ValidationException extends DomainException {
  constructor(errors: ErrorDetailDto[]) {
    super(
      HttpStatus.BAD_REQUEST,
      ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
      errors,
    );
  }
}

export class InvalidRequestException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(HttpStatus.BAD_REQUEST, ERROR_MESSAGES.EXCEPTION.BAD_REQUEST, error);
  }
}

export class ItemNotFoundException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(HttpStatus.NOT_FOUND, ERROR_MESSAGES.EXCEPTION.ITEM_NOT_FOUND, error);
  }
}

export class DuplicateResourceException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(HttpStatus.CONFLICT, ERROR_MESSAGES.EXCEPTION.CONFLICT, error);
  }
}

export class ResourceInUseException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(HttpStatus.CONFLICT, ERROR_MESSAGES.EXCEPTION.CONFLICT, error);
  }
}

export class InvalidStateException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(HttpStatus.CONFLICT, ERROR_MESSAGES.EXCEPTION.CONFLICT, error);
  }
}

export class DependencyTimeoutException extends SingleErrorDomainException {
  constructor(error: ErrorDetailDto) {
    super(
      HttpStatus.GATEWAY_TIMEOUT,
      ERROR_MESSAGES.EXCEPTION.GATEWAY_TIMEOUT,
      error,
    );
  }
}

export class DependencyUnavailableException extends SingleErrorDomainException {
  constructor(
    error: ErrorDetailDto,
    readonly retryAfterSeconds?: number,
  ) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      ERROR_MESSAGES.EXCEPTION.SERVICE_UNAVAILABLE,
      error,
    );
  }
}
