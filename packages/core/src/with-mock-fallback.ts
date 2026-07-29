import type { GenerationService } from './types';

const DEFAULT_TIMEOUT_MS = 20_000;

export function withMockFallback(
  live: GenerationService,
  mock: GenerationService,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): GenerationService {
  return {
    async generate(request, signal) {
      const controller = new AbortController();
      const onCallerAbort = () => controller.abort();
      signal?.addEventListener('abort', onCallerAbort);
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await live.generate(request, controller.signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        const fallback = await mock.generate(request, signal);
        return { ...fallback, degraded: true };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onCallerAbort);
      }
    },
  };
}
