import { describe, expect, it, vi } from 'vitest';
import { createGenerationService } from './factory';
import type { GenerationRequest } from './types';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 5,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createGenerationService', () => {
  it('crea el servicio mock', () => {
    expect(createGenerationService('mock')).toHaveProperty('generate');
  });
});

describe('createGenerationService con proveedores live', () => {
  it('crea un servicio para pollinations y google con base url', () => {
    const options = { apiBaseUrl: 'https://api.test' };
    expect(createGenerationService('pollinations', options)).toHaveProperty('generate');
    expect(createGenerationService('google', options)).toHaveProperty('generate');
  });

  it('exige apiBaseUrl para los proveedores live', () => {
    expect(() => createGenerationService('pollinations')).toThrow(/apiBaseUrl/i);
  });

  it('espera una generación síncrona de más de 20 segundos antes de degradar a mock', async () => {
    vi.useFakeTimers();
    const taskId = 'v1.slow-generation';
    const fetchImpl = vi.fn(
      (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (String(url).includes('/v1/services/')) {
          return Promise.resolve(json({ task_id: taskId, status: 'IN_PROGRESS' }, 202));
        }

        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () =>
              resolve(
                json({
                  task_id: taskId,
                  status: 'COMPLETED',
                  provider: 'pollinations',
                  elapsed_ms: 30_000,
                  output: { kind: 'image', url: 'https://example.test/live.jpg' },
                }),
              ),
            30_000,
          );
          init?.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      },
    );
    vi.stubGlobal('fetch', fetchImpl);

    try {
      const service = createGenerationService('pollinations', {
        apiBaseUrl: 'https://api.test',
      });
      const generation = service.generate(request);

      await vi.advanceTimersByTimeAsync(40_000);

      await expect(generation).resolves.toMatchObject({
        url: 'https://example.test/live.jpg',
        provider: 'pollinations',
        degraded: false,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('no degrada a mock después de aceptar una operación que puede generar coste', async () => {
    vi.useFakeTimers();
    const videoRequest: GenerationRequest = {
      service: 'generate-video',
      provider: 'google',
      prompt: 'A paper boat',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'widescreen_16_9',
      seed: 17,
      durationSeconds: 4,
      resolution: '720p',
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: 'v2.operation', status: 'IN_PROGRESS' }, 202)
        : json({ error: { code: 'provider_error', message: 'upstream failed' } }, 502),
    );

    try {
      const service = createGenerationService('google', {
        apiBaseUrl: 'https://api.test',
        fetchImpl,
        pollIntervalMs: 10,
      });
      const generation = service.generate(videoRequest);
      const rejection = expect(generation).rejects.toMatchObject({
        code: 'provider_error',
        operationCommitted: true,
      });
      await vi.advanceTimersByTimeAsync(10);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });
});
