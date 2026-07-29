import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withMockFallback } from './with-mock-fallback';
import type { GenerationRequest, GenerationResult, GenerationService } from './types';

const REQ: GenerationRequest = {
  service: 'generate-image',
  provider: 'mock',
  prompt: 'x',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 1,
};

const result = (url: string): GenerationResult => ({
  kind: 'image',
  url,
  width: 1,
  height: 1,
  provider: 'mock',
  degraded: false,
  elapsedMs: 0,
  apiTrace: [],
});

const stub = (fn: GenerationService['generate']): GenerationService => ({ generate: fn });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withMockFallback', () => {
  it('devuelve el resultado live si responde', async () => {
    const svc = withMockFallback(
      stub(async () => result('/live')),
      stub(async () => result('/mock')),
    );
    await expect(svc.generate(REQ)).resolves.toMatchObject({ url: '/live', degraded: false });
  });
  it('cae a mock con degraded=true si live lanza', async () => {
    const svc = withMockFallback(
      stub(async () => {
        throw new Error('boom');
      }),
      stub(async () => result('/mock')),
    );
    await expect(svc.generate(REQ)).resolves.toMatchObject({ url: '/mock', degraded: true });
  });
  it('cae a mock si live supera el timeout', async () => {
    const never = stub(
      (_r, signal) =>
        new Promise((_res, rej) =>
          signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const svc = withMockFallback(
      never,
      stub(async () => result('/mock')),
      20_000,
    );
    const promise = svc.generate(REQ);
    await vi.advanceTimersByTimeAsync(20_001);
    await expect(promise).resolves.toMatchObject({ url: '/mock', degraded: true });
  });
  it('si el CALLER aborta, propaga el abort sin degradar', async () => {
    const never = stub(
      (_r, signal) =>
        new Promise((_res, rej) =>
          signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const controller = new AbortController();
    const svc = withMockFallback(
      never,
      stub(async () => result('/mock')),
    );
    const promise = svc.generate(REQ, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });
  it('si el CALLER aborta DESPUÉS del timeout pero ANTES de que el mock del fallback resuelva, rechaza con abort sin degradar', async () => {
    const never = stub(
      (_r, signal) =>
        new Promise((_res, rej) =>
          signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const slowMock = stub(
      (_r, signal) =>
        new Promise((_res, rej) =>
          signal?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))),
        ),
    );
    const callerController = new AbortController();
    const svc = withMockFallback(never, slowMock, 20_000);
    const promise = svc.generate(REQ, callerController.signal);
    await vi.advanceTimersByTimeAsync(20_001); // dispara el timeout interno: arranca el fallback al mock, que queda pendiente
    callerController.abort(); // el caller aborta mientras el mock del fallback todavía no resolvió
    await expect(promise).rejects.toThrow(/abort/i);
  });
});
