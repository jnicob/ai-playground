import { createMockAdapter } from './adapters/mock';
import { createPlatformAdapter, type PlatformAdapterOptions } from './adapters/platform';
import { withMockFallback } from './with-mock-fallback';
import type { GenerationService, ProviderId } from './types';

const PLATFORM_FALLBACK_TIMEOUT_MS = 120_000;
const VIDEO_FALLBACK_TIMEOUT_MS = 610_000;

export type GenerationServiceOptions = Partial<PlatformAdapterOptions> & {
  apiBaseUrl?: string;
};

export function createGenerationService(
  provider: ProviderId,
  options: GenerationServiceOptions = {},
): GenerationService {
  if (provider === 'mock') return createMockAdapter();

  const { apiBaseUrl, ...platformOptions } = options;
  if (!apiBaseUrl) {
    throw new Error(`Provider "${provider}" requires apiBaseUrl to reach the platform API`);
  }

  const live = createPlatformAdapter({ ...platformOptions, apiBaseUrl });
  return withMockFallback(live, createMockAdapter(), (request) =>
    request.service === 'generate-video' ? VIDEO_FALLBACK_TIMEOUT_MS : PLATFORM_FALLBACK_TIMEOUT_MS,
  );
}
