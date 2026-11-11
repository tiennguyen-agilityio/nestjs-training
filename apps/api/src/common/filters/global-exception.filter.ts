import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorResponseDto } from '../dto/error.dto.js';
import {
  DependencyUnavailableException,
  DomainException,
} from '../exceptions/base.exception.js';
import { ERROR_MESSAGES } from '../constants/message.constant.js';
import { ERROR_CODES } from '../constants/error-code.constant.js';

export const DEFAULT_MESSAGE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_MESSAGES.EXCEPTION.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_MESSAGES.EXCEPTION.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ERROR_MESSAGES.EXCEPTION.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_MESSAGES.EXCEPTION.ITEM_NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_MESSAGES.EXCEPTION.CONFLICT,
};

export const DEFAULT_ERR_CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: ERROR_CODES.INVALID_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ERROR_CODES.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ERROR_CODES.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ERROR_CODES.ITEM_NOT_FOUND,
  [HttpStatus.CONFLICT]: ERROR_CODES.DUPLICATE_RESOURCE,
};

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toErrorResponseBody(exception);

    if (
      exception instanceof DependencyUnavailableException &&
      exception.retryAfterSeconds !== undefined
    ) {
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorResponseBody(exception: unknown): ErrorResponseDto {
    if (exception instanceof DomainException) {
      return {
        statusCode: exception.getStatus(),
        message: exception.message,
        errors: exception.getErrors(),
      };
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const detailMessage = exception.message;

      return {
        statusCode,
        message: DEFAULT_MESSAGE_BY_STATUS[statusCode] ?? detailMessage,
        errors: [
          {
            errCode:
              exception.errorCode ??
              DEFAULT_ERR_CODE_BY_STATUS[statusCode] ??
              ERROR_CODES.UNKNOWN_ERROR,
            field: '',
            message: detailMessage,
            description: detailMessage,
          },
        ],
      };
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    );

    const internalErrorMessage = ERROR_MESSAGES.EXCEPTION.INTERNAL_ERROR;

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.EXCEPTION.SYSTEM_ERROR,
      errors: [
        {
          errCode: ERROR_CODES.INTERNAL_SERVER_ERROR,
          field: '',
          message: internalErrorMessage,
          description: internalErrorMessage,
        },
      ],
    };
  }
}
