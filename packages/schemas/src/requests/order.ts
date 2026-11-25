import { z } from 'zod';
import {
  OrderStatus,
  PaymentMethod,
  ShippingStatus,
  VALIDATION_RULES,
} from '@repo/constants';
import { nameField } from '../fields/text.js';

const { ORDER, PHONE, PRICE } = VALIDATION_RULES;

const addressField = z.string().trim().min(1).max(ORDER.ADDRESS_MAX_LENGTH);

export const placeOrderSchema = z.object({
  shippingMethodId: z.uuid(),
  paymentMethod: z.enum(PaymentMethod),
  recipientName: nameField,
  recipientPhone: z.string().regex(PHONE.REGEX),
  addressLine: addressField,
  ward: addressField,
  district: addressField,
  city: addressField,
  postalCode: z.string().trim().min(1).max(ORDER.POSTAL_CODE_MAX_LENGTH),
  note: z.string().max(ORDER.NOTE_MAX_LENGTH).optional(),
});

export type PlaceOrderPayload = z.input<typeof placeOrderSchema>;

// Every value is accepted: a move the rules refuse (PENDING again, say) is a
// 409 from the API, not a 400.
export const updateOrderStatusSchema = z.object({
  status: z.enum(OrderStatus),
});

export type UpdateOrderStatusPayload = z.input<typeof updateOrderStatusSchema>;

export const updateOrderShippingStatusSchema = z.object({
  shippingStatus: z.enum(ShippingStatus),
});

export type UpdateOrderShippingStatusPayload = z.input<
  typeof updateOrderShippingStatusSchema
>;

export const createRefundSchema = z.object({
  amount: z
    .number()
    .min(0.01)
    .max(PRICE.MAX)
    .refine((value) => Math.round(value * 100) / 100 === value),
});

export type CreateRefundPayload = z.input<typeof createRefundSchema>;
