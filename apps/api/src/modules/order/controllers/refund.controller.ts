import { Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from '../services/order.service.js';
import { ResponsePaymentDto } from '../dto/response-order.dto.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import {
  ApiDataResponse,
  ApiErrorResponse,
} from '../../../common/decorators/api-response.decorator.js';
import {
  idParamSchema,
  type IdParam,
} from '../../../common/dto/id-param.schema.js';
import { User } from '../../user/entities/user.entity.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

@ApiTags('payments')
@Controller('payments')
export class RefundController {
  constructor(private readonly orderService: OrderService) {}

  @Post(':id/retry')
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({
    summary: 'Retry a FAILED refund (admin)',
    description:
      'Only a FAILED refund of a CANCELLED order that was not retried yet, while no other refund of the order is PENDING or PAID; anything else returns 409. Adds a new PENDING REFUND with the same amount and reason and queues it at the provider through the outbox; the FAILED row stays as history (marked retried). The amount may not exceed the PAID charge.',
  })
  @ApiDataResponse(HttpStatus.CREATED, ResponsePaymentDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.PAYMENT.NOT_FOUND, {
    errCode: ERROR_CODES.PAYMENT.NOT_FOUND,
    field: 'id',
    description: ERROR_DESCRIPTIONS.PAYMENT.NOT_FOUND,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.REFUND_NOT_RETRYABLE,
    {
      errCode: ERROR_CODES.ORDER.REFUND_NOT_RETRYABLE,
      field: 'id',
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_NOT_RETRYABLE,
    },
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.REFUND_EXCEEDS_PAID,
    {
      errCode: ERROR_CODES.ORDER.REFUND_EXCEEDS_PAID,
      field: 'amount',
      description: ERROR_DESCRIPTIONS.ORDER.REFUND_EXCEEDS_PAID('12.50'),
    },
  )
  @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_MESSAGES.ORDER.NOT_REFUNDABLE, {
    errCode: ERROR_CODES.ORDER.NOT_REFUNDABLE,
    field: 'amount',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_REFUNDABLE,
  })
  retry(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponsePaymentDto> {
    return this.orderService.retryRefund(id, user.id);
  }
}
