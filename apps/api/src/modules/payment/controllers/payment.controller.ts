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
import { ResponsePaymentCaptureDto } from '../dto/response-payment-capture.dto.js';
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
      "Opens a Stripe Checkout Session for a CARD order, or a PayPal order for a PAYPAL order, and returns its id and URL; calling it again while that checkout is open returns the same one. A FAILED payment whose checkout ended unpaid gets a new checkout on the same payment record (a retry), ending at the order's deadline.",
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

  @Post(':id/payments/capture')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Capture the PayPal payment of one of my orders',
    description:
      'Captures the PayPal order the shopper approved on the PayPal page and records the result: PAID confirms the order, FAILED keeps it pending (retryable tells whether PayPal lets the shopper approve again), PENDING waits for the webhook.',
  })
  @ApiDataResponse(HttpStatus.OK, ResponsePaymentCaptureDto)
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
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.PAYMENT.CAPTURE_UNSUPPORTED,
    {
      errCode: ERROR_CODES.PAYMENT.CAPTURE_UNSUPPORTED,
      field: 'paymentMethod',
      description: ERROR_DESCRIPTIONS.PAYMENT.CAPTURE_UNSUPPORTED,
    },
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.PAYMENT.METHOD_UNAVAILABLE,
    {
      errCode: ERROR_CODES.PAYMENT.METHOD_UNAVAILABLE,
      field: 'paymentMethod',
      description: ERROR_DESCRIPTIONS.PAYMENT.METHOD_UNAVAILABLE,
    },
  )
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.PAYMENT.GATEWAY_REJECTED,
    {
      errCode: ERROR_CODES.PAYMENT.GATEWAY_REJECTED,
      field: 'payment',
      description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_REJECTED,
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
  @ApiErrorResponse(HttpStatus.CONFLICT, ERROR_MESSAGES.PAYMENT.ORDER_EXPIRED, {
    errCode: ERROR_CODES.PAYMENT.ORDER_EXPIRED,
    field: 'id',
    description: ERROR_DESCRIPTIONS.PAYMENT.ORDER_EXPIRED,
  })
  @ApiErrorResponse(
    HttpStatus.SERVICE_UNAVAILABLE,
    ERROR_MESSAGES.PAYMENT.GATEWAY_UNAVAILABLE,
    {
      errCode: ERROR_CODES.PAYMENT.GATEWAY_UNAVAILABLE,
      description: ERROR_DESCRIPTIONS.PAYMENT.GATEWAY_UNAVAILABLE,
    },
  )
  capture(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponsePaymentCaptureDto> {
    return this.paymentService.capture(user.id, id);
  }
}
