import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from '../services/order.service.js';
import {
  orderParamSchema,
  orderQuerySchema,
  placeOrderSchema,
  type OrderParam,
  type OrderQueryInput,
  type PlaceOrderInput,
} from '../dto/order.schema.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import { ResponseOrderRowDto } from '../dto/response-order-row.dto.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
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
  @ApiAuthErrors()
  @ApiOperation({
    summary: "List the signed-in user's orders",
    description:
      'Every role sees only its own orders. Newest first by default; `paymentStatus` filters on the value the rows show.',
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
    return this.orderService.findMine(user.id, query);
  }

  @Get(':idOrOrderNumber')
  @ApiAuthErrors()
  @ApiOperation({
    summary: "Get one of the signed-in user's orders by id or order number",
    description:
      "A UUID looks up by id, anything else by orderNumber. Another user's order returns 404.",
  })
  @ApiDataResponse(HttpStatus.OK, ResponseOrderDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.ORDER.NOT_FOUND, {
    errCode: ERROR_CODES.ORDER.NOT_FOUND,
    field: 'idOrOrderNumber',
    description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
  })
  findOne(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
  ): Promise<ResponseOrderDto> {
    return this.orderService.findMineOne(user.id, idOrOrderNumber);
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
      "A UUID looks up by id, anything else by orderNumber. In one transaction the order becomes CANCELLED, each item's held stock is released (RELEASE) and its PENDING charge becomes FAILED; an open checkout session is expired through the outbox. Another user's order returns 404; a non-PENDING or paid order returns 409.",
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
  cancel(
    @AuthUser() user: User,
    @Param({ schema: orderParamSchema }) { idOrOrderNumber }: OrderParam,
  ): Promise<ResponseOrderDto> {
    return this.orderService.cancel(user.id, idOrOrderNumber);
  }
}
