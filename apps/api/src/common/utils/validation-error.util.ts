import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ErrorDetailDto } from '../dto/error.dto.js';
import { VALIDATION_MESSAGES } from '@repo/constants';
import { ERROR_CODES } from '../constants/error-code.constant.js';

/**
 * Maps Standard Schema (e.g. Zod) issues to ErrorDetailDto, the shape a
 * StandardSchemaValidationPipe failure is returned in through
 * ValidationException. `errCode` is the API's error code for the failed
 * constraint (minLength, isUuid, ...) and `field` is the dotted path to the
 * value, so a nested failure reads `variants.0.size`.
 */
export const toErrorDetailsFromStandardSchemaIssues = (
  issues: readonly StandardSchemaV1.Issue[],
): ErrorDetailDto[] => {
  return issues.map((issue) => {
    const segments = (issue.path ?? []).map((segment) =>
      typeof segment === 'object' ? String(segment.key) : String(segment),
    );
    const field = segments.join('.');
    // The message names the property, not the whole path.
    const property = segments.filter((s) => !isIndex(s)).at(-1) ?? field;

    const { errCode, message } = describeStandardSchemaIssue(issue, property);

    return { errCode, field, message, description: issue.message };
  });
};

const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1);

const describeStandardSchemaIssue = (
  issue: StandardSchemaV1.Issue,
  subject: string,
): { errCode: string; message: string } => {
  const {
    code,
    expected,
    origin,
    format,
    minimum,
    maximum,
    inclusive,
    values,
    params,
  } = issue as {
    code?: string;
    expected?: string;
    origin?: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    inclusive?: boolean;
    values?: unknown[];
    params?: { errCode?: string };
  };

  const label = capitalize(subject);
  const isNumeric = origin === 'number' || origin === 'int';

  if (code === 'invalid_type') {
    if (issue.message.includes('received undefined')) {
      return {
        errCode: ERROR_CODES.VALIDATION.NOT_EMPTY,
        message: VALIDATION_MESSAGES.isNotEmpty(label),
      };
    }
    if (expected === 'int') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_INT,
        message: VALIDATION_MESSAGES.isInt(label),
      };
    }
    if (expected === 'number') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_NUMBER,
        message: VALIDATION_MESSAGES.isNumber(label),
      };
    }
    if (expected === 'boolean') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_BOOLEAN,
        message: VALIDATION_MESSAGES.isBoolean(label),
      };
    }
    if (expected === 'array') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_ARRAY,
        message: VALIDATION_MESSAGES.isArray(label),
      };
    }
    return {
      errCode: ERROR_CODES.VALIDATION.IS_STRING,
      message: VALIDATION_MESSAGES.isString(label),
    };
  }

  if (code === 'too_small') {
    if (isNumeric && inclusive === false && minimum === 0) {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_POSITIVE,
        message: VALIDATION_MESSAGES.isPositive(label),
      };
    }
    if (isNumeric) {
      return {
        errCode: ERROR_CODES.VALIDATION.MIN,
        message: VALIDATION_MESSAGES.min(label, minimum),
      };
    }
    if (origin === 'array') {
      return {
        errCode: ERROR_CODES.VALIDATION.ARRAY_MIN_SIZE,
        message: VALIDATION_MESSAGES.arrayMinSize(label, minimum),
      };
    }
    return {
      errCode: ERROR_CODES.VALIDATION.MIN_LENGTH,
      message: VALIDATION_MESSAGES.minLength(label, minimum),
    };
  }

  if (code === 'too_big') {
    if (isNumeric) {
      return {
        errCode: ERROR_CODES.VALIDATION.MAX,
        message: VALIDATION_MESSAGES.max(label, maximum),
      };
    }
    if (origin === 'array') {
      return {
        errCode: ERROR_CODES.VALIDATION.ARRAY_MAX_SIZE,
        message: VALIDATION_MESSAGES.arrayMaxSize(label, maximum),
      };
    }
    return {
      errCode: ERROR_CODES.VALIDATION.MAX_LENGTH,
      message: VALIDATION_MESSAGES.maxLength(label, maximum),
    };
  }

  if (code === 'invalid_format') {
    if (format === 'uuid') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_UUID,
        message: VALIDATION_MESSAGES.isUuid(label),
      };
    }
    if (format === 'url') {
      return {
        errCode: ERROR_CODES.VALIDATION.IS_URL,
        message: VALIDATION_MESSAGES.isUrl(label),
      };
    }
    if (format === 'regex') {
      return {
        errCode: ERROR_CODES.VALIDATION.INVALID_FORMAT,
        message: VALIDATION_MESSAGES.invalidFormat(label),
      };
    }
  }

  if (code === 'invalid_value' && values) {
    return {
      errCode: ERROR_CODES.VALIDATION.IS_ENUM,
      message: VALIDATION_MESSAGES.isEnum(label, values),
    };
  }

  if (code === 'custom' && params?.errCode) {
    return { errCode: params.errCode, message: issue.message };
  }

  return {
    errCode: code ?? ERROR_CODES.VALIDATION.INVALID,
    message: issue.message,
  };
};
