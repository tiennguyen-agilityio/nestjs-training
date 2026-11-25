import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  VALIDATION_RULES,
} from '@repo/constants';
import {
  OrderRepository,
  type CreateOrderData,
} from '../repositories/order.repository.js';
import { CartService } from '../../cart/services/cart.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ShippingMethodService } from '../../shipping-method/services/shipping-method.service.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import { ResponseOrderRowDto } from '../dto/response-order-row.dto.js';
import { ResponseOrderDetailDto } from '../dto/response-order-detail.dto.js';
import type { OrderQueryInput, PlaceOrderInput } from '../dto/order.schema.js';
import { PaginatedResult } from '../../../common/dto/pagination.dto.js';
import { mapPaginatedResult } from '../../../common/utils/pagination.util.js';
import type { CartItem } from '../../cart/entities/cart-item.entity.js';
import type { Order } from '../entities/order.entity.js';
import type { ProductVariant } from '../../product-variant/entities/product-variant.entity.js';
import { isPurchasable } from '../../product-variant/utils/purchasable.util.js';
import { availableQuantityOf } from '../../product-variant/utils/stock.util.js';
import { variantNameFrom } from '../../product-variant/utils/variant-name.util.js';
import { pricingOf } from '../../cart/utils/cart-pricing.util.js';
import { orderTotalsOf } from '../utils/order-pricing.util.js';
import { generateOrderNumber } from '../utils/order-number.util.js';
import {
  InvalidStateException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import type { ErrorDetailDto } from '../../../common/dto/error.dto.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

const ORDER_NUMBER_ATTEMPTS = 5;
const CANCELLED_REASON = 'Cancelled';
const EXPIRING_METHODS = new Set([PaymentMethod.CARD, PaymentMethod.PAYPAL]);

const money = (amount: number): string => amount.toFixed(2);

/** A UUID is an id, anything else an orderNumber (never UUID-shaped). */
const whereOf = (
  idOrOrderNumber: string,
): { id: string } | { orderNumber: string } =>
  z.uuid().safeParse(idOrOrderNumber).success
    ? { id: idOrOrderNumber }
    : { orderNumber: idOrOrderNumber };

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

  /** The caller's own orders only, whatever their role (`findAll` lists every order). */
  async findMine(
    userId: string,
    { page, limit, ...filters }: OrderQueryInput,
  ): Promise<PaginatedResult<ResponseOrderRowDto>> {
    const result = await this.orderRepository.findMine(
      userId,
      { page, limit },
      filters,
    );

    return mapPaginatedResult(result, (order) =>
      ResponseOrderRowDto.fromEntity(order),
    );
  }

  /**
   * One of the caller's orders: a UUID is an id, anything else an
   * orderNumber (never UUID-shaped). Another user's order is not found.
   */
  async findMineOne(
    userId: string,
    idOrOrderNumber: string,
  ): Promise<ResponseOrderDetailDto> {
    const order = await this.orderRepository.findMineByIdOrNumber(
      userId,
      whereOf(idOrOrderNumber),
    );
    if (!order) throw this.orderNotFound();

    return ResponseOrderDetailDto.fromEntity(order);
  }

  /** Every order: the controller lets only an active admin through. */
  async findAll({
    page,
    limit,
    ...filters
  }: OrderQueryInput): Promise<PaginatedResult<ResponseOrderRowDto>> {
    const result = await this.orderRepository.findAll({ page, limit }, filters);

    return mapPaginatedResult(result, (order) =>
      ResponseOrderRowDto.fromEntity(order),
    );
  }

  /** Any order, as `findMineOne` reads one: the controller lets only an active admin through. */
  async findAnyOne(idOrOrderNumber: string): Promise<ResponseOrderDetailDto> {
    const order = await this.orderRepository.findAnyByIdOrNumber(
      whereOf(idOrOrderNumber),
    );
    if (!order) throw this.orderNotFound();

    return ResponseOrderDetailDto.fromEntity(order);
  }

  /**
   * Cancels one of the caller's PENDING, unpaid orders in one transaction:
   * releases each item's held stock (RELEASE), fails the PENDING charges,
   * and queues the expiry of any open checkout session.
   */
  cancel(userId: string, idOrOrderNumber: string): Promise<ResponseOrderDto> {
    return this.orderRepository.transactionalWithOutbox(
      async (enqueueCheckoutExpire) => {
        const order = await this.orderRepository.lockMineForCancel(
          userId,
          whereOf(idOrOrderNumber),
        );
        if (!order) throw this.orderNotFound();
        this.assertCancellable(order);

        const items = [...order.items.getItems()].sort((a, b) =>
          a.productVariant.id.localeCompare(b.productVariant.id),
        );
        for (const item of items) {
          const released = await this.productVariantService.release(
            item.productVariant.id,
            item.quantity,
            userId,
          );
          if (!released) {
            throw new Error(
              `Order ${order.id} holds no reservation of ${item.quantity} for variant ${item.productVariant.id}`,
            );
          }
        }

        const charges = order.payments
          .getItems()
          .filter(
            (payment) => (payment.type as PaymentType) === PaymentType.CHARGE,
          );
        for (const charge of charges) {
          if ((charge.status as PaymentStatus) === PaymentStatus.PENDING) {
            charge.status = PaymentStatus.FAILED;
            charge.failureReason = CANCELLED_REASON;
          }
        }
        order.status = OrderStatus.CANCELLED;
        order.expiresAt = null;
        await this.orderRepository.saveCancelled(order, userId);

        for (const charge of charges) {
          if (charge.checkoutSessionId) {
            await enqueueCheckoutExpire({
              paymentId: charge.id,
              method: charge.method,
              checkoutSessionId: charge.checkoutSessionId,
            });
          }
        }

        return ResponseOrderDto.fromEntity(order);
      },
    );
  }

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

  private assertCancellable(order: Order): void {
    if ((order.status as OrderStatus) !== OrderStatus.PENDING) {
      throw new InvalidStateException({
        errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
        field: 'status',
        message: ERROR_MESSAGES.ORDER.NOT_CANCELLABLE(
          order.status.toLowerCase(),
        ),
        description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE,
      });
    }
    const charges = order.payments
      .getItems()
      .filter(
        (payment) => (payment.type as PaymentType) === PaymentType.CHARGE,
      );
    if (
      charges.some(
        (payment) => (payment.status as PaymentStatus) === PaymentStatus.PAID,
      )
    ) {
      throw new InvalidStateException({
        errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
        field: 'paymentStatus',
        message: ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('paid'),
        description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_PAID,
      });
    }
    // A pending charge with a transaction id is money the gateway holds for review.
    if (
      charges.some(
        (payment) =>
          (payment.status as PaymentStatus) === PaymentStatus.PENDING &&
          payment.transactionId,
      )
    ) {
      throw new InvalidStateException({
        errCode: ERROR_CODES.ORDER.STATUS_NOT_ALLOWED,
        field: 'paymentStatus',
        message: ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
        description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_PAYMENT_HELD,
      });
    }
  }

  private orderNotFound(): ItemNotFoundException {
    return new ItemNotFoundException({
      errCode: ERROR_CODES.ORDER.NOT_FOUND,
      field: 'idOrOrderNumber',
      message: ERROR_MESSAGES.ORDER.NOT_FOUND,
      description: ERROR_DESCRIPTIONS.ORDER.NOT_FOUND,
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
