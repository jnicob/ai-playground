import { describe, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '@ai-playground/core';
import { PlatformError } from '@ai-playground/core';
import { pollinationsConnector } from './pollinations';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'un ñandú en la nieve',
  model: 'flux',
  aspectRatio: 'widescreen_16_9',
  seed: 42,
};

const okResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });

describe('conector pollinations', () => {
  it('construye la URL verificada con prompt codificado y parámetros', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => okResponse());
    await pollinationsConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const called = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(called.origin).toBe('https://image.pollinations.ai');
    expect(called.pathname).toBe(`/prompt/${encodeURIComponent(request.prompt)}`);
    expect(called.searchParams.get('width')).toBe('1280');
    expect(called.searchParams.get('height')).toBe('720');
    expect(called.searchParams.get('seed')).toBe('42');
    expect(called.searchParams.get('model')).toBe('flux');
    expect(called.searchParams.get('nologo')).toBe('true');
  });

  it('devuelve la URL pública como output con las dimensiones pedidas', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const output = await pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(output).toEqual({
      kind: 'image',
      url: expect.stringContaining('image.pollinations.ai/prompt/'),
      width: 1280,
      height: 720,
    });
  });

  it('propaga el AbortSignal al fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return okResponse();
    });
    await pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'provider_error'],
    [404, 'provider_error'],
  ])('mapea el status %i a %s', async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status }));
    await expect(
      pollinationsConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code });
  });

  it('rechaza una respuesta 200 que no sea una imagen', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>error</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const promise = pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(promise).rejects.toBeInstanceOf(PlatformError);
    await expect(promise).rejects.toMatchObject({ code: 'provider_error' });
  });
});
