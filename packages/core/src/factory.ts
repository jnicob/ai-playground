import { createMockAdapter } from './adapters/mock';
import type { GenerationService, ProviderId } from './types';

const ADAPTERS: Partial<Record<ProviderId, () => GenerationService>> = {
  mock: () => createMockAdapter(),
};

export function createGenerationService(provider: ProviderId): GenerationService {
  const create = ADAPTERS[provider];
  if (!create) throw new Error(`Provider "${provider}" not implemented yet`);
  return create();
}
