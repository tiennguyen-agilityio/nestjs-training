import { z } from 'zod';
import { PaymentMethod, VALIDATION_RULES } from '@repo/constants';
import { nameField } from '../fields/text.js';

const { ORDER, PHONE } = VALIDATION_RULES;

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
