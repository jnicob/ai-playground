import { describe, expect, it, vi } from 'vitest';
import { createPlatformAdapter } from './platform';
import { encodeTaskId } from '../api-contract';
import { PlatformError } from '../errors';
import type { GenerationRequest } from '../types';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 5,
};

const taskId = encodeTaskId(request);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

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
});
