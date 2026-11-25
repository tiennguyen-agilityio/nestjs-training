import {
  applyDecorators,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from '../services/order.service.js';
import {
  createRefundSchema,
  orderParamSchema,
  orderQuerySchema,
  placeOrderSchema,
  updateOrderShippingStatusSchema,
  updateOrderStatusSchema,
  type CreateRefundInput,
  type OrderParam,
  type OrderQueryInput,
  type PlaceOrderInput,
  type UpdateOrderShippingStatusInput,
  type UpdateOrderStatusInput,
} from '../dto/order.schema.js';
import {
  ResponseOrderDto,
  ResponsePaymentDto,
} from '../dto/response-order.dto.js';
import { ResponseOrderRowDto } from '../dto/response-order-row.dto.js';
import { ResponseOrderDetailDto } from '../dto/response-order-detail.dto.js';
import { isActiveAdmin } from '../../../common/utils/user.util.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import { AdminOnly } from '../../../common/decorators/admin-only.decorator.js';
import {
  ApiDataResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../../../common/decorators/api-response.decorator.js';
import { User } from '../../user/entities/user.entity.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const OUT_OF_STOCK_EXAMPLE = { available: 1, sku: 'COL-HUI-250G' };

/** 401, and one 403 naming both causes (a second 403 entry would replace the first). */
const ApiListAuthErrors = (): MethodDecorator =>
  applyDecorators(
    ApiErrorResponse(
      HttpStatus.UNAUTHORIZED,
      ERROR_MESSAGES.AUTH.UNAUTHENTICATED,
    ),
    ApiErrorResponse(HttpStatus.FORBIDDEN, ERROR_MESSAGES.AUTH.FORBIDDEN, {
      description: `${ERROR_MESSAGES.AUTH.INACTIVE_ACCOUNT}, or \`all=true\` from a caller who is not an active admin.`,
    }),
  );

/** 400, 404 and the refused move's 409 of an admin status change. */
const ApiStatusChangeErrors = (
  field: 'status' | 'shippingStatus',
  refusedExample: string,
): MethodDecorator =>
  applyDecorators(
    ApiErrorResponse(
      HttpStatus.BAD_REQUEST,
      ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
    ),
    ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
      errCode: ERROR_CODES.ORDER.NOT_FOUND,
      field: 'idOrOrderNumber',
      description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
    }),
    ApiErrorResponse(HttpStatus.CONFLICT, refusedExample, {
      errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
      field,
      description: ERROR_DESCRIPTIONS.ORDER.STATUS_NOT_ALLOWED,
    }),
  );

const ApiOrderRuleErrors = (
  field: 'status' | 'shippingStatus',
  refusals: [string, string][],
): MethodDecorator =>
  applyDecorators(
    ...refusals.map(([message, description]) =>
      ApiErrorResponse(HttpStatus.CONFLICT, message, {
        errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
        field,
        description,
      }),
    ),
  );

const ApiAuthErrors = (): MethodDecorator =>
  applyDecorators(
    ApiErrorResponse(
      HttpStatus.UNAUTHORIZED,
      ERROR_MESSAGES.AUTH.UNAUTHENTICATED,
    ),
    ApiErrorResponse(
      HttpStatus.FORBIDDEN,
      ERROR_MESSAGES.AUTH.INACTIVE_ACCOUNT,
    ),
  );

@ApiTags('orders')
@Controller('orders')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiListAuthErrors()
  @ApiOperation({
    summary: "List the signed-in user's orders, or every order for an admin",
    description:
      'Without `all`, every role sees only its own orders. `all=true` lists every order for an active admin (403 for anyone else). `search` matches every word, accents ignored, against the order number, recipient and customer name or email. Newest first by default.',
  })
  @ApiPaginatedResponse(ResponseOrderRowDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  list(
    @AuthUser() user: User,
    @Query({ schema: orderQuerySchema }) query: OrderQueryInput,
  ): Promise<PaginatedResult<ResponseOrderRowDto>> {
    if (!query.all) return this.orderService.findMine(user.id, query);
    if (!isActiveAdmin(user)) {
      throw new ForbiddenException(ERROR_MESSAGES.AUTH.FORBIDDEN);
    }

    return this.orderService.findAll(query);
  }

  @Get(':idOrOrderNumber')
  @ApiAuthErrors()
  @ApiOperation({
    summary: 'Get one order by id or order number, with its customer',
    description:
      "A UUID looks up by id, anything else by orderNumber. An active admin reads any order; anyone else only their own (another user's order returns 404).",
  })
  @ApiDataResponse(HttpStatus.OK, ResponseOrderDetailDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
    errCode: ERROR_CODES.ORDER.NOT_FOUND,
    field: 'idOrOrderNumber',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
  })
  findOne(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
  ): Promise<ResponseOrderDetailDto> {
    return isActiveAdmin(user)
      ? this.orderService.findAnyOne(idOrOrderNumber)
      : this.orderService.findMineOne(user.id, idOrOrderNumber);
  }

  @Post()
  @ApiAuthErrors()
  @IdempotentCreate()
  @ApiOperation({
    summary: "Place an order from the signed-in user's cart",
    description: `The lines come from the cart; the body sends no items. Every 400 saves nothing: \`${ERROR_CODES.ORDER.CART_EMPTY}\` on \`cart\`, \`${ERROR_CODES.ORDER.SHIPPING_METHOD_UNAVAILABLE}\` on \`shippingMethodId\`, \`${ERROR_CODES.ORDER.ITEM_UNAVAILABLE}\` and \`${ERROR_CODES.ORDER.OUT_OF_STOCK}\` on \`items.<i>.productVariantId\` (one entry per cart line, in cart order).`,
  })
  @ApiDataResponse(HttpStatus.CREATED, ResponseOrderDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.ORDER.OUT_OF_STOCK(
      OUT_OF_STOCK_EXAMPLE.available,
      OUT_OF_STOCK_EXAMPLE.sku,
    ),
    {
      errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
      field: 'items.0.productVariantId',
      description: ERROR_DESCRIPTIONS.ORDER.OUT_OF_STOCK,
    },
  )
  place(
    @AuthUser() user: User,
    @Body({ schema: placeOrderSchema }) dto: PlaceOrderInput,
  ): Promise<ResponseOrderDto> {
    return this.orderService.place(user.id, dto);
  }

  @Post(':idOrOrderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAuthErrors()
  @ApiOperation({
    summary: "Cancel one of the signed-in user's PENDING orders",
    description:
      "A UUID looks up by id, anything else by orderNumber. In one transaction the order becomes CANCELLED, each item's held stock is released (RELEASE) and its PENDING charge becomes FAILED; an open checkout session is expired through the outbox. Another user's order returns 404; a non-PENDING or paid order, one that has shipped, or one whose payment the gateway holds for review, returns 409.",
  })
  @ApiDataResponse(HttpStatus.OK, ResponseOrderDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
    errCode: ERROR_CODES.ORDER.NOT_FOUND,
    field: 'idOrOrderNumber',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
  })
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('confirmed'),
    {
      errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
      field: 'status',
      description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE,
    },
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
    {
      errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
      field: 'paymentStatus',
      description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_PAYMENT_HELD,
    },
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('shipped'),
    {
      errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
      field: 'shippingStatus',
      description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_SHIPPED_SHOPPER,
    },
  )
  cancel(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
  ): Promise<ResponseOrderDto> {
    return this.orderService.cancel(user.id, idOrOrderNumber);
  }

  @Patch(':idOrOrderNumber/status')
  @AdminOnly()
  @ApiOperation({
    summary: "Change any order's status (admin)",
    description:
      "Allowed: PENDING → CONFIRMED or CANCELLED; CONFIRMED → COMPLETED or CANCELLED. CONFIRMED needs a cash on delivery order or a PAID charge; CANCELLED needs shipping PENDING and no charge held for review; COMPLETED needs shipping DELIVERED. Any other move returns 409 and saves nothing. CANCELLED does the shopper cancel's steps in one transaction: each item's held stock is released (RELEASE), PENDING charges become FAILED and an open checkout session is expired through the outbox; what is not refunded of a PAID CARD or PAYPAL charge is refunded through the outbox. A UUID looks up by id, anything else by orderNumber.",
  })
  @ApiDataResponse(HttpStatus.OK, ResponseOrderDto)
  @ApiStatusChangeErrors(
    'status',
    ERROR_MESSAGES.ORDER.STATUS_NOT_ALLOWED('PENDING', 'COMPLETED'),
  )
  @ApiOrderRuleErrors('status', [
    [
      ERROR_MESSAGES.ORDER.NOT_CONFIRMABLE_UNPAID,
      ERROR_DESCRIPTIONS.ORDER.NOT_CONFIRMABLE_UNPAID,
    ],
    [
      ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('shipped'),
      ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_SHIPPED,
    ],
    [
      ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
      ERROR_DESCRIPTIONS.ORDER.PAYMENT_HELD_ADMIN,
    ],
    [
      ERROR_MESSAGES.ORDER.NOT_COMPLETABLE_UNDELIVERED,
      ERROR_DESCRIPTIONS.ORDER.NOT_COMPLETABLE_UNDELIVERED,
    ],
  ])
  updateStatus(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
    @Body({ schema: updateOrderStatusSchema })
    { status }: UpdateOrderStatusInput,
  ): Promise<ResponseOrderDto> {
    return this.orderService.updateStatus(idOrOrderNumber, status, user.id);
  }

  @Patch(':idOrOrderNumber/shipping-status')
  @AdminOnly()
  @ApiOperation({
    summary: "Change any order's shipping status (admin)",
    description:
      'Allowed: PENDING → SHIPPING; SHIPPING → DELIVERED or RETURNED, only while the order is CONFIRMED; RETURNED also needs no charge held for review. Any other move returns 409 and saves nothing. DELIVERED records a SALE per item (stock and held stock both drop) and marks a cash on delivery charge PAID. RETURNED runs the cancel steps and makes the order CANCELLED; what is not refunded of a PAID CARD or PAYPAL charge is refunded through the outbox. A UUID looks up by id, anything else by orderNumber.',
  })
  @ApiDataResponse(HttpStatus.OK, ResponseOrderDto)
  @ApiStatusChangeErrors(
    'shippingStatus',
    ERROR_MESSAGES.ORDER.SHIPPING_STATUS_NOT_ALLOWED('PENDING', 'DELIVERED'),
  )
  @ApiOrderRuleErrors('shippingStatus', [
    [
      ERROR_MESSAGES.ORDER.SHIPPING_NEEDS_CONFIRMED,
      ERROR_DESCRIPTIONS.ORDER.SHIPPING_NEEDS_CONFIRMED,
    ],
    [
      ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
      ERROR_DESCRIPTIONS.ORDER.PAYMENT_HELD_ADMIN,
    ],
  ])
  updateShippingStatus(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
    @Body({ schema: updateOrderShippingStatusSchema })
    { shippingStatus }: UpdateOrderShippingStatusInput,
  ): Promise<ResponseOrderDto> {
    return this.orderService.updateShippingStatus(
      idOrOrderNumber,
      shippingStatus,
      user.id,
    );
  }

  @Post(':idOrOrderNumber/refunds')
  @AdminOnly()
  @IdempotentCreate()
  @ApiOperation({
    summary: "Refund part or all of an order's paid online charge (admin)",
    description:
      'Adds a PENDING REFUND row with the method of the PAID CARD or PAYPAL charge and queues the refund at the provider through the outbox; the provider webhook sets it PAID or FAILED. An order is refunded once: a second refund returns 409 while a PENDING or PAID refund exists, and `amount` may not exceed the PAID charge. A UUID looks up by id, anything else by orderNumber.',
  })
  @ApiDataResponse(HttpStatus.CREATED, ResponsePaymentDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
    errCode: ERROR_CODES.ORDER.NOT_FOUND,
    field: 'idOrOrderNumber',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
  })
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
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.ORDER.ALREADY_REFUNDED,
    {
      errCode: ERROR_CODES.ORDER.ALREADY_REFUNDED,
      field: 'amount',
      description: ERROR_DESCRIPTIONS.ORDER.ALREADY_REFUNDED,
    },
  )
  refund(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
    @Body({ schema: createRefundSchema }) { amount }: CreateRefundInput,
  ): Promise<ResponsePaymentDto> {
    return this.orderService.refund(idOrOrderNumber, amount, user.id);
  }
}
