import { Injectable } from '@nestjs/common';
import { PaymentMethod, VALIDATION_RULES } from '@repo/constants';
import {
  OrderRepository,
  type CreateOrderData,
} from '../repositories/order.repository.js';
import { CartService } from '../../cart/services/cart.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ShippingMethodService } from '../../shipping-method/services/shipping-method.service.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import type { PlaceOrderInput } from '../dto/order.schema.js';
import type { CartItem } from '../../cart/entities/cart-item.entity.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { isPurchasable } from '../../product-variant/utils/purchasable.util.js';
import { availableQuantityOf } from '../../product-variant/utils/stock.util.js';
import { variantNameFrom } from '../../product-variant/utils/variant-name.util.js';
import { pricingOf } from '../../cart/utils/cart-pricing.util.js';
import { orderTotalsOf } from '../utils/order-pricing.util.js';
import { generateOrderNumber } from '../utils/order-number.util.js';
import { ValidationException } from '../../../common/exceptions/base.exception.js';
import type { ErrorDetailDto } from '../../../common/dto/error.dto.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const ORDER_NUMBER_ATTEMPTS = 5;
const EXPIRING_METHODS = new Set([PaymentMethod.CARD, PaymentMethod.PAYPAL]);

const money = (amount: number): string => amount.toFixed(2);

const primaryImageOf = (variant: ProductVariant): string | undefined =>
  variant.product.images
    .getItems()
    .find((image) => image.isPrimary && !image.deletedAt)?.url;

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly cartService: CartService,
    private readonly productVariantService: ProductVariantService,
    private readonly shippingMethodService: ShippingMethodService,
  ) {}

  place(userId: string, input: PlaceOrderInput): Promise<ResponseOrderDto> {
    return this.orderRepository.transactional(async () => {
      const cart = await this.cartService.lockForCheckout(userId);
      const lines = cart?.items.getItems() ?? [];
      if (!cart || lines.length === 0) {
        throw this.invalid({
          errCode: ERROR_CODES.ORDER.CART_EMPTY,
          field: 'cart',
          message: ERROR_MESSAGES.ORDER.CART_EMPTY,
          description: ERROR_DESCRIPTIONS.ORDER.CART_EMPTY,
        });
      }

      const method = await this.shippingMethodService.findForOrder(
        input.shippingMethodId,
      );
      if (!method) {
        throw this.invalid({
          errCode: ERROR_CODES.ORDER.SHIPPING_METHOD_UNAVAILABLE,
          field: 'shippingMethodId',
          message: ERROR_MESSAGES.ORDER.SHIPPING_METHOD_UNAVAILABLE,
          description: ERROR_DESCRIPTIONS.ORDER.SHIPPING_METHOD_UNAVAILABLE,
        });
      }

      this.throwIfAny(lines.map((line, index) => this.checkLine(line, index)));
      await this.reserveAll(lines, userId);

      const items = lines.map((line) => this.snapshotOf(line));
      const totals = orderTotalsOf(
        items.map((item) => ({
          unitPrice: Number(item.unitPrice),
          discountAmount: Number(item.discountAmount),
          quantity: item.quantity,
        })),
        Number(method.price),
      );
      const { shippingMethodId, paymentMethod, note, ...recipient } = input;

      const order = await this.orderRepository.create(
        {
          ...recipient,
          userId,
          shippingMethodId,
          orderNumber: await this.freeOrderNumber(),
          shippingMethodName: method.name,
          shippingFee: money(Number(method.price)),
          tax: money(totals.tax),
          totalAmount: money(totals.totalAmount),
          note: note ?? null,
          expiresAt: EXPIRING_METHODS.has(paymentMethod)
            ? new Date(
                Date.now() +
                  VALIDATION_RULES.ORDER.PAYMENT_EXPIRY_MINUTES * 60_000,
              )
            : null,
          items,
          payment: {
            method: paymentMethod,
            amount: money(totals.totalAmount),
          },
          movements: lines.map((line) => ({
            productVariantId: line.productVariant.id,
            quantity: line.quantity,
          })),
        },
        userId,
      );
      await this.cartService.clearItems(cart.id);

      return ResponseOrderDto.fromEntity(order);
    });
  }

  private checkLine(line: CartItem, index: number): ErrorDetailDto | null {
    const variant = line.productVariant;
    if (!isPurchasable(variant) || !primaryImageOf(variant)) {
      return {
        errCode: ERROR_CODES.ORDER.ITEM_UNAVAILABLE,
        field: `items.${index}.productVariantId`,
        message: ERROR_MESSAGES.ORDER.ITEM_UNAVAILABLE,
        description: ERROR_DESCRIPTIONS.ORDER.ITEM_UNAVAILABLE,
      };
    }
    const available = availableQuantityOf(variant);
    return line.quantity > available
      ? this.outOfStock(index, variant.sku, available)
      : null;
  }

  private async reserveAll(lines: CartItem[], actorId: string): Promise<void> {
    const ordered = lines
      .map((line, index) => ({ line, index }))
      .sort((a, b) =>
        a.line.productVariant.id.localeCompare(b.line.productVariant.id),
      );
    const failures: { index: number; error: ErrorDetailDto }[] = [];
    for (const { line, index } of ordered) {
      const reserved = await this.productVariantService.reserve(
        line.productVariant.id,
        line.quantity,
        actorId,
      );
      if (!reserved) {
        const current = await this.productVariantService.reload(
          line.productVariant,
        );
        const available = current ? availableQuantityOf(current) : 0;
        failures.push({
          index,
          error: this.outOfStock(
            index,
            line.productVariant.sku,
            Math.min(available, line.quantity - 1),
          ),
        });
      }
    }
    this.throwIfAny(
      failures.sort((a, b) => a.index - b.index).map(({ error }) => error),
    );
  }

  private snapshotOf(line: CartItem): CreateOrderData['items'][number] {
    const variant = line.productVariant;
    const pricing = pricingOf(variant);
    return {
      productVariantId: variant.id,
      productName: variant.product.name,
      productImage: primaryImageOf(variant) ?? '',
      variantName: variantNameFrom(variant.size, variant.unit),
      unitPrice: money(pricing.price),
      discountAmount: money(pricing.price - pricing.salePrice),
      quantity: line.quantity,
    };
  }

  private async freeOrderNumber(): Promise<string> {
    for (let attempt = 0; attempt < ORDER_NUMBER_ATTEMPTS; attempt++) {
      const orderNumber = generateOrderNumber();
      if (!(await this.orderRepository.existsByNumber(orderNumber))) {
        return orderNumber;
      }
    }
    throw new Error('No free order number after several attempts');
  }

  private outOfStock(
    index: number,
    sku: string,
    available: number,
  ): ErrorDetailDto {
    return {
      errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
      field: `items.${index}.productVariantId`,
      message: ERROR_MESSAGES.ORDER.OUT_OF_STOCK(available, sku),
      description: ERROR_DESCRIPTIONS.ORDER.OUT_OF_STOCK,
    };
  }

  private throwIfAny(errors: (ErrorDetailDto | null)[]): void {
    const found = errors.filter((error): error is ErrorDetailDto => !!error);
    if (found.length > 0) throw new ValidationException(found);
  }

  private invalid(error: ErrorDetailDto): ValidationException {
    return new ValidationException([error]);
  }
}
