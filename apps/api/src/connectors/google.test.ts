import { describe, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '@ai-playground/core';
import { googleConnector } from './google';
import { connectorFor } from './index';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'google',
  prompt: 'a red fox',
  model: 'gemini-2.5-flash-image',
  aspectRatio: 'square_1_1',
  seed: 7,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const imageBody = {
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }],
};

describe('conector google', () => {
  it('llama al endpoint verificado con el modelo y la key en header', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'secret-key',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toContain('a red fox');
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
  });

  it('no manda la key en la URL', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'secret-key',
    });
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(String(calls[0]?.[0])).not.toContain('secret-key');
  });

  it('convierte inlineData en un data URL', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    const output = await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
    });
    expect(output).toEqual({ kind: 'image', url: 'data:image/png;base64,QUJD' });
  });

  it('exige api key', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'missing_api_key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mapea key inválida a invalid_api_key', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        {
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        },
        400,
      ),
    );
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'bad' }),
    ).rejects.toMatchObject({ code: 'invalid_api_key' });
  });

  it.each([
    [403, {}, 'invalid_api_key'],
    [429, {}, 'rate_limited'],
    [400, { error: { message: 'bad body', status: 'INVALID_ARGUMENT' } }, 'invalid_request'],
    [503, {}, 'provider_error'],
  ])('mapea %i a %s', async (status, body, code) => {
    const fetchImpl = vi.fn(async () => json(body, status));
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'k' }),
    ).rejects.toMatchObject({ code });
  });

  it('detecta bloqueo de seguridad (200 sin imagen) como content_blocked', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ candidates: [{ content: { parts: [] }, finishReason: 'IMAGE_SAFETY' }] }),
    );
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'k' }),
    ).rejects.toMatchObject({ code: 'content_blocked' });
  });
});

describe('registro de conectores', () => {
  it('resuelve los proveedores live', () => {
    expect(typeof connectorFor('pollinations')).toBe('function');
    expect(typeof connectorFor('google')).toBe('function');
  });

  it('rechaza mock (es client-side) y desconocidos', () => {
    expect(() => connectorFor('mock')).toThrow(/unsupported/i);
  });
});
