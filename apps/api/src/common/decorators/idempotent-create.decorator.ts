import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import { Idempotent } from '@nestjs/idempotency';
import { ApiErrorResponse } from './api-response.decorator.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../constants/message.constant.js';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Makes a create route idempotent on the required `Idempotency-Key` header
 * (`IdempotencyModule` options in `IdempotencyStoreModule`), with its docs.
 * The key's 400 and 409 are described on the header, not as responses: a
 * response entry for those statuses would replace the route's own 400
 * (validation) and 409 (name exists) examples.
 */
export const IdempotentCreate = (): MethodDecorator =>
  applyDecorators(
    Idempotent(),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description: ERROR_DESCRIPTIONS.IDEMPOTENCY.HEADER,
    }),
    ApiErrorResponse(
      HttpStatus.UNPROCESSABLE_ENTITY,
      ERROR_MESSAGES.IDEMPOTENCY.KEY_REUSED,
      { description: ERROR_MESSAGES.IDEMPOTENCY.KEY_REUSED },
    ),
  );
