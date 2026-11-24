import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';
import {
  DiscountType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
  ProductStatus,
  ProductUnit,
  ShippingMethodStatus,
} from '@repo/constants';
import { OrderService } from './order.service.js';
import { OrderRepository } from '../repositories/order.repository.js';
import { CartService } from '../../cart/services/cart.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ShippingMethodService } from '../../shipping-method/services/shipping-method.service.js';
import { ResponseOrderDto } from '../dto/response-order.dto.js';
import { ResponseOrderDetailDto } from '../dto/response-order-detail.dto.js';
import { ResponseOrderRowDto } from '../dto/response-order-row.dto.js';
import type { PlaceOrderInput } from '../dto/order.schema.js';
import type { Cart } from '../../cart/entities/cart.entity.js';
import type { Order } from '../entities/order.entity.js';
import {
  DomainException,
  InvalidStateException,
  ItemNotFoundException,
  ValidationException,
} from '../../../common/exceptions/base.exception.js';
import { ERROR_CODES } from '../../../common/constants/error-code.constant.js';

const USER_ID = 'user-1';
const CART_ID = 'cart-1';
const METHOD_ID = '3f1c2a5e-8b4d-4e6f-9a7b-1c2d3e4f5a6b';

const input = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  shippingMethodId: METHOD_ID,
  paymentMethod: PaymentMethod.COD,
  recipientName: 'Lan Nguyen',
  recipientPhone: '0901234567',
  addressLine: '12 Le Loi',
  ward: 'Ben Nghe',
  district: 'District 1',
  city: 'Ho Chi Minh City',
  postalCode: '700000',
  ...overrides,
});

interface LineOptions {
  variantId?: string;
  sku?: string;
  quantity?: number;
  price?: string;
  discountType?: DiscountType | null;
  discountValue?: string | null;
  stock?: number;
  reserved?: number;
  status?: ProductStatus;
  images?: { url: string; isPrimary: boolean; deletedAt: Date | null }[];
}

const lineOf = ({
  variantId = 'variant-a',
  sku = 'KEN-250',
  quantity = 2,
  price = '10.00',
  discountType = null,
  discountValue = null,
  stock = 5,
  reserved = 0,
  status = ProductStatus.ACTIVE,
  images = [
    { url: 'https://example.com/kenya.jpg', isPrimary: true, deletedAt: null },
  ],
}: LineOptions = {}) => ({
  id: `line-${variantId}`,
  quantity,
  productVariant: {
    id: variantId,
    sku,
    size: '250.00',
    unit: ProductUnit.G,
    price,
    discountType,
    discountValue,
    stockQuantity: stock,
    reservedQuantity: reserved,
    deletedAt: null,
    product: {
      name: 'Kenya AA',
      status,
      deletedAt: null,
      images: { getItems: () => images },
    },
  },
});

const cartWith = (...lines: ReturnType<typeof lineOf>[]): Cart =>
  ({ id: CART_ID, items: { getItems: () => lines } }) as unknown as Cart;

const method = (overrides: Record<string, unknown> = {}) => ({
  id: METHOD_ID,
  name: 'Roast Express',
  price: '12.00',
  status: ShippingMethodStatus.ACTIVE,
  ...overrides,
});

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: Record<
    | 'transactional'
    | 'create'
    | 'existsByNumber'
    | 'findMine'
    | 'findAll'
    | 'findMineByIdOrNumber'
    | 'findAnyByIdOrNumber'
    | 'transactionalWithOutbox'
    | 'lockMineForCancel'
    | 'saveCancelled',
    Mock
  >;
  let enqueueCheckoutExpire: Mock;
  let cartService: Record<'lockForCheckout' | 'clearItems', Mock>;
  let productVariantService: Record<'reserve' | 'reload' | 'release', Mock>;
  let shippingMethodService: Record<'findForOrder', Mock>;
  let fromEntity: Mock;
  const created = { id: 'order-1' } as Order;
  const response = { id: 'order-1' } as ResponseOrderDto;

  const errorOf = async (promise: Promise<unknown>): Promise<DomainException> =>
    (await promise.catch((caught: unknown) => caught)) as DomainException;

  const createdData = () =>
    orderRepository.create.mock.calls[0][0] as Record<string, unknown> & {
      items: Record<string, unknown>[];
      payment: Record<string, unknown>;
      movements: Record<string, unknown>[];
    };

  beforeEach(async () => {
    enqueueCheckoutExpire = vi.fn();
    orderRepository = {
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
      create: vi.fn().mockResolvedValue(created),
      existsByNumber: vi.fn().mockResolvedValue(false),
      findMine: vi.fn(),
      findAll: vi.fn(),
      findMineByIdOrNumber: vi.fn(),
      findAnyByIdOrNumber: vi.fn(),
      transactionalWithOutbox: vi.fn(
        (work: (enqueue: Mock) => Promise<unknown>) =>
          work(enqueueCheckoutExpire),
      ),
      lockMineForCancel: vi.fn(),
      saveCancelled: vi.fn(),
    };
    cartService = {
      lockForCheckout: vi.fn().mockResolvedValue(cartWith(lineOf())),
      clearItems: vi.fn(),
    };
    productVariantService = {
      reserve: vi.fn().mockResolvedValue(true),
      reload: vi.fn((variant: unknown) => Promise.resolve(variant)),
      release: vi.fn().mockResolvedValue(true),
    };
    shippingMethodService = {
      findForOrder: vi.fn().mockResolvedValue(method()),
    };
    fromEntity = vi
      .spyOn(ResponseOrderDto, 'fromEntity')
      .mockReturnValue(response);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: OrderRepository, useValue: orderRepository },
        { provide: CartService, useValue: cartService },
        { provide: ProductVariantService, useValue: productVariantService },
        { provide: ShippingMethodService, useValue: shippingMethodService },
      ],
    }).compile();
    service = module.get(OrderService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('place rejects an empty cart', async () => {
    cartService.lockForCheckout.mockResolvedValueOnce(cartWith());
    const empty = await errorOf(service.place(USER_ID, input()));
    cartService.lockForCheckout.mockResolvedValueOnce(null);
    const none = await errorOf(service.place(USER_ID, input()));

    for (const error of [empty, none]) {
      expect(error).toBeInstanceOf(ValidationException);
      expect(error.getErrors()).toEqual([
        {
          errCode: ERROR_CODES.ORDER.CART_EMPTY,
          field: 'cart',
          message: 'Cart is empty',
          description: 'Add an item before checking out.',
        },
      ]);
    }
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('place rejects a missing, deleted or INACTIVE method', async () => {
    shippingMethodService.findForOrder.mockResolvedValue(null);

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.SHIPPING_METHOD_UNAVAILABLE,
      field: 'shippingMethodId',
    });
    expect(shippingMethodService.findForOrder).toHaveBeenCalledWith(METHOD_ID);
    expect(productVariantService.reserve).not.toHaveBeenCalled();
  });

  it('place rejects an unavailable line', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(lineOf({ status: ProductStatus.INACTIVE })),
    );

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error.getErrors()).toEqual([
      expect.objectContaining({
        errCode: ERROR_CODES.ORDER.ITEM_UNAVAILABLE,
        field: 'items.0.productVariantId',
      }),
    ]);
    expect(productVariantService.reserve).not.toHaveBeenCalled();
  });

  it('place rejects a line whose product has no primary image', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(lineOf({ images: [] })),
    );

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.ITEM_UNAVAILABLE,
      field: 'items.0.productVariantId',
    });
  });

  it('place rejects a line above the available stock', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(lineOf({ quantity: 2, stock: 3, reserved: 2 })),
    );

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.getErrors()).toEqual([
      {
        errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
        field: 'items.0.productVariantId',
        message: 'Only 1 left for KEN-250',
        description: 'Update your cart and try again.',
      },
    ]);
    expect(productVariantService.reserve).not.toHaveBeenCalled();
  });

  it('place reports every failing line in one ValidationException', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(
        lineOf({ variantId: 'variant-a', status: ProductStatus.DRAFT }),
        lineOf({ variantId: 'variant-b', sku: 'ETH-250', stock: 1 }),
      ),
    );

    const error = await errorOf(service.place(USER_ID, input()));

    expect(
      error.getErrors().map(({ errCode, field }) => [errCode, field]),
    ).toEqual([
      [ERROR_CODES.ORDER.ITEM_UNAVAILABLE, 'items.0.productVariantId'],
      [ERROR_CODES.ORDER.OUT_OF_STOCK, 'items.1.productVariantId'],
    ]);
  });

  it('place rejects when a reserve returns false and creates nothing', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(
        lineOf({ variantId: 'variant-b', sku: 'ETH-250' }),
        lineOf({ variantId: 'variant-a' }),
      ),
    );
    productVariantService.reserve.mockImplementation((id: string) =>
      Promise.resolve(id !== 'variant-b'),
    );

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error.getErrors()).toEqual([
      expect.objectContaining({
        errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
        field: 'items.0.productVariantId',
      }),
    ]);
    expect(
      productVariantService.reserve.mock.calls.map(([id]) => id as string),
    ).toEqual(['variant-a', 'variant-b']);
    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(cartService.clearItems).not.toHaveBeenCalled();
  });

  it('place reports the current available count when a reserve fails', async () => {
    const line = lineOf({ quantity: 3, stock: 5 });
    cartService.lockForCheckout.mockResolvedValue(cartWith(line));
    productVariantService.reserve.mockResolvedValue(false);
    productVariantService.reload.mockResolvedValue({
      ...line.productVariant,
      reservedQuantity: 3,
    });

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
      message: 'Only 2 left for KEN-250',
    });
    expect(productVariantService.reload).toHaveBeenCalledWith(
      line.productVariant,
    );
  });

  it('place never reports more left than the line asked for', async () => {
    const line = lineOf({ quantity: 3, stock: 5 });
    cartService.lockForCheckout.mockResolvedValue(cartWith(line));
    productVariantService.reserve.mockResolvedValue(false);
    productVariantService.reload.mockResolvedValue({
      ...line.productVariant,
      stockQuantity: 9,
    });

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error.getErrors()[0].message).toBe('Only 2 left for KEN-250');
  });

  it('place reports 0 left when the variant row is gone after a failed reserve', async () => {
    cartService.lockForCheckout.mockResolvedValue(cartWith(lineOf()));
    productVariantService.reserve.mockResolvedValue(false);
    productVariantService.reload.mockResolvedValue(null);

    const error = await errorOf(service.place(USER_ID, input()));

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.getErrors()[0]).toMatchObject({
      errCode: ERROR_CODES.ORDER.OUT_OF_STOCK,
      message: 'Only 0 left for KEN-250',
    });
  });

  it('place reserves with the user as the actor', async () => {
    await service.place(USER_ID, input());

    expect(productVariantService.reserve).toHaveBeenCalledWith(
      'variant-a',
      2,
      USER_ID,
    );
  });

  it('place snapshots names, prices and the method', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(
        lineOf({
          quantity: 2,
          price: '10.00',
          discountType: DiscountType.PERCENT,
          discountValue: '10.00',
        }),
      ),
    );

    await service.place(USER_ID, input({ note: 'Ring twice' }));

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.any(Object),
      USER_ID,
    );
    expect(createdData()).toMatchObject({
      userId: USER_ID,
      shippingMethodId: METHOD_ID,
      recipientName: 'Lan Nguyen',
      recipientPhone: '0901234567',
      city: 'Ho Chi Minh City',
      shippingMethodName: 'Roast Express',
      shippingFee: '12.00',
      tax: '1.80',
      totalAmount: '31.80',
      note: 'Ring twice',
    });
    expect(createdData().items).toEqual([
      {
        productVariantId: 'variant-a',
        productName: 'Kenya AA',
        productImage: 'https://example.com/kenya.jpg',
        variantName: '250g',
        unitPrice: '10.00',
        discountAmount: '1.00',
        quantity: 2,
      },
    ]);
  });

  it('place sets expiresAt for CARD and PAYPAL, null for COD', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
    try {
      for (const paymentMethod of [PaymentMethod.CARD, PaymentMethod.PAYPAL]) {
        orderRepository.create.mockClear();
        await service.place(USER_ID, input({ paymentMethod }));
        expect(createdData().expiresAt).toEqual(
          new Date('2026-11-25T10:00:00Z'),
        );
      }
      orderRepository.create.mockClear();
      await service.place(USER_ID, input({ paymentMethod: PaymentMethod.COD }));
      expect(createdData().expiresAt).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('place writes one PENDING CHARGE for the total and one RESERVE per line with createdBy null', async () => {
    cartService.lockForCheckout.mockResolvedValue(
      cartWith(
        lineOf({ variantId: 'variant-a', quantity: 2 }),
        lineOf({ variantId: 'variant-b', sku: 'ETH-250', quantity: 1 }),
      ),
    );

    await service.place(USER_ID, input());

    expect(createdData().payment).toEqual({
      method: PaymentMethod.COD,
      amount: '45.00',
    });
    expect(createdData().movements).toEqual([
      { productVariantId: 'variant-a', quantity: 2 },
      { productVariantId: 'variant-b', quantity: 1 },
    ]);
  });

  it('place retries a taken order number', async () => {
    orderRepository.existsByNumber
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await service.place(USER_ID, input());

    expect(orderRepository.existsByNumber).toHaveBeenCalledTimes(2);
    expect(createdData().orderNumber).toBe(
      orderRepository.existsByNumber.mock.calls[1][0],
    );
  });

  it('place clears the cart after saving', async () => {
    await expect(service.place(USER_ID, input())).resolves.toBe(response);

    expect(cartService.lockForCheckout).toHaveBeenCalledWith(USER_ID);
    expect(cartService.clearItems).toHaveBeenCalledWith(CART_ID);
    expect(orderRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
      cartService.clearItems.mock.invocationCallOrder[0],
    );
    expect(fromEntity).toHaveBeenCalledWith(created);
    expect(orderRepository.transactional).toHaveBeenCalledTimes(1);
  });

  describe('findMine', () => {
    it('maps the page through ResponseOrderRowDto', async () => {
      const order = { id: 'order-1' } as Order;
      const row = { id: 'order-1' } as ResponseOrderRowDto;
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      orderRepository.findMine.mockResolvedValue({ data: [order], meta });
      const rowOf = vi
        .spyOn(ResponseOrderRowDto, 'fromEntity')
        .mockReturnValue(row);

      const result = await service.findMine(USER_ID, {
        page: 1,
        limit: 10,
        status: OrderStatus.PENDING,
        sort: 'createdAt',
        order: 'DESC',
      });

      expect(result).toEqual({ data: [row], meta });
      expect(rowOf).toHaveBeenCalledWith(order);
      expect(orderRepository.findMine).toHaveBeenCalledWith(
        USER_ID,
        { page: 1, limit: 10 },
        { status: OrderStatus.PENDING, sort: 'createdAt', order: 'DESC' },
      );
    });
  });

  describe('findMineOne', () => {
    const ORDER_ID = '8b0c6f2e-4d1a-4c3b-9e5f-6a7b8c9d0e1f';

    it('looks up by id for a UUID and by orderNumber otherwise', async () => {
      const order = { id: ORDER_ID } as Order;
      orderRepository.findMineByIdOrNumber.mockResolvedValue(order);
      const detail = { id: ORDER_ID } as ResponseOrderDetailDto;
      const detailOf = vi
        .spyOn(ResponseOrderDetailDto, 'fromEntity')
        .mockReturnValue(detail);

      await expect(service.findMineOne(USER_ID, ORDER_ID)).resolves.toBe(
        detail,
      );
      await service.findMineOne(USER_ID, 'CH-261124-0001');

      expect(orderRepository.findMineByIdOrNumber).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        { id: ORDER_ID },
      );
      expect(orderRepository.findMineByIdOrNumber).toHaveBeenNthCalledWith(
        2,
        USER_ID,
        { orderNumber: 'CH-261124-0001' },
      );
      expect(detailOf).toHaveBeenCalledWith(order);
    });

    it('throws ItemNotFoundException when nothing matches', async () => {
      orderRepository.findMineByIdOrNumber.mockResolvedValue(null);

      const error = await errorOf(service.findMineOne(USER_ID, 'CH-0'));

      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.NOT_FOUND,
        field: 'idOrOrderNumber',
      });
    });
  });
  describe('cancel', () => {
    const ORDER_ID = '8b0c6f2e-4d1a-4c3b-9e5f-6a7b8c9d0e1f';

    interface ChargeOptions {
      method?: PaymentMethod;
      status?: PaymentStatus;
      checkoutSessionId?: string | null;
      type?: PaymentType;
    }

    const charge = ({
      method: paymentMethod = PaymentMethod.COD,
      status = PaymentStatus.PENDING,
      checkoutSessionId = null,
      type = PaymentType.CHARGE,
    }: ChargeOptions = {}) => ({
      id: `payment-${paymentMethod}-${status}`,
      type,
      method: paymentMethod,
      status,
      checkoutSessionId,
      failureReason: null as string | null,
    });

    const orderWith = (
      status: OrderStatus = OrderStatus.PENDING,
      payments = [charge()],
    ) =>
      ({
        id: ORDER_ID,
        status,
        expiresAt: new Date('2026-11-24T12:00:00Z'),
        items: {
          getItems: () => [
            { productVariant: { id: 'variant-b' }, quantity: 1 },
            { productVariant: { id: 'variant-a' }, quantity: 2 },
          ],
        },
        payments: { getItems: () => payments },
      }) as unknown as Order & {
        payments: { getItems: () => typeof payments };
      };

    it('cancel releases each item, fails the PENDING charge and cancels the order in one save', async () => {
      const order = orderWith();
      orderRepository.lockMineForCancel.mockResolvedValue(order);

      await expect(service.cancel(USER_ID, ORDER_ID)).resolves.toBe(response);

      expect(productVariantService.release).toHaveBeenNthCalledWith(
        1,
        'variant-a',
        2,
        USER_ID,
      );
      expect(productVariantService.release).toHaveBeenNthCalledWith(
        2,
        'variant-b',
        1,
        USER_ID,
      );
      const [payment] = order.payments.getItems();
      expect(payment.status).toBe(PaymentStatus.FAILED);
      expect(payment.failureReason).toBe('Cancelled');
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(order.expiresAt).toBeNull();
      expect(orderRepository.saveCancelled).toHaveBeenCalledTimes(1);
      expect(orderRepository.saveCancelled).toHaveBeenCalledWith(
        order,
        USER_ID,
      );
      expect(fromEntity).toHaveBeenCalledWith(order);
    });

    it("cancel looks up by id for a UUID and by orderNumber otherwise, and 404s another user's order", async () => {
      orderRepository.lockMineForCancel.mockResolvedValueOnce(orderWith());
      await service.cancel(USER_ID, ORDER_ID);
      orderRepository.lockMineForCancel.mockResolvedValueOnce(orderWith());
      await service.cancel(USER_ID, 'CH-261124-0001');

      expect(orderRepository.lockMineForCancel).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        { id: ORDER_ID },
      );
      expect(orderRepository.lockMineForCancel).toHaveBeenNthCalledWith(
        2,
        USER_ID,
        { orderNumber: 'CH-261124-0001' },
      );

      orderRepository.lockMineForCancel.mockResolvedValueOnce(null);
      const error = await errorOf(service.cancel(USER_ID, 'CH-0'));
      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.NOT_FOUND,
        field: 'idOrOrderNumber',
      });
    });

    it('cancel rejects a non-PENDING order with statusNotAllowed on status and saves nothing', async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(
        orderWith(OrderStatus.CONFIRMED, [
          charge({ method: PaymentMethod.CARD, checkoutSessionId: 'cs_1' }),
        ]),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'status',
        message: 'Order cannot be cancelled: it is confirmed',
      });
      expect(productVariantService.release).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
      expect(enqueueCheckoutExpire).not.toHaveBeenCalled();
    });

    it('cancel rejects an order with a PAID charge with statusNotAllowed on paymentStatus', async () => {
      const paid = [
        charge({ method: PaymentMethod.CARD, status: PaymentStatus.PAID }),
      ];
      orderRepository.lockMineForCancel.mockResolvedValueOnce(
        orderWith(OrderStatus.PENDING, paid),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'paymentStatus',
        message: 'Order cannot be cancelled: it is paid',
      });
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();

      orderRepository.lockMineForCancel.mockResolvedValueOnce(
        orderWith(OrderStatus.CONFIRMED, paid),
      );
      const confirmed = await errorOf(service.cancel(USER_ID, ORDER_ID));
      expect(confirmed.getErrors()[0]).toMatchObject({ field: 'status' });
    });

    it('cancel throws and saves nothing when a release changes no row', async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(orderWith());
      productVariantService.release.mockResolvedValueOnce(false);

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainException);
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
    });

    it('cancel enqueues payment.checkout-expire only for a charge with a checkout session', async () => {
      const card = charge({
        method: PaymentMethod.CARD,
        checkoutSessionId: 'cs_1',
      });
      orderRepository.lockMineForCancel.mockResolvedValueOnce(
        orderWith(OrderStatus.PENDING, [card]),
      );
      await service.cancel(USER_ID, ORDER_ID);

      expect(enqueueCheckoutExpire).toHaveBeenCalledTimes(1);
      expect(enqueueCheckoutExpire).toHaveBeenCalledWith({
        paymentId: card.id,
        method: PaymentMethod.CARD,
        checkoutSessionId: 'cs_1',
      });

      enqueueCheckoutExpire.mockClear();
      orderRepository.lockMineForCancel.mockResolvedValueOnce(orderWith());
      await service.cancel(USER_ID, ORDER_ID);
      expect(enqueueCheckoutExpire).not.toHaveBeenCalled();
    });

    it('cancel locks the charges before the order', async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(orderWith());

      await service.cancel(USER_ID, ORDER_ID);

      expect(orderRepository.transactionalWithOutbox).toHaveBeenCalledTimes(1);
      expect(orderRepository.lockMineForCancel).toHaveBeenCalledTimes(1);
      expect(orderRepository.findMineByIdOrNumber).not.toHaveBeenCalled();
      expect(orderRepository.transactional).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it("findAll maps the repository's orders through ResponseOrderRowDto", async () => {
      const order = { id: 'order-1' } as Order;
      const row = { id: 'order-1' } as ResponseOrderRowDto;
      const meta = { limit: 10, currentPage: 1, pageCount: 1, totalCount: 1 };
      orderRepository.findAll.mockResolvedValue({ data: [order], meta });
      const rowOf = vi
        .spyOn(ResponseOrderRowDto, 'fromEntity')
        .mockReturnValue(row);

      const result = await service.findAll({
        page: 2,
        limit: 10,
        search: 'lan',
        sort: 'createdAt',
        order: 'DESC',
        all: true,
      });

      expect(result).toEqual({ data: [row], meta });
      expect(rowOf).toHaveBeenCalledWith(order);
      expect(orderRepository.findAll).toHaveBeenCalledWith(
        { page: 2, limit: 10 },
        { search: 'lan', sort: 'createdAt', order: 'DESC', all: true },
      );
    });
  });

  describe('findAnyOne', () => {
    const ORDER_ID = '8b0c6f2e-4d1a-4c3b-9e5f-6a7b8c9d0e1f';

    it('findAnyOne reads by id for a UUID and by orderNumber otherwise', async () => {
      const order = { id: ORDER_ID } as Order;
      const detail = { id: ORDER_ID } as ResponseOrderDetailDto;
      orderRepository.findAnyByIdOrNumber.mockResolvedValue(order);
      const detailOf = vi
        .spyOn(ResponseOrderDetailDto, 'fromEntity')
        .mockReturnValue(detail);

      await expect(service.findAnyOne(ORDER_ID)).resolves.toBe(detail);
      await service.findAnyOne('CH-261124-0001');

      expect(orderRepository.findAnyByIdOrNumber).toHaveBeenNthCalledWith(1, {
        id: ORDER_ID,
      });
      expect(orderRepository.findAnyByIdOrNumber).toHaveBeenNthCalledWith(2, {
        orderNumber: 'CH-261124-0001',
      });
      expect(detailOf).toHaveBeenCalledWith(order);
    });

    it('findAnyOne throws orderNotFound when the repository returns null', async () => {
      orderRepository.findAnyByIdOrNumber.mockResolvedValue(null);

      const error = await errorOf(service.findAnyOne('CH-0'));

      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.NOT_FOUND,
        field: 'idOrOrderNumber',
      });
    });
  });
});
