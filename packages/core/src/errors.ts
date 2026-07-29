export const API_ERROR_CODES = [
  'invalid_request',
  'missing_api_key',
  'invalid_api_key',
  'content_blocked',
  'unsupported_provider',
  'rate_limited',
  'provider_error',
  'task_not_found',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Códigos que NO deben degradar a mock: son culpa del cliente y hay que mostrárselos. */
const FATAL_CODES: readonly ApiErrorCode[] = [
  'invalid_request',
  'missing_api_key',
  'invalid_api_key',
  'content_blocked',
  'unsupported_provider',
];

export class PlatformError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}

export function isFatalPlatformError(error: unknown): boolean {
  return error instanceof PlatformError && FATAL_CODES.includes(error.code);
}
