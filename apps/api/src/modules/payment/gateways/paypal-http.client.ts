import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const TIMEOUT_MS = 10_000;
/** A token is renewed this long before PayPal says it expires. */
const TOKEN_MARGIN_MS = 60_000;
const UNAUTHORIZED = 401;
const SERVER_ERROR = 500;

export interface PayPalResponse<T> {
  status: number;
  body: T;
}

export interface PayPalRequestOptions {
  body?: unknown;
  /** Sent as is: the webhook verification needs the event bytes unchanged. */
  rawBody?: string;
  headers?: Record<string, string>;
}

/** PayPal could not be reached, timed out or answered 5xx. */
export class PayPalUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PayPalUnavailableError';
  }
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

/** PayPal REST over `fetch`, with the OAuth client-credentials token cached. */
@Injectable()
export class PayPalHttpClient {
  private readonly baseUrl: string;
  private readonly basicAuth: string;
  private token: AccessToken | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .getOrThrow<string>('PAYPAL_API_URL')
      .replace(/\/+$/, '');
    const id = config.getOrThrow<string>('PAYPAL_CLIENT_ID');
    const secret = config.getOrThrow<string>('PAYPAL_CLIENT_SECRET');
    this.basicAuth = Buffer.from(`${id}:${secret}`).toString('base64');
  }

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: PayPalRequestOptions = {},
  ): Promise<PayPalResponse<T>> {
    const first = await this.send<T>(
      method,
      path,
      options,
      await this.access(),
    );
    if (first.status !== UNAUTHORIZED) return first;
    this.token = null;
    return this.send<T>(method, path, options, await this.access());
  }

  private async send<T>(
    method: 'GET' | 'POST',
    path: string,
    { body, rawBody, headers }: PayPalRequestOptions,
    accessToken: string,
  ): Promise<PayPalResponse<T>> {
    const payload =
      rawBody ?? (body === undefined ? undefined : JSON.stringify(body));
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: payload,
    });
    return {
      status: response.status,
      body: (await this.readJson(response)) as T,
    };
  }

  private async access(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now())
      return this.token.value;
    const response = await this.fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = (await this.readJson(response)) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token) {
      throw new PayPalUnavailableError(
        `PayPal refused the access token request (${response.status})`,
      );
    }
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 0) * 1000 - TOKEN_MARGIN_MS,
    };
    return this.token.value;
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new PayPalUnavailableError('PayPal could not be reached', {
        cause: error,
      });
    }
    if (response.status >= SERVER_ERROR) {
      throw new PayPalUnavailableError(`PayPal answered ${response.status}`);
    }
    return response;
  }

  private async readJson(response: Response): Promise<unknown> {
    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      throw new PayPalUnavailableError('PayPal could not be reached', {
        cause: error,
      });
    }
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {};
    }
  }
}
