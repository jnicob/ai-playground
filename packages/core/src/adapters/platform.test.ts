import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatformAdapter } from './platform';
import { encodeTaskId } from '../api-contract';
import { PlatformError } from '../errors';
import type { EditImageRequest, GenerationRequest, GenerateVideoRequest } from '../types';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 5,
};

const taskId = encodeTaskId(request);
const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const completed = {
  task_id: taskId,
  status: 'COMPLETED',
  provider: 'pollinations',
  elapsed_ms: 800,
  output: { kind: 'image', url: 'https://example.test/fox.jpg', width: 1024, height: 1024 },
};

const adapter = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) =>
  createPlatformAdapter({
    apiBaseUrl: 'https://api.test',
    fetchImpl,
    pollIntervalMs: 0,
    ...extra,
  });

describe('adaptador platform', () => {
  afterEach(() => vi.useRealTimers());

  it('hace POST al servicio y luego GET a la tarea', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toBe('https://api.test/v1/services/generate-image');
    expect((calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((calls[0]?.[1] as RequestInit).body))).toEqual({
      provider: 'pollinations',
      prompt: 'a red fox',
      model: 'flux',
      aspect_ratio: 'square_1_1',
      seed: 5,
    });
    expect(String(calls[1]?.[0])).toBe(`https://api.test/v1/tasks/${taskId}`);
    expect(result).toMatchObject({
      kind: 'image',
      url: 'https://example.test/fox.jpg',
      degraded: false,
    });
  });

  it('emite la traza real del ciclo task-based', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    expect(result.apiTrace.map((step) => step.kind)).toEqual([
      'request',
      'status',
      'poll',
      'completed',
    ]);
    const poll = result.apiTrace.find((step) => step.kind === 'poll');
    expect(poll && 'url' in poll ? poll.url : '').toContain(`/v1/tasks/${taskId}`);
  });

  it('sigue haciendo polling mientras la tarea está IN_PROGRESS', async () => {
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes('/v1/services/'))
        return json({ task_id: taskId, status: 'IN_PROGRESS' }, 202);
      polls += 1;
      return polls < 3 ? json({ task_id: taskId, status: 'IN_PROGRESS' }) : json(completed);
    }) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    expect(polls).toBe(3);
    expect(result.apiTrace.filter((step) => step.kind === 'poll')).toHaveLength(3);
  });

  it('manda la key en el header y nunca en la URL', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    await adapter(fetchImpl, { getApiKey: () => 'secret-key' }).generate(request);

    for (const call of (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).not.toContain('secret-key');
      expect((call[1] as RequestInit).headers).toMatchObject({ 'x-provider-key': 'secret-key' });
    }
  });

  it('convierte un error 4xx de la API en PlatformError con su código', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { code: 'invalid_api_key', message: 'bad key' } }, 401),
    ) as unknown as typeof fetch;

    const promise = adapter(fetchImpl).generate(request);
    await expect(promise).rejects.toBeInstanceOf(PlatformError);
    await expect(promise).rejects.toMatchObject({ code: 'invalid_api_key' });
  });

  it('convierte una tarea FAILED en PlatformError con su código', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json({
            task_id: taskId,
            status: 'FAILED',
            error: { code: 'rate_limited', message: 'slow down' },
          }),
    ) as unknown as typeof fetch;

    await expect(adapter(fetchImpl).generate(request)).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('aborta con AbortSignal', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    const promise = adapter(fetchImpl).generate(request, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });

  it('acepta POST 200 síncrono de edición sin hacer polling y redacta el base64 de la traza', async () => {
    const sourceData = 'base64-source-sentinel';
    const editRequest: EditImageRequest = {
      service: 'edit-image',
      provider: 'google',
      prompt: 'make it blue',
      model: 'gemini-3.1-flash-lite-image',
      aspectRatio: 'square_1_1',
      seed: 7,
      sourceImage: { mimeType: 'image/png', data: sourceData },
    };
    const fetchImpl = vi.fn(async () =>
      json({
        status: 'COMPLETED',
        provider: 'google',
        elapsed_ms: 12,
        output: {
          kind: 'image-pair',
          before_url: `data:image/png;base64,${sourceData}`,
          after_url: 'data:image/png;base64,base64-result-sentinel',
        },
      }),
    ) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(editRequest);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      kind: 'image-pair',
      before: `data:image/png;base64,${sourceData}`,
      after: 'data:image/png;base64,base64-result-sentinel',
    });
    const trace = JSON.stringify(result.apiTrace);
    expect(trace).not.toContain(sourceData);
    expect(trace).not.toContain('base64-result-sentinel');
  });

  it('completa vídeo 202, descarga Blob autenticado y entrega dispose idempotente', async () => {
    const videoRequest: GenerateVideoRequest = {
      service: 'generate-video',
      provider: 'google',
      prompt: 'A paper boat',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'widescreen_16_9',
      seed: 17,
      durationSeconds: 4,
      resolution: '720p',
    };
    const key = 'video-key-sentinel';
    const taskId = 'v2.operation-token';
    const downloadPath = '/v1/downloads/opaque-download-token';
    const videoBytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70]);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      if (value.includes('/v1/services/')) {
        return json({ task_id: taskId, status: 'IN_PROGRESS' }, 202);
      }
      if (value.includes('/v1/tasks/')) {
        return json({
          task_id: taskId,
          status: 'COMPLETED',
          provider: 'google',
          elapsed_ms: 40_000,
          output: { kind: 'video', download_url: downloadPath },
        });
      }
      return new Response(videoBytes, { headers: { 'content-type': 'video/mp4' } });
    }) as unknown as typeof fetch;
    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:local-video');
    const revokeObjectUrl = vi.fn();

    const result = await adapter(fetchImpl, {
      getApiKey: () => key,
      createObjectUrl,
      revokeObjectUrl,
    }).generate(videoRequest);

    expect(result).toMatchObject({
      kind: 'video',
      url: 'blob:local-video',
      poster: '',
      dispose: expect.any(Function),
    });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[2]?.[0])).toBe(`https://api.test${downloadPath}`);
    expect((calls[2]?.[1] as RequestInit).headers).toMatchObject({
      'x-provider-key': key,
    });
    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect((createObjectUrl.mock.calls[0]?.[0] as Blob).type).toBe('video/mp4');

    if (result.kind !== 'video') throw new Error('Expected video');
    result.dispose();
    result.dispose();
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:local-video');

    const trace = JSON.stringify(result.apiTrace);
    expect(trace).not.toContain(key);
    expect(trace).not.toContain('opaque-download-token');
  });

  it('aplica backoff al polling 429 y respeta Retry-After con tope de 30 s', async () => {
    vi.useFakeTimers();
    const pollTimes: number[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/v1/services/')) {
        return json({ task_id: taskId, status: 'IN_PROGRESS' }, 202);
      }
      pollTimes.push(Date.now());
      polls += 1;
      if (polls === 1) return json({ error: { code: 'rate_limited' } }, 429);
      if (polls === 2) {
        return json({ error: { code: 'rate_limited' } }, 429, { 'retry-after': '60' });
      }
      return json(completed);
    }) as unknown as typeof fetch;
    const generation = adapter(fetchImpl, { pollIntervalMs: 10_000 }).generate(request);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(polls).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(polls).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(generation).resolves.toMatchObject({ kind: 'image' });
    expect(pollTimes.map((time) => time - pollTimes[0]!)).toEqual([0, 20_000, 50_000]);
  });

  it('agota el timeout total sin degradar una operación ya aceptada', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json({ task_id: taskId, status: 'IN_PROGRESS' }),
    ) as unknown as typeof fetch;
    const generation = adapter(fetchImpl, {
      pollIntervalMs: 100,
      maxPollMs: 250,
    }).generate(request);
    const rejection = expect(generation).rejects.toMatchObject({
      code: 'provider_error',
      operationCommitted: true,
    });

    await vi.advanceTimersByTimeAsync(400);

    await rejection;
  });

  it('aborta durante polling sin relanzar ni descargar', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        if (String(url).includes('/v1/services/')) {
          return Promise.resolve(json({ task_id: taskId, status: 'IN_PROGRESS' }, 202));
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    ) as unknown as typeof fetch;

    const generation = adapter(fetchImpl).generate(request, controller.signal);
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    controller.abort();

    await expect(generation).rejects.toThrow(/abort/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('aborta durante la descarga y no crea un object URL', async () => {
    const controller = new AbortController();
    const videoRequest: GenerateVideoRequest = {
      service: 'generate-video',
      provider: 'google',
      prompt: 'A paper boat',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'widescreen_16_9',
      seed: 17,
      durationSeconds: 4,
      resolution: '720p',
    };
    const createObjectUrl = vi.fn<(blob: Blob) => string>(() => 'blob:must-not-exist');
    const fetchImpl = vi.fn(
      (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const value = String(url);
        if (value.includes('/v1/services/')) {
          return Promise.resolve(json({ task_id: 'v2.operation', status: 'IN_PROGRESS' }, 202));
        }
        if (value.includes('/v1/tasks/')) {
          return Promise.resolve(
            json({
              task_id: 'v2.operation',
              status: 'COMPLETED',
              provider: 'google',
              elapsed_ms: 1,
              output: { kind: 'video', download_url: '/v1/downloads/opaque' },
            }),
          );
        }
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    ) as unknown as typeof fetch;

    const generation = adapter(fetchImpl, { createObjectUrl }).generate(
      videoRequest,
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    controller.abort();

    await expect(generation).rejects.toThrow(/abort/i);
    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
