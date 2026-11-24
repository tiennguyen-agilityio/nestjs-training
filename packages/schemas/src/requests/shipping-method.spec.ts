import {
  createShippingMethodSchema,
  updateShippingMethodSchema,
} from './shipping-method.js';

const body = {
  name: 'Roast Express',
  description: '1-2 business days',
  price: 12,
};

const issuePaths = (input: unknown) =>
  createShippingMethodSchema
    .safeParse(input)
    .error?.issues.map(({ path }) => path);

describe('createShippingMethodSchema', () => {
  it('accepts a full body and trims name and description', () => {
    expect(
      createShippingMethodSchema.parse({
        name: '  Roast Express ',
        description: ' 1-2 business days ',
        price: 12,
        status: 'INACTIVE',
      }),
    ).toEqual({
      name: 'Roast Express',
      description: '1-2 business days',
      price: 12,
      status: 'INACTIVE',
    });
  });

  it('leaves status out when it is not sent', () => {
    expect(createShippingMethodSchema.parse(body)).toEqual(body);
  });

  it.each([0, 0.07, 12.3, 99999999.99])('accepts price %s', (price) => {
    expect(
      createShippingMethodSchema.safeParse({ ...body, price }).success,
    ).toBe(true);
  });

  it.each([-1, 12.345, 100000000, '12'])('rejects price %s', (price) => {
    expect(issuePaths({ ...body, price })).toEqual([['price']]);
  });

  it('rejects a name of only spaces', () => {
    expect(issuePaths({ ...body, name: '   ' })).toEqual([['name']]);
  });

  it('rejects a 1-character name after trim', () => {
    expect(issuePaths({ ...body, name: ' a ' })).toEqual([['name']]);
  });

  it('rejects a 121-character name', () => {
    expect(issuePaths({ ...body, name: 'a'.repeat(121) })).toEqual([['name']]);
  });

  it('rejects a description of only spaces', () => {
    expect(issuePaths({ ...body, description: '   ' })).toEqual([
      ['description'],
    ]);
  });

  it('rejects status "DELETED"', () => {
    expect(issuePaths({ ...body, status: 'DELETED' })).toEqual([['status']]);
  });
});

describe('updateShippingMethodSchema', () => {
  it('accepts {}', () => {
    expect(updateShippingMethodSchema.parse({})).toEqual({});
  });

  it("accepts { status: 'INACTIVE' } alone", () => {
    expect(updateShippingMethodSchema.parse({ status: 'INACTIVE' })).toEqual({
      status: 'INACTIVE',
    });
  });
});
