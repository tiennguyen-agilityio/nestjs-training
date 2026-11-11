import { plainToInstance, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

const NODE_ENVIRONMENTS = ['development', 'production', 'test'] as const;

const toNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? Number(value) : value;

export class EnvironmentVariables {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV!: (typeof NODE_ENVIRONMENTS)[number];

  @Transform(toNumber)
  @IsInt()
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DB_HOST!: string;

  @Transform(toNumber)
  @IsInt()
  DB_PORT!: number;

  @IsString()
  @IsNotEmpty()
  DB_NAME!: string;

  @IsString()
  @IsNotEmpty()
  DB_USER!: string;

  @IsString()
  @IsNotEmpty()
  DB_PASSWORD!: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN!: string;

  @Transform(toNumber)
  @IsInt()
  THROTTLE_TTL!: number;

  @Transform(toNumber)
  @IsInt()
  THROTTLE_LIMIT!: number;

  @IsString()
  @IsNotEmpty()
  CLERK_SECRET_KEY!: string;

  @IsString()
  @IsNotEmpty()
  CLERK_WEBHOOK_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  CLERK_PUBLISHABLE_KEY!: string;

  // Empty or 0 means unset: ClerkAuthProvider falls back to DEFAULT_CLERK_SYNC_TIMEOUT_MS.
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  CLERK_SYNC_TIMEOUT_MS?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  APP_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  APP_SECRET?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment variables: ${messages}`);
  }

  return validatedConfig;
}
