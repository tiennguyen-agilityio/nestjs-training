import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CartService } from '../services/cart.service.js';
import {
  addCartItemSchema,
  type AddCartItemInput,
  updateCartItemSchema,
  type UpdateCartItemInput,
} from '../dto/cart.schema.js';
import { ResponseCartDto } from '../dto/response-cart.dto.js';
import {
  idParamSchema,
  type IdParam,
} from '../../../common/dto/id-param.schema.js';
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

// The Swagger example for the 409: a variant with 3 left.
const OUT_OF_STOCK_EXAMPLE = 3;

// AuthGuard's 401 (no user) and 403 (INACTIVE account), on every route.
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

/** The signed-in user's own cart (any ACTIVE user, USER or ADMIN). */
@ApiTags('cart')
@Controller('cart')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiAuthErrors()
  @ApiOperation({ summary: "Get the signed-in user's cart" })
  @ApiDataResponse(HttpStatus.OK, ResponseCartDto)
  getCart(@AuthUser() user: User): Promise<ResponseCartDto> {
    return this.cartService.getCart(user.id);
  }

  @Delete()
  @ApiAuthErrors()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Empty the signed-in user's cart" })
  @ApiDataResponse(HttpStatus.OK, ResponseCartDto)
  clear(@AuthUser() user: User): Promise<ResponseCartDto> {
    return this.cartService.clear(user.id);
  }

  @Post('items')
  @ApiAuthErrors()
  @IdempotentCreate()
  @ApiOperation({
    summary: 'Add a variant to the cart (an existing line adds up)',
  })
  @ApiDataResponse(HttpStatus.CREATED, ResponseCartDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND,
    {
      errCode: ERROR_CODES.PRODUCT_VARIANT.NOT_FOUND,
      field: 'productVariantId',
      description: ERROR_DESCRIPTIONS.PRODUCT_VARIANT.NOT_FOUND,
    },
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CART.OUT_OF_STOCK(OUT_OF_STOCK_EXAMPLE),
    {
      errCode: ERROR_CODES.CART.OUT_OF_STOCK,
      field: 'quantity',
      description: ERROR_DESCRIPTIONS.CART.NO_MORE_TO_ADD,
    },
  )
  addItem(
    @AuthUser() user: User,
    @Body({ schema: addCartItemSchema }) dto: AddCartItemInput,
  ): Promise<ResponseCartDto> {
    return this.cartService.addItem(user.id, dto);
  }

  @Patch('items/:id')
  @ApiAuthErrors()
  @ApiOperation({ summary: "Set a cart line's quantity" })
  @ApiDataResponse(HttpStatus.OK, ResponseCartDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  // Not in my cart (cartItemNotFound), or its product is no longer buyable
  // (productVariantNotFound, field id): one example per status.
  @ApiErrorResponse(
    HttpStatus.NOT_FOUND,
    `${ERROR_MESSAGES.CART_ITEM.NOT_FOUND} / ${ERROR_MESSAGES.PRODUCT_VARIANT.NOT_FOUND}`,
    {
      errCode: ERROR_CODES.CART_ITEM.NOT_FOUND,
      field: 'id',
      description: ERROR_DESCRIPTIONS.CART_ITEM.NOT_FOUND,
    },
  )
  @ApiErrorResponse(
    HttpStatus.CONFLICT,
    ERROR_MESSAGES.CART.OUT_OF_STOCK(OUT_OF_STOCK_EXAMPLE),
    {
      errCode: ERROR_CODES.CART.OUT_OF_STOCK,
      field: 'quantity',
      description: ERROR_DESCRIPTIONS.CART.LOWER_TO(OUT_OF_STOCK_EXAMPLE),
    },
  )
  updateItem(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: IdParam,
    @Body({ schema: updateCartItemSchema }) dto: UpdateCartItemInput,
  ): Promise<ResponseCartDto> {
    return this.cartService.updateItem(user.id, id, dto);
  }

  @Delete('items/:id')
  @ApiAuthErrors()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a line from the cart' })
  @ApiDataResponse(HttpStatus.OK, ResponseCartDto)
  @ApiErrorResponse(
    HttpStatus.BAD_REQUEST,
    ERROR_MESSAGES.EXCEPTION.VALIDATION_FAILED,
  )
  @ApiErrorResponse(HttpStatus.NOT_FOUND, ERROR_MESSAGES.CART_ITEM.NOT_FOUND, {
    errCode: ERROR_CODES.CART_ITEM.NOT_FOUND,
    field: 'id',
    description: ERROR_DESCRIPTIONS.CART_ITEM.NOT_FOUND,
  })
  removeItem(
    @AuthUser() user: User,
    @Param({ schema: idParamSchema }) { id }: IdParam,
  ): Promise<ResponseCartDto> {
    return this.cartService.removeItem(user.id, id);
  }
}
