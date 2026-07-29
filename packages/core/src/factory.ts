import { createMockAdapter } from './adapters/mock';
import { createPlatformAdapter } from './adapters/platform';
import { withMockFallback } from './with-mock-fallback';
import type { GenerationService, ProviderId } from './types';

const PLATFORM_FALLBACK_TIMEOUT_MS = 120_000;

export type GenerationServiceOptions = {
  apiBaseUrl?: string;
  getApiKey?: () => string | undefined;
};

export function createGenerationService(
  provider: ProviderId,
  options: GenerationServiceOptions = {},
): GenerationService {
  if (provider === 'mock') return createMockAdapter();

  if (!options.apiBaseUrl) {
    throw new Error(`Provider "${provider}" requires apiBaseUrl to reach the platform API`);
  }

  const live = createPlatformAdapter({
    apiBaseUrl: options.apiBaseUrl,
    ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
  });
  return withMockFallback(live, createMockAdapter(), PLATFORM_FALLBACK_TIMEOUT_MS);
}
