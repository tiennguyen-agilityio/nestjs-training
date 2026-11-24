import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentService } from '../services/payment.service.js';
import { ResponsePaymentCheckoutDto } from '../dto/response-payment-checkout.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
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
@Controller('orders')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':id/payments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start the online payment of one of my orders',
    description:
      'Opens a Stripe Checkout Session for a CARD order and returns its URL; calling it again while that session is open returns the same URL.',
  })
  @ApiDataResponse(HttpStatus.OK, ResponsePaymentCheckoutDto)
  @ApiErrorResponse(
    HttpStatus.UNAUTHORIZED,
    ERROR_MESSAGES.AUTH.UNAUTHENTICATED,
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.PAYMENT.METHOD_NOT_ONLINE,
    {
      errCode: ERROR_CODES.PAYMENT.METHOD_NOT_ONLINE,
      field: 'paymentMethod',
      description: ERROR_DESCRIPTIONS.PAYMENT.METHOD_NOT_ONLINE,
    },
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
    errCode: ERROR_CODES.ORDER.NOT_FOUND,
    field: 'id',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
  })
  @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_MESSAGES.PAYMENT.NOT_PAYABLE, {
    errCode: ERROR_CODES.PAYMENT.NOT_PAYABLE,
    field: 'id',
    description: ERROR_DESCRIPTIONS.PAYMENT.NOT_PAYABLE,
  })
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.PAYMENT.GATEWAY_UNAVAILABLE,
    {
      errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_UNAVAILABLE,
    },
  )
  start(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponsePaymentCheckoutDto> {
    return this.paymentService.start(user.id, id);
  }
}
