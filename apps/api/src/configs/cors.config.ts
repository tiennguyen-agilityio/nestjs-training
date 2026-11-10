import { ConfigService } from '@nestjs/config';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

// `*` matches one run of lowercase letters or digits (no `-`, `.` or `/`), e.g. the
// deployment hash in https://nestjs-training-*-team.vercel.app. Other entries match exactly.
function parseOrigin(entry: string): string | RegExp {
  if (!entry.includes('*')) {
    return entry;
  }

  const pattern = entry
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[a-z0-9]+');

  return new RegExp(`^${pattern}$`);
}

export function corsConfig(configService: ConfigService): CorsOptions {
  return {
    origin: configService
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .map(parseOrigin),
    credentials: true,
  };
}
