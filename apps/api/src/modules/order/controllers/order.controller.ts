import {
  applyDecorators,
  Body,
  Controller,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderService } from '../services/order.service.js';
import { placeOrderSchema, type PlaceOrderInput } from '../dto/order.schema.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import { AuthGuard } from '../../../common/guards/auth.guard.js';
import { AuthUser } from '../../../common/decorators/auth-user.decorator.js';
import { IdempotentCreate } from '../../../common/decorators/idempotent-create.decorator.js';
import {
  ApiDataResponse,
  ApiErrorResponse,
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
}
