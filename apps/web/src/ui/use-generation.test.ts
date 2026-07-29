import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGeneration } from './use-generation';
import type { GenerationRequest, GenerationResult, GenerationService } from '@ai-playground/core';

const REQ: GenerationRequest = {
  service: 'generate-image',
  provider: 'mock',
  prompt: 'x',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 1,
};

const ok: GenerationResult = {
  kind: 'image',
  url: '/mocks/square-1.webp',
  width: 1024,
  height: 1024,
  provider: 'mock',
  degraded: false,
  elapsedMs: 5,
  apiTrace: [],
};

describe('useGeneration', () => {
  it('idle → loading → success', async () => {
    const service: GenerationService = { generate: async () => ok };
    const { result } = renderHook(() => useGeneration(service));
    expect(result.current.state.status).toBe('idle');
    act(() => result.current.generate(REQ));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('success'));
  });
  it('error con mensaje', async () => {
    const service: GenerationService = {
      generate: async () => {
        throw new Error('boom');
      },
    };
    const { result } = renderHook(() => useGeneration(service));
    act(() => result.current.generate(REQ));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'error', message: 'boom' }));
  });
  it('re-generar aborta la petición anterior (no pisa el resultado nuevo)', async () => {
    let calls = 0;
    const service: GenerationService = {
      generate: (_req, signal) =>
        new Promise((resolve, reject) => {
          calls += 1;
          if (calls === 1)
            signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          else resolve(ok);
        }),
    };
    const { result } = renderHook(() => useGeneration(service));
    act(() => result.current.generate(REQ));
    act(() => result.current.generate({ ...REQ, seed: 2 }));
    await waitFor(() => expect(result.current.state.status).toBe('success'));
    expect(calls).toBe(2);
  });
});
