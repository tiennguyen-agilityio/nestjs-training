import type { StandardSchemaV1 } from '@standard-schema/spec';
import { toErrorDetailsFromStandardSchemaIssues } from './validation-error.util.js';
import { createCategorySchema } from '../../modules/category/dto/category.schema.js';
import {
  createProductSchema,
  updateProductSchema,
  productQuerySchema,
} from '../../modules/product/dto/product.schema.js';
import {
  RoastLevel,
  ProductUnit,
  VALIDATION_RULES,
  VALIDATION_MESSAGES,
} from '@repo/constants';
import { paginationQuerySchema } from '../dto/pagination.schema.js';
import { idParamSchema } from '../dto/id-param.schema.js';
import { createUserSchema } from '../../modules/user/dto/user.schema.js';
import { ERROR_CODES } from '../constants/error-code.constant.js';
import { ERROR_MESSAGES } from '../constants/message.constant.js';

describe('toErrorDetailsFromStandardSchemaIssues (Standard Schema pilot: createCategorySchema)', () => {
  const validate = async (input: unknown) =>
    createCategorySchema['~standard'].validate(input);

  it('has no issues for a valid name', async () => {
    const result = await validate({ name: 'Espresso' });

    expect(result.issues).toBeUndefined();
  });

  it('matches the baseline minLength body for a too-short name', async () => {
    const result = await validate({ name: 'a' });

    expect(toErrorDetailsFromStandardSchemaIssues(result.issues ?? [])).toEqual(
      [
        {
          errCode: ERROR_CODES.VALIDATION.MIN_LENGTH,
          field: 'name',
          message: 'Name must be longer than or equal to 2 characters',
          description: 'Too small: expected string to have >=2 characters',
        },
      ],
    );
  });

  it('maps a missing name to isNotEmpty', async () => {
    const result = await validate({});

    expect(toErrorDetailsFromStandardSchemaIssues(result.issues ?? [])).toEqual(
      [
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'name',
          message: 'Name should not be empty',
          description: 'Invalid input: expected string, received undefined',
        },
      ],
    );
  });

  it('maps a non-string name to isString', async () => {
    const result = await validate({ name: 123 });

    expect(toErrorDetailsFromStandardSchemaIssues(result.issues ?? [])).toEqual(
      [
        {
          errCode: ERROR_CODES.VALIDATION.IS_STRING,
          field: 'name',
          message: 'Name must be a string',
          description: 'Invalid input: expected string, received number',
        },
      ],
    );
  });
});

describe('toErrorDetailsFromStandardSchemaIssues (migrated schemas)', () => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const unit = Object.values(ProductUnit)[0];
  const validVariant = { sku: 'S1', size: 1, unit, price: 2 };
  const validImages = [
    { url: 'https://example.com/a.png', isPrimary: true },
    { url: 'https://example.com/b.png' },
  ];
  const validProduct = {
    categoryId: uuid,
    name: 'Espresso',
    roastLevel: RoastLevel.MEDIUM,
    description: 'A balanced, well-rounded coffee.',
    origin: 'Ethiopia',
    processingMethod: 'Washed',
    images: validImages,
    variants: [validVariant],
  };
  const roastLevels = Object.values(RoastLevel).join(', ');

  const run = (schema: StandardSchemaV1, input: unknown) =>
    Promise.resolve(schema['~standard'].validate(input));

  const errorsFor = async (schema: StandardSchemaV1, input: unknown) => {
    const result = await run(schema, input);
    return toErrorDetailsFromStandardSchemaIssues(result.issues ?? []).map(
      ({ errCode, field, message }) => ({ errCode, field, message }),
    );
  };

  it('keeps the raw Zod description for a non-numeric variant price', async () => {
    const result = await run(createProductSchema, {
      ...validProduct,
      variants: [{ ...validVariant, price: 'abc' }],
    });

    expect(
      toErrorDetailsFromStandardSchemaIssues(result.issues ?? []).map(
        ({ description }) => description,
      ),
    ).toEqual(['Invalid input: expected number, received NaN']);
  });

  describe('createProductSchema', () => {
    it('accepts a valid product and hands variants over with string decimals', async () => {
      const result = await run(createProductSchema, {
        ...validProduct,
        variants: [{ ...validVariant, size: 1.5, discountValue: '2' }],
      });

      expect(result.issues).toBeUndefined();
      expect(
        (result as { value: { variants: unknown[] } }).value.variants,
      ).toEqual([
        { ...validVariant, size: '1.5', price: '2', discountValue: '2' },
      ]);
    });

    it('accepts null for tastingNotes, the one still-nullable text column', async () => {
      const result = await run(createProductSchema, {
        ...validProduct,
        tastingNotes: null,
      });

      expect(result.issues).toBeUndefined();
    });

    it.each([
      [
        'a malformed categoryId',
        { ...validProduct, categoryId: 'x' },
        {
          errCode: ERROR_CODES.VALIDATION.IS_UUID,
          field: 'categoryId',
          message: 'CategoryId must be a UUID',
        },
      ],
      [
        'a UUID-shaped categoryId with an invalid version',
        { ...validProduct, categoryId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        {
          errCode: ERROR_CODES.VALIDATION.IS_UUID,
          field: 'categoryId',
          message: 'CategoryId must be a UUID',
        },
      ],
      [
        'an unknown roastLevel',
        { ...validProduct, roastLevel: 'BURNT' },
        {
          errCode: ERROR_CODES.VALIDATION.IS_ENUM,
          field: 'roastLevel',
          message: `RoastLevel must be one of the following values: ${roastLevels}`,
        },
      ],
      [
        'a non-boolean flag',
        { ...validProduct, isOrganic: 'yes' },
        {
          errCode: ERROR_CODES.VALIDATION.IS_BOOLEAN,
          field: 'isOrganic',
          message: 'IsOrganic must be a boolean value',
        },
      ],
      [
        'images that are not an array',
        { ...validProduct, images: 'x' },
        [
          {
            errCode: ERROR_CODES.VALIDATION.IS_ARRAY,
            field: 'images',
            message: 'Images must be an array',
          },
          {
            errCode: ERROR_CODES.VALIDATION.MIN_LENGTH,
            field: 'images',
            message: VALIDATION_MESSAGES.minLength(
              'Images',
              VALIDATION_RULES.IMAGE.MIN_COUNT,
            ),
          },
        ],
      ],
      [
        'more than six images',
        {
          ...validProduct,
          images: Array.from({ length: 7 }, (_, i) => ({
            url: 'https://example.com/a.png',
            isPrimary: i === 0,
          })),
        },
        {
          errCode: ERROR_CODES.VALIDATION.ARRAY_MAX_SIZE,
          field: 'images',
          message: 'Images must contain no more than 6 elements',
        },
      ],
      [
        'an image with a bad url',
        {
          ...validProduct,
          images: [
            { url: 'nope' },
            { url: 'https://example.com/ok.png', isPrimary: true },
          ],
        },
        {
          errCode: ERROR_CODES.VALIDATION.IS_URL,
          field: 'images.0.url',
          message: 'Url must be a URL address',
        },
      ],
      [
        'a negative image sortOrder',
        {
          ...validProduct,
          images: [
            {
              url: 'https://example.com/a.png',
              sortOrder: VALIDATION_RULES.IMAGE.MIN_SORT_ORDER - 1,
            },
            { url: 'https://example.com/b.png', isPrimary: true },
          ],
        },
        {
          errCode: ERROR_CODES.VALIDATION.MIN,
          field: 'images.0.sortOrder',
          message: `SortOrder must not be less than ${VALIDATION_RULES.IMAGE.MIN_SORT_ORDER}`,
        },
      ],
      [
        'a variant size below the minimum',
        {
          ...validProduct,
          variants: [{ ...validVariant, size: VALIDATION_RULES.SIZE.MIN - 1 }],
        },
        {
          errCode: ERROR_CODES.VALIDATION.MIN,
          field: 'variants.0.size',
          message: `Size must not be less than ${VALIDATION_RULES.SIZE.MIN}`,
        },
      ],
      [
        'labels a variant stockQuantity below the minimum',
        {
          ...validProduct,
          variants: [{ ...validVariant, stockQuantity: -1 }],
        },
        {
          errCode: ERROR_CODES.VALIDATION.MIN,
          field: 'variants.0.stockQuantity',
          message: 'StockQuantity must not be less than 0',
        },
      ],
      [
        'a non-numeric variant price',
        { ...validProduct, variants: [{ ...validVariant, price: 'abc' }] },
        {
          errCode: ERROR_CODES.VALIDATION.IS_NUMBER,
          field: 'variants.0.price',
          message:
            'Price must be a number conforming to the specified constraints',
        },
      ],
      [
        'an unknown variant unit',
        { ...validProduct, variants: [{ ...validVariant, unit: 'XX' }] },
        {
          errCode: ERROR_CODES.VALIDATION.IS_ENUM,
          field: 'variants.0.unit',
          message: `Unit must be one of the following values: ${Object.values(ProductUnit).join(', ')}`,
        },
      ],
      [
        'a name over the max length',
        {
          ...validProduct,
          name: 'a'.repeat(VALIDATION_RULES.NAME.MAX_LENGTH + 1),
        },
        {
          errCode: ERROR_CODES.VALIDATION.MAX_LENGTH,
          field: 'name',
          message: `Name must be shorter than or equal to ${VALIDATION_RULES.NAME.MAX_LENGTH} characters`,
        },
      ],
      [
        'fewer than the minimum number of images',
        { ...validProduct, images: [validImages[0]] },
        {
          errCode: ERROR_CODES.VALIDATION.ARRAY_MIN_SIZE,
          field: 'images',
          message: VALIDATION_MESSAGES.arrayMinSize(
            'Images',
            VALIDATION_RULES.IMAGE.MIN_COUNT,
          ),
        },
      ],
      [
        'images entirely missing',
        {
          categoryId: validProduct.categoryId,
          name: validProduct.name,
          roastLevel: validProduct.roastLevel,
          description: validProduct.description,
          origin: validProduct.origin,
          processingMethod: validProduct.processingMethod,
          variants: validProduct.variants,
        },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'images',
          message: 'Images should not be empty',
        },
      ],
      [
        'no image marked as primary',
        {
          ...validProduct,
          images: validImages.map((image) => ({
            ...image,
            isPrimary: false,
          })),
        },
        {
          errCode: ERROR_CODES.PRODUCT.PRIMARY_IMAGE_REQUIRED,
          field: 'images',
          message: ERROR_MESSAGES.PRODUCT.PRIMARY_IMAGE_REQUIRED,
        },
      ],
      [
        'a missing variants array',
        {
          categoryId: validProduct.categoryId,
          name: validProduct.name,
          roastLevel: validProduct.roastLevel,
          description: validProduct.description,
          origin: validProduct.origin,
          processingMethod: validProduct.processingMethod,
          images: validProduct.images,
        },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'variants',
          message: 'Variants should not be empty',
        },
      ],
      [
        'an empty variants array',
        { ...validProduct, variants: [] },
        {
          errCode: ERROR_CODES.VALIDATION.ARRAY_MIN_SIZE,
          field: 'variants',
          message: VALIDATION_MESSAGES.arrayMinSize(
            'Variants',
            VALIDATION_RULES.VARIANT.MIN_COUNT,
          ),
        },
      ],
      [
        // z.enum() maps a missing value the same way as an invalid one — both
        // are "not a member of the enum", not a separate "required" check.
        'a missing roastLevel',
        {
          categoryId: validProduct.categoryId,
          name: validProduct.name,
          description: validProduct.description,
          origin: validProduct.origin,
          processingMethod: validProduct.processingMethod,
          images: validProduct.images,
          variants: validProduct.variants,
        },
        {
          errCode: ERROR_CODES.VALIDATION.IS_ENUM,
          field: 'roastLevel',
          message: `RoastLevel must be one of the following values: ${roastLevels}`,
        },
      ],
      [
        // Explicit `null` on a required (non-nullish) string is a type
        // mismatch, not the "received undefined" case NOT_EMPTY maps.
        'an explicit null description',
        { ...validProduct, description: null },
        {
          errCode: ERROR_CODES.VALIDATION.IS_STRING,
          field: 'description',
          message: 'Description must be a string',
        },
      ],
      [
        'a missing description key',
        {
          categoryId: validProduct.categoryId,
          name: validProduct.name,
          roastLevel: validProduct.roastLevel,
          origin: validProduct.origin,
          processingMethod: validProduct.processingMethod,
          images: validProduct.images,
          variants: validProduct.variants,
        },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'description',
          message: 'Description should not be empty',
        },
      ],
      [
        'an origin shorter than NAME.MIN_LENGTH',
        { ...validProduct, origin: 'A' },
        {
          errCode: ERROR_CODES.VALIDATION.MIN_LENGTH,
          field: 'origin',
          message: `Origin must be longer than or equal to ${VALIDATION_RULES.NAME.MIN_LENGTH} characters`,
        },
      ],
      [
        'a missing origin key',
        {
          categoryId: validProduct.categoryId,
          name: validProduct.name,
          roastLevel: validProduct.roastLevel,
          description: validProduct.description,
          processingMethod: validProduct.processingMethod,
          images: validProduct.images,
          variants: validProduct.variants,
        },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'origin',
          message: 'Origin should not be empty',
        },
      ],
      [
        'a missing processingMethod',
        { ...validProduct, processingMethod: undefined },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'processingMethod',
          message: 'ProcessingMethod should not be empty',
        },
      ],
    ])('maps %s', async (_name, input, expected) => {
      expect(await errorsFor(createProductSchema, input)).toEqual(
        Array.isArray(expected) ? expected : [expected],
      );
    });

    it('reports both the min-count and primary-image issues for an empty images array', async () => {
      const result = await errorsFor(createProductSchema, {
        ...validProduct,
        images: [],
      });

      expect(result).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.ARRAY_MIN_SIZE,
          field: 'images',
          message: VALIDATION_MESSAGES.arrayMinSize(
            'Images',
            VALIDATION_RULES.IMAGE.MIN_COUNT,
          ),
        },
        {
          errCode: ERROR_CODES.PRODUCT.PRIMARY_IMAGE_REQUIRED,
          field: 'images',
          message: ERROR_MESSAGES.PRODUCT.PRIMARY_IMAGE_REQUIRED,
        },
      ]);
    });
  });

  describe('updateProductSchema', () => {
    it('accepts an empty body and null to clear the one nullable column', async () => {
      expect((await run(updateProductSchema, {})).issues).toBeUndefined();
      expect(
        (await run(updateProductSchema, { tastingNotes: null })).issues,
      ).toBeUndefined();
    });

    it('rejects null for description, now a required (non-nullable) field', async () => {
      const result = await run(updateProductSchema, { description: null });

      expect(result.issues).not.toBeUndefined();
    });

    it('accepts the image change lists', async () => {
      const result = await run(updateProductSchema, {
        removeImageIds: [uuid],
        updateImages: [{ id: uuid, isPrimary: true }],
        addImages: [{ url: 'https://example.com/a.png' }],
      });

      expect(result.issues).toBeUndefined();
    });

    it.each([
      [
        'a removed image id that is not a UUID',
        { removeImageIds: ['x'] },
        {
          errCode: ERROR_CODES.VALIDATION.IS_UUID,
          field: 'removeImageIds.0',
          message: 'RemoveImageIds must be a UUID',
        },
      ],
      [
        'an image patch without an id',
        { updateImages: [{ isPrimary: true }] },
        {
          errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
          field: 'updateImages.0.id',
          message: 'Id should not be empty',
        },
      ],
      [
        'an added image with a bad url',
        { addImages: [{ url: 'nope' }] },
        {
          errCode: ERROR_CODES.VALIDATION.IS_URL,
          field: 'addImages.0.url',
          message: 'Url must be a URL address',
        },
      ],
    ])('maps %s', async (_name, input, expected) => {
      expect(await errorsFor(updateProductSchema, input)).toEqual([expected]);
    });

    it('drops images and variants, which are only accepted on create', async () => {
      const result = await run(updateProductSchema, {
        name: 'Renamed',
        images: [{ url: 'nope' }],
      });

      expect((result as { value: object }).value).toEqual({ name: 'Renamed' });
    });
  });

  describe('productQuerySchema', () => {
    it('splits a comma-separated roastLevel into an array', async () => {
      const result = await run(productQuerySchema, {
        roastLevel: 'LIGHT,DARK',
      });

      expect(
        (result as { value: { roastLevel: string[] } }).value.roastLevel,
      ).toEqual(['LIGHT', 'DARK']);
    });

    it('reports an unknown roastLevel value on the roastLevel field', async () => {
      expect(
        await errorsFor(productQuerySchema, { roastLevel: 'BURNT' }),
      ).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.IS_ENUM,
          field: 'roastLevel.0',
          message: `RoastLevel must be one of the following values: ${roastLevels}`,
        },
      ]);
    });

    it('maps a minPrice below the minimum to min', async () => {
      expect(
        await errorsFor(productQuerySchema, {
          minPrice: String(VALIDATION_RULES.PRICE.MIN - 1),
        }),
      ).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.MIN,
          field: 'minPrice',
          message: `MinPrice must not be less than ${VALIDATION_RULES.PRICE.MIN}`,
        },
      ]);
    });
  });

  describe('paginationQuerySchema', () => {
    it.each([
      [
        'page below the minimum',
        { page: String(VALIDATION_RULES.PAGINATION.MIN_PAGE - 1) },
        ERROR_CODES.VALIDATION.MIN,
        'page',
        `Page must not be less than ${VALIDATION_RULES.PAGINATION.MIN_PAGE}`,
      ],
      [
        'limit above the maximum',
        { limit: String(VALIDATION_RULES.PAGINATION.MAX_LIMIT + 1) },
        ERROR_CODES.VALIDATION.MAX,
        'limit',
        `Limit must not be greater than ${VALIDATION_RULES.PAGINATION.MAX_LIMIT}`,
      ],
      [
        'fractional page',
        { page: '1.5' },
        ERROR_CODES.VALIDATION.IS_INT,
        'page',
        'Page must be an integer number',
      ],
      [
        'non-numeric limit',
        { limit: 'abc' },
        ERROR_CODES.VALIDATION.IS_NUMBER,
        'limit',
        'Limit must be a number conforming to the specified constraints',
      ],
    ])('maps a %s', async (_name, input, errCode, field, message) => {
      expect(await errorsFor(paginationQuerySchema, input)).toEqual([
        { errCode, field, message },
      ]);
    });
  });

  describe('idParamSchema', () => {
    it('accepts a UUID', async () => {
      expect((await run(idParamSchema, { id: uuid })).issues).toBeUndefined();
    });

    it('reports a malformed id on the id field', async () => {
      expect(await errorsFor(idParamSchema, { id: 'abc' })).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.IS_UUID,
          field: 'id',
          message: 'Id must be a UUID',
        },
      ]);
    });
  });

  describe('createUserSchema', () => {
    it('falls back to the raw Zod code for a format with no dedicated mapping', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: 'user_clerk1',
          email: 'not-an-email',
          firstName: 'Baseline',
          lastName: 'User',
        }),
      ).toEqual([
        {
          errCode: 'invalid_format',
          field: 'email',
          message: 'Invalid email address',
        },
      ]);
    });

    it('labels a malformed phoneNumber with the invalid-format mapping', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: 'user_clerk1',
          email: 'baseline@example.com',
          firstName: 'Baseline',
          lastName: 'User',
          phoneNumber: 'abc',
        }),
      ).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.INVALID_FORMAT,
          field: 'phoneNumber',
          message: VALIDATION_MESSAGES.invalidFormat('PhoneNumber'),
        },
      ]);
    });

    it('accepts an explicit null for phoneNumber and avatarUrl', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: 'user_clerk1',
          email: 'baseline@example.com',
          firstName: 'Baseline',
          lastName: 'User',
          phoneNumber: null,
          avatarUrl: null,
        }),
      ).toEqual([]);
    });

    it('accepts a valid 10-digit phoneNumber', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: 'user_clerk1',
          email: 'baseline@example.com',
          firstName: 'Baseline',
          lastName: 'User',
          phoneNumber: '0987654321',
        }),
      ).toEqual([]);
    });

    it('rejects an empty clerkId', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: '',
          email: 'baseline@example.com',
          firstName: 'Baseline',
          lastName: 'User',
        }),
      ).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.INVALID_FORMAT,
          field: 'clerkId',
          message: VALIDATION_MESSAGES.invalidFormat('ClerkId'),
        },
      ]);
    });

    it('rejects a clerkId missing the Clerk "user_" prefix', async () => {
      expect(
        await errorsFor(createUserSchema, {
          clerkId: 'not-a-clerk-id',
          email: 'baseline@example.com',
          firstName: 'Baseline',
          lastName: 'User',
        }),
      ).toEqual([
        {
          errCode: ERROR_CODES.VALIDATION.INVALID_FORMAT,
          field: 'clerkId',
          message: VALIDATION_MESSAGES.invalidFormat('ClerkId'),
        },
      ]);
    });
  });
});

// None of this project's Zod schemas produce these shapes — Zod always sets `code`
// and a plain string/number `path`. These cover the parts of the mapper that exist
// only to satisfy the wider Standard Schema spec (object-shaped path segments, no
// `path`, no `code`), using issue literals instead of a real schema failure.
describe('toErrorDetailsFromStandardSchemaIssues (spec-compliance edge cases)', () => {
  it('reads the key off an object-shaped path segment', () => {
    const issues: StandardSchemaV1.Issue[] = [
      { code: 'custom', path: [{ key: 'name' }], message: 'Bad name' } as never,
    ];

    expect(toErrorDetailsFromStandardSchemaIssues(issues)).toEqual([
      {
        errCode: 'custom',
        field: 'name',
        message: 'Bad name',
        description: 'Bad name',
      },
    ]);
  });

  it('defaults the field to an empty string when the issue has no path', () => {
    const issues: StandardSchemaV1.Issue[] = [
      { message: 'Root-level failure' },
    ];

    expect(toErrorDetailsFromStandardSchemaIssues(issues)).toEqual([
      {
        errCode: ERROR_CODES.VALIDATION.INVALID,
        field: '',
        message: 'Root-level failure',
        description: 'Root-level failure',
      },
    ]);
  });

  it('falls back to the joined path when every segment is an array index', () => {
    const issues: StandardSchemaV1.Issue[] = [
      { code: 'custom', path: [0], message: 'Bad root item' } as never,
    ];

    expect(toErrorDetailsFromStandardSchemaIssues(issues)).toEqual([
      {
        errCode: 'custom',
        field: '0',
        message: 'Bad root item',
        description: 'Bad root item',
      },
    ]);
  });
});
