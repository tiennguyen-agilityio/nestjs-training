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
  ShippingStatus,
} from '@repo/constants';
import { OrderService } from './order.service.js';
import { RefundService } from './refund.service.js';
import { ResponsePaymentDto } from '../dto/response-order.dto.js';
import { OrderRepository } from '../repositories/order.repository.js';
import { CartService } from '../../cart/services/cart.service.js';
import { ProductVariantService } from '../../product-variant/services/product-variant.service.js';
import { ShippingMethodService } from '../../shipping-method/services/shipping-method.service.js';
import { UserAddressService } from '../../user/services/user-address.service.js';
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
import {
  ERROR_DESCRIPTIONS,
  ERROR_MESSAGES,
} from '../../../common/constants/message.constant.js';

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
    | 'lockForStatusChange'
    | 'lockForPayment'
    | 'save'
    | 'saveCancelled'
    | 'saveDelivered',
    Mock
  >;
  let enqueueCheckoutExpire: Mock;
  let enqueueRefund: Mock;
  let refundService: Record<'startLocked' | 'retryLocked', Mock>;
  let cartService: Record<'lockForCheckout' | 'clearItems', Mock>;
  let productVariantService: Record<
    'reserve' | 'reload' | 'release' | 'sell',
    Mock
  >;
  let shippingMethodService: Record<'findForOrder', Mock>;
  let userAddressService: Record<'saveFirstAsDefault', Mock>;
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
    enqueueRefund = vi.fn();
    refundService = {
      startLocked: vi.fn().mockResolvedValue(null),
      retryLocked: vi.fn(),
    };
    orderRepository = {
      transactional: vi.fn((work: () => Promise<unknown>) => work()),
      create: vi.fn().mockResolvedValue(created),
      existsByNumber: vi.fn().mockResolvedValue(false),
      findMine: vi.fn(),
      findAll: vi.fn(),
      findMineByIdOrNumber: vi.fn(),
      findAnyByIdOrNumber: vi.fn(),
      transactionalWithOutbox: vi.fn(
        (work: (expire: Mock, refund: Mock) => Promise<unknown>) =>
          work(enqueueCheckoutExpire, enqueueRefund),
      ),
      lockMineForCancel: vi.fn(),
      lockForStatusChange: vi.fn(),
      lockForPayment: vi.fn(),
      save: vi.fn(),
      saveCancelled: vi.fn(),
      saveDelivered: vi.fn(),
    };
    cartService = {
      lockForCheckout: vi.fn().mockResolvedValue(cartWith(lineOf())),
      clearItems: vi.fn(),
    };
    productVariantService = {
      reserve: vi.fn().mockResolvedValue(true),
      reload: vi.fn((variant: unknown) => Promise.resolve(variant)),
      release: vi.fn().mockResolvedValue(true),
      sell: vi.fn().mockResolvedValue(true),
    };
    shippingMethodService = {
      findForOrder: vi.fn().mockResolvedValue(method()),
    };
    userAddressService = { saveFirstAsDefault: vi.fn() };
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
        { provide: UserAddressService, useValue: userAddressService },
        { provide: RefundService, useValue: refundService },
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

  it('place saves the order address as the first default address', async () => {
    await service.place(USER_ID, input());

    expect(userAddressService.saveFirstAsDefault).toHaveBeenCalledTimes(1);
    expect(userAddressService.saveFirstAsDefault).toHaveBeenCalledWith(
      USER_ID,
      {
        addressLine: '12 Le Loi',
        ward: 'Ben Nghe',
        district: 'District 1',
        city: 'Ho Chi Minh City',
        postalCode: '700000',
      },
    );
    const saveOrder =
      userAddressService.saveFirstAsDefault.mock.invocationCallOrder[0];
    expect(orderRepository.create.mock.invocationCallOrder[0]).toBeLessThan(
      saveOrder,
    );
    expect(saveOrder).toBeLessThan(
      cartService.clearItems.mock.invocationCallOrder[0],
    );
  });

  it('place saves no address when the cart is empty', async () => {
    cartService.lockForCheckout.mockResolvedValueOnce(cartWith());

    await errorOf(service.place(USER_ID, input()));

    expect(userAddressService.saveFirstAsDefault).not.toHaveBeenCalled();
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

    it('findMineOne returns no allowed statuses', async () => {
      const order = { id: ORDER_ID } as Order;
      orderRepository.findMineByIdOrNumber.mockResolvedValue(order);
      const detailOf = vi
        .spyOn(ResponseOrderDetailDto, 'fromEntity')
        .mockReturnValue({} as ResponseOrderDetailDto);

      await service.findMineOne(USER_ID, ORDER_ID);

      expect(detailOf).toHaveBeenCalledWith(order);
      expect(detailOf.mock.calls[0]).toHaveLength(1);
    });

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
      transactionId?: string | null;
    }

    const charge = ({
      method: paymentMethod = PaymentMethod.COD,
      status = PaymentStatus.PENDING,
      checkoutSessionId = null,
      type = PaymentType.CHARGE,
      transactionId = null,
    }: ChargeOptions = {}) => ({
      id: `payment-${paymentMethod}-${status}`,
      type,
      method: paymentMethod,
      status,
      checkoutSessionId,
      transactionId,
      failureReason: null as string | null,
    });

    const orderWith = (
      status: OrderStatus = OrderStatus.PENDING,
      payments = [charge()],
      shippingStatus: ShippingStatus = ShippingStatus.PENDING,
    ) =>
      ({
        id: ORDER_ID,
        status,
        shippingStatus,
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

    it('cancel of a returned order names its status, not the shipping', async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(
        orderWith(OrderStatus.CANCELLED, [charge()], ShippingStatus.RETURNED),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error.getErrors()[0]).toMatchObject({
        field: 'status',
        message: ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('cancelled'),
      });
    });

    it("cancel refuses a shopper's order whose shipping has started", async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(
        orderWith(OrderStatus.PENDING, [charge()], ShippingStatus.SHIPPING),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'shippingStatus',
        message: ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('shipped'),
        description: ERROR_DESCRIPTIONS.ORDER.NOT_CANCELLABLE_SHIPPED_SHOPPER,
      });
      expect(productVariantService.release).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
    });

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

    it('cancel rejects a COMPLETED order with statusNotAllowed on status and saves nothing', async () => {
      orderRepository.lockMineForCancel.mockResolvedValue(
        orderWith(OrderStatus.COMPLETED, [
          charge({ method: PaymentMethod.CARD, status: PaymentStatus.PAID }),
        ]),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'status',
        message: 'Order cannot be cancelled: it is completed',
      });
      expect(productVariantService.release).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
      expect(refundService.startLocked).not.toHaveBeenCalled();
    });

    it('cancel of a CONFIRMED paid card order cancels it and starts a refund of the rest', async () => {
      const paid = charge({
        method: PaymentMethod.CARD,
        status: PaymentStatus.PAID,
        checkoutSessionId: 'cs_1',
        transactionId: 'pi_1',
      });
      const order = orderWith(OrderStatus.CONFIRMED, [paid]);
      orderRepository.lockMineForCancel.mockResolvedValue(order);

      await service.cancel(USER_ID, ORDER_ID);

      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(paid.status).toBe(PaymentStatus.PAID);
      expect(productVariantService.release).toHaveBeenCalledTimes(2);
      expect(orderRepository.saveCancelled).toHaveBeenCalledWith(
        order,
        USER_ID,
      );
      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        'rest',
        USER_ID,
        enqueueRefund,
      );
    });

    it('cancel of a CONFIRMED PayPal order refunds through PayPal', async () => {
      const paid = charge({
        method: PaymentMethod.PAYPAL,
        status: PaymentStatus.PAID,
        transactionId: 'CAPTURE-1',
      });
      const order = orderWith(OrderStatus.CONFIRMED, [paid]);
      orderRepository.lockMineForCancel.mockResolvedValue(order);

      await service.cancel(USER_ID, ORDER_ID);

      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        'rest',
        USER_ID,
        enqueueRefund,
      );
    });

    it('cancel rejects an order whose charge the gateway holds for review', async () => {
      orderRepository.lockMineForCancel.mockResolvedValueOnce(
        orderWith(OrderStatus.PENDING, [
          charge({
            method: PaymentMethod.PAYPAL,
            status: PaymentStatus.PENDING,
            transactionId: 'CAPTURE-1',
          }),
        ]),
      );

      const error = await errorOf(service.cancel(USER_ID, ORDER_ID));

      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'paymentStatus',
        message: 'Order cannot be cancelled: it is under payment review',
      });
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
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

    const detailOrder = () =>
      ({
        id: ORDER_ID,
        status: OrderStatus.CONFIRMED,
        shippingStatus: ShippingStatus.SHIPPING,
        payments: {
          getItems: () => [
            {
              type: PaymentType.CHARGE,
              method: PaymentMethod.COD,
              status: PaymentStatus.PENDING,
              transactionId: null,
            },
          ],
        },
      }) as unknown as Order;

    it('findAnyOne returns the allowed statuses', async () => {
      const order = detailOrder();
      orderRepository.findAnyByIdOrNumber.mockResolvedValue(order);
      const detailOf = vi
        .spyOn(ResponseOrderDetailDto, 'fromEntity')
        .mockReturnValue({} as ResponseOrderDetailDto);

      await service.findAnyOne(ORDER_ID);

      expect(detailOf).toHaveBeenCalledWith(order, {
        statuses: [],
        shippingStatuses: [ShippingStatus.DELIVERED, ShippingStatus.RETURNED],
      });
    });

    it('findAnyOne reads by id for a UUID and by orderNumber otherwise', async () => {
      const order = detailOrder();
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
      expect(detailOf).toHaveBeenCalledWith(order, expect.any(Object));
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
  describe('updateStatus and updateShippingStatus', () => {
    const ORDER_ID = '5d2e8a1f-3b4c-4d6e-8f9a-0b1c2d3e4f5a';
    const ADMIN_ID = 'admin-1';

    const charge = (
      status: PaymentStatus = PaymentStatus.PENDING,
      checkoutSessionId: string | null = null,
      paymentMethod: PaymentMethod = PaymentMethod.COD,
      transactionId: string | null = null,
    ) => ({
      id: `payment-${paymentMethod}-${status}`,
      type: PaymentType.CHARGE,
      method: paymentMethod,
      status,
      checkoutSessionId,
      transactionId,
      failureReason: null as string | null,
    });

    const refusalOf = async (
      run: Promise<unknown>,
      field: 'status' | 'shippingStatus',
      message: string,
    ) => {
      const error = await errorOf(run);
      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field,
        message,
      });
      expect(orderRepository.save).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
      expect(productVariantService.release).not.toHaveBeenCalled();
    };

    it('updateStatus refuses CONFIRMED on an unpaid card order', async () => {
      const order = orderWith(OrderStatus.PENDING, ShippingStatus.PENDING, [
        charge(PaymentStatus.PENDING, 'cs_1', PaymentMethod.CARD),
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateStatus(ORDER_ID, OrderStatus.CONFIRMED, ADMIN_ID),
        'status',
        ERROR_MESSAGES.ORDER.NOT_CONFIRMABLE_UNPAID,
      );
      expect(order.status).toBe(OrderStatus.PENDING);
    });

    it('updateStatus refuses CANCELLED once shipping has started', async () => {
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID),
        'status',
        ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('shipped'),
      );
      expect(order.status).toBe(OrderStatus.CONFIRMED);
    });

    it('updateStatus refuses CANCELLED while the payment is held', async () => {
      const order = orderWith(OrderStatus.PENDING, ShippingStatus.PENDING, [
        charge(PaymentStatus.PENDING, 'cs_1', PaymentMethod.CARD, 'pi_1'),
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID),
        'status',
        ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
      );
      const error = await errorOf(
        service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID),
      );
      expect(error.getErrors()[0].description).toBe(
        ERROR_DESCRIPTIONS.ORDER.PAYMENT_HELD_ADMIN,
      );
    });

    it('updateStatus refuses COMPLETED before DELIVERED', async () => {
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateStatus(ORDER_ID, OrderStatus.COMPLETED, ADMIN_ID),
        'status',
        ERROR_MESSAGES.ORDER.NOT_COMPLETABLE_UNDELIVERED,
      );
    });

    it('updateStatus still refuses a move outside the table with STATUS_NOT_ALLOWED', async () => {
      orderRepository.lockForStatusChange.mockResolvedValue(
        orderWith(OrderStatus.CANCELLED),
      );

      await refusalOf(
        service.updateStatus(ORDER_ID, OrderStatus.CONFIRMED, ADMIN_ID),
        'status',
        ERROR_MESSAGES.ORDER.STATUS_NOT_ALLOWED('CANCELLED', 'CONFIRMED'),
      );
    });

    it('updateShippingStatus refuses RETURNED while the payment is held', async () => {
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING, [
        charge(PaymentStatus.PENDING, 'cs_1', PaymentMethod.CARD, 'pi_1'),
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.RETURNED,
          ADMIN_ID,
        ),
        'shippingStatus',
        ERROR_MESSAGES.ORDER.NOT_CANCELLABLE('under payment review'),
      );
      expect(order.shippingStatus).toBe(ShippingStatus.SHIPPING);
      const error = await errorOf(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.RETURNED,
          ADMIN_ID,
        ),
      );
      expect(error.getErrors()[0].description).toBe(
        ERROR_DESCRIPTIONS.ORDER.PAYMENT_HELD_ADMIN,
      );
    });

    it('updateShippingStatus refuses SHIPPING on a PENDING order', async () => {
      const order = orderWith();
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await refusalOf(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.SHIPPING,
          ADMIN_ID,
        ),
        'shippingStatus',
        ERROR_MESSAGES.ORDER.SHIPPING_NEEDS_CONFIRMED,
      );
      expect(order.shippingStatus).toBe(ShippingStatus.PENDING);
    });

    const orderWith = (
      status: OrderStatus = OrderStatus.PENDING,
      shippingStatus: ShippingStatus = ShippingStatus.PENDING,
      payments = [charge()],
    ) =>
      ({
        id: ORDER_ID,
        status,
        shippingStatus,
        expiresAt: new Date('2026-11-25T12:00:00Z'),
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

    it('updateStatus moves a PENDING order to CONFIRMED (AC1)', async () => {
      const order = orderWith();
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await expect(
        service.updateStatus(ORDER_ID, OrderStatus.CONFIRMED, ADMIN_ID),
      ).resolves.toBe(response);

      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(orderRepository.save).toHaveBeenCalledWith(order, ADMIN_ID);
      expect(productVariantService.release).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
      expect(fromEntity).toHaveBeenCalledWith(order);
    });

    it('updateStatus refuses COMPLETED → PENDING with statusNotAllowed and saves nothing (AC2)', async () => {
      const order = orderWith(OrderStatus.COMPLETED);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      const error = await errorOf(
        service.updateStatus(ORDER_ID, OrderStatus.PENDING, ADMIN_ID),
      );

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'status',
        message: 'Cannot move order from COMPLETED to PENDING',
      });
      expect(orderRepository.save).not.toHaveBeenCalled();
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
      expect(order.status).toBe(OrderStatus.COMPLETED);
    });

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED])(
      'updateStatus CANCELLED from %s runs the cancel steps',
      async (from) => {
        const card = charge(PaymentStatus.PENDING, 'cs_1', PaymentMethod.CARD);
        const order = orderWith(from, ShippingStatus.PENDING, [card]);
        orderRepository.lockForStatusChange.mockResolvedValue(order);

        await expect(
          service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID),
        ).resolves.toBe(response);

        expect(productVariantService.release).toHaveBeenNthCalledWith(
          1,
          'variant-a',
          2,
          ADMIN_ID,
        );
        expect(productVariantService.release).toHaveBeenNthCalledWith(
          2,
          'variant-b',
          1,
          ADMIN_ID,
        );
        expect(card.status).toBe(PaymentStatus.FAILED);
        expect(card.failureReason).toBe('Cancelled');
        expect(order.status).toBe(OrderStatus.CANCELLED);
        expect(order.expiresAt).toBeNull();
        expect(orderRepository.saveCancelled).toHaveBeenCalledWith(
          order,
          ADMIN_ID,
        );
        expect(orderRepository.save).not.toHaveBeenCalled();
        expect(enqueueCheckoutExpire).toHaveBeenCalledWith({
          paymentId: card.id,
          method: PaymentMethod.CARD,
          checkoutSessionId: 'cs_1',
        });
      },
    );

    it('updateStatus CANCELLED keeps a PAID charge', async () => {
      const paid = charge(PaymentStatus.PAID, null, PaymentMethod.CARD);
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.PENDING, [
        paid,
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID);

      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(paid.status).toBe(PaymentStatus.PAID);
      expect(paid.failureReason).toBeNull();
      expect(orderRepository.saveCancelled).toHaveBeenCalledTimes(1);
    });

    it('updateStatus throws and saves nothing when a release fails', async () => {
      orderRepository.lockForStatusChange.mockResolvedValue(orderWith());
      productVariantService.release.mockResolvedValueOnce(false);

      const error = await errorOf(
        service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID),
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainException);
      expect(orderRepository.saveCancelled).not.toHaveBeenCalled();
    });

    it('updateStatus of an unknown order throws orderNotFound', async () => {
      orderRepository.lockForStatusChange.mockResolvedValue(null);

      const error = await errorOf(
        service.updateStatus('CH-0', OrderStatus.CONFIRMED, ADMIN_ID),
      );

      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.ORDER.NOT_FOUND,
        field: 'idOrOrderNumber',
      });
    });

    it('updateStatus locks the order through lockForStatusChange', async () => {
      orderRepository.lockForStatusChange.mockResolvedValueOnce(orderWith());
      await service.updateStatus(ORDER_ID, OrderStatus.CONFIRMED, ADMIN_ID);
      orderRepository.lockForStatusChange.mockResolvedValueOnce(orderWith());
      await service.updateStatus(
        'CH-260412-0007',
        OrderStatus.CONFIRMED,
        ADMIN_ID,
      );

      expect(orderRepository.lockForStatusChange).toHaveBeenNthCalledWith(1, {
        id: ORDER_ID,
      });
      expect(orderRepository.lockForStatusChange).toHaveBeenNthCalledWith(2, {
        orderNumber: 'CH-260412-0007',
      });
      expect(orderRepository.transactionalWithOutbox).toHaveBeenCalledTimes(2);
      expect(orderRepository.lockMineForCancel).not.toHaveBeenCalled();
    });

    it('cancel of a paid card order starts a refund of the rest', async () => {
      const paid = charge(
        PaymentStatus.PAID,
        'cs_1',
        PaymentMethod.CARD,
        'pi_1',
      );
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.PENDING, [
        paid,
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID);

      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        'rest',
        ADMIN_ID,
        enqueueRefund,
      );
      expect(
        orderRepository.saveCancelled.mock.invocationCallOrder[0],
      ).toBeLessThan(refundService.startLocked.mock.invocationCallOrder[0]);
    });

    it('RETURNED of a paid order starts a refund of the rest', async () => {
      const paid = charge(
        PaymentStatus.PAID,
        'cs_1',
        PaymentMethod.CARD,
        'pi_1',
      );
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING, [
        paid,
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await service.updateShippingStatus(
        ORDER_ID,
        ShippingStatus.RETURNED,
        ADMIN_ID,
      );

      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        'rest',
        ADMIN_ID,
        enqueueRefund,
      );
    });

    it('cancel of a COD order starts no refund', async () => {
      const order = orderWith(OrderStatus.CONFIRMED);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await service.updateStatus(ORDER_ID, OrderStatus.CANCELLED, ADMIN_ID);

      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        'rest',
        ADMIN_ID,
        enqueueRefund,
      );
      await expect(
        refundService.startLocked.mock.results[0].value,
      ).resolves.toBeNull();
    });

    it('refund locks the order and returns the new refund', async () => {
      const order = orderWith(OrderStatus.CANCELLED);
      const refund = { id: 'refund-1' };
      const dto = { id: 'refund-1' } as ResponsePaymentDto;
      orderRepository.lockForStatusChange.mockResolvedValue(order);
      refundService.startLocked.mockResolvedValue(refund);
      const toDto = vi
        .spyOn(ResponsePaymentDto, 'fromEntity')
        .mockReturnValue(dto);

      await expect(service.refund('CH-1', 12.5, ADMIN_ID)).resolves.toBe(dto);

      expect(orderRepository.lockForStatusChange).toHaveBeenCalledWith({
        orderNumber: 'CH-1',
      });
      expect(refundService.startLocked).toHaveBeenCalledWith(
        order,
        12.5,
        ADMIN_ID,
        enqueueRefund,
      );
      expect(toDto).toHaveBeenCalledWith(refund);
    });

    it("retryRefund locks the payment's order", async () => {
      const order = orderWith(OrderStatus.CANCELLED);
      const refund = { id: 'refund-2' };
      const dto = { id: 'refund-2' } as ResponsePaymentDto;
      orderRepository.lockForPayment.mockResolvedValue(order);
      refundService.retryLocked.mockResolvedValue(refund);
      vi.spyOn(ResponsePaymentDto, 'fromEntity').mockReturnValue(dto);

      await expect(service.retryRefund('refund-1', ADMIN_ID)).resolves.toBe(
        dto,
      );

      expect(orderRepository.lockForPayment).toHaveBeenCalledWith('refund-1');
      expect(refundService.retryLocked).toHaveBeenCalledWith(
        order,
        'refund-1',
        ADMIN_ID,
        enqueueRefund,
      );
    });

    it('retryRefund of an unknown payment throws paymentNotFound', async () => {
      orderRepository.lockForPayment.mockResolvedValue(null);

      const error = await errorOf(service.retryRefund('missing', ADMIN_ID));

      expect(error).toBeInstanceOf(ItemNotFoundException);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: ERROR_CODES.PAYMENT.NOT_FOUND,
        field: 'id',
      });
    });

    it('updateShippingStatus moves PENDING to SHIPPING (AC3)', async () => {
      const order = orderWith(OrderStatus.CONFIRMED);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await expect(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.SHIPPING,
          ADMIN_ID,
        ),
      ).resolves.toBe(response);

      expect(order.shippingStatus).toBe(ShippingStatus.SHIPPING);
      expect(order.status).toBe(OrderStatus.CONFIRMED);
      expect(orderRepository.save).toHaveBeenCalledWith(order, ADMIN_ID);
    });

    it('updateShippingStatus refuses DELIVERED → SHIPPING with statusNotAllowed', async () => {
      const order = orderWith(OrderStatus.PENDING, ShippingStatus.DELIVERED);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      const error = await errorOf(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.SHIPPING,
          ADMIN_ID,
        ),
      );

      expect(error).toBeInstanceOf(InvalidStateException);
      expect(error.getStatus()).toBe(409);
      expect(error.getErrors()[0]).toMatchObject({
        errCode: 'statusNotAllowed',
        field: 'shippingStatus',
        message: 'Cannot move shipping from DELIVERED to SHIPPING',
      });
      expect(orderRepository.save).not.toHaveBeenCalled();
      expect(order.shippingStatus).toBe(ShippingStatus.DELIVERED);
    });

    it('updateShippingStatus DELIVERED sells each item and marks the COD charge PAID', async () => {
      const cod = charge();
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING, [
        cod,
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await expect(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.DELIVERED,
          ADMIN_ID,
        ),
      ).resolves.toBe(response);

      expect(productVariantService.sell).toHaveBeenNthCalledWith(
        1,
        'variant-a',
        2,
        ADMIN_ID,
      );
      expect(productVariantService.sell).toHaveBeenNthCalledWith(
        2,
        'variant-b',
        1,
        ADMIN_ID,
      );
      expect(order.shippingStatus).toBe(ShippingStatus.DELIVERED);
      expect(cod.status).toBe(PaymentStatus.PAID);
      expect((cod as { completedAt?: Date }).completedAt).toBeInstanceOf(Date);
      expect(orderRepository.saveDelivered).toHaveBeenCalledWith(
        order,
        ADMIN_ID,
      );
      expect(orderRepository.save).not.toHaveBeenCalled();
    });

    it('updateShippingStatus DELIVERED throws and saves nothing when a sale fails', async () => {
      orderRepository.lockForStatusChange.mockResolvedValue(
        orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING),
      );
      productVariantService.sell.mockResolvedValueOnce(false);

      const error = await errorOf(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.DELIVERED,
          ADMIN_ID,
        ),
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(DomainException);
      expect(orderRepository.saveDelivered).not.toHaveBeenCalled();
    });

    it('updateShippingStatus DELIVERED leaves an online charge as it is', async () => {
      const paid = charge(
        PaymentStatus.PAID,
        'cs_1',
        PaymentMethod.CARD,
        'pi_1',
      );
      orderRepository.lockForStatusChange.mockResolvedValue(
        orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING, [paid]),
      );

      await service.updateShippingStatus(
        ORDER_ID,
        ShippingStatus.DELIVERED,
        ADMIN_ID,
      );

      expect(paid.status).toBe(PaymentStatus.PAID);
      expect((paid as { completedAt?: Date }).completedAt).toBeUndefined();
      expect(orderRepository.saveDelivered).toHaveBeenCalledTimes(1);
    });

    it('updateShippingStatus RETURNED cancels the order and releases the stock', async () => {
      const paid = charge(
        PaymentStatus.PAID,
        'cs_1',
        PaymentMethod.CARD,
        'pi_1',
      );
      const order = orderWith(OrderStatus.CONFIRMED, ShippingStatus.SHIPPING, [
        paid,
      ]);
      orderRepository.lockForStatusChange.mockResolvedValue(order);

      await expect(
        service.updateShippingStatus(
          ORDER_ID,
          ShippingStatus.RETURNED,
          ADMIN_ID,
        ),
      ).resolves.toBe(response);

      expect(productVariantService.release).toHaveBeenNthCalledWith(
        1,
        'variant-a',
        2,
        ADMIN_ID,
      );
      expect(productVariantService.release).toHaveBeenNthCalledWith(
        2,
        'variant-b',
        1,
        ADMIN_ID,
      );
      expect(order.shippingStatus).toBe(ShippingStatus.RETURNED);
      expect(order.status).toBe(OrderStatus.CANCELLED);
      expect(paid.status).toBe(PaymentStatus.PAID);
      expect(orderRepository.saveCancelled).toHaveBeenCalledWith(
        order,
        ADMIN_ID,
      );
      expect(productVariantService.sell).not.toHaveBeenCalled();
      expect(enqueueCheckoutExpire).toHaveBeenCalledWith({
        paymentId: paid.id,
        method: PaymentMethod.CARD,
        checkoutSessionId: 'cs_1',
      });
    });
  });
});
