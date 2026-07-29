import { describe, expect, it, vi } from 'vitest';
import type { EditImageRequest } from '@ai-playground/core';
import { googleEditConnector } from './google-edit';
import { connectorFor } from './index';

const sourceData = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const request: EditImageRequest = {
  service: 'edit-image',
  provider: 'google',
  prompt: 'make it blue',
  model: 'gemini-3.1-flash-lite-image',
  aspectRatio: 'square_1_1',
  seed: 7,
  sourceImage: { mimeType: 'image/png', data: sourceData },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const editedImage = {
  candidates: [
    { content: { parts: [{ inlineData: { mimeType: 'image/png', data: sourceData } }] } },
  ],
};

describe('googleEditConnector', () => {
  it('se resuelve por provider y service sin habilitar combinaciones falsas', () => {
    expect(connectorFor('google', 'edit-image')).toBe(googleEditConnector);
    expect(() => connectorFor('pollinations', 'edit-image')).toThrow(/unsupported/i);
  });

  it('envía texto e imagen inline y devuelve el par antes/después', async () => {
    const fetchImpl = vi.fn(async () => json(editedImage));

    const output = await googleEditConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'secret-key',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent',
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts).toEqual([
      { text: expect.stringContaining('make it blue') },
      { inlineData: { mimeType: 'image/png', data: sourceData } },
    ]);
    expect(output).toEqual({
      kind: 'image-pair',
      before_url: `data:image/png;base64,${sourceData}`,
      after_url: `data:image/png;base64,${sourceData}`,
    });
  });

  it.each([
    ['base64 inválido', { mimeType: 'image/png', data: 'not-base64!' }],
    ['firma que no coincide', { mimeType: 'image/jpeg', data: sourceData }],
    ['formato activo', { mimeType: 'image/svg+xml', data: 'PHN2Zz4=' }],
  ])('rechaza %s antes de tocar Google', async (_name, sourceImage) => {
    const fetchImpl = vi.fn(async () => json(editedImage));

    await expect(
      googleEditConnector({ ...request, sourceImage } as EditImageRequest, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'secret-key',
      }),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rechaza más de 10 MiB antes de decodificar/enviar', async () => {
    const oversizedBase64 = 'A'.repeat(13_981_016);
    const fetchImpl = vi.fn(async () => json(editedImage));

    await expect(
      googleEditConnector(
        { ...request, sourceImage: { mimeType: 'image/png', data: oversizedBase64 } },
        { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'k' },
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rechaza MIME de salida no permitido', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: 'text/html', data: 'PHNjcmlwdD4=' } }] } },
        ],
      }),
    );

    await expect(
      googleEditConnector(request, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'k',
      }),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });

  it('redacta key y source image si Google las refleja en un error', async () => {
    const secret = 'secret-key';
    const fetchImpl = vi.fn(async () =>
      json({ error: { message: `${secret} ${sourceData}` } }, 500),
    );

    let thrown: unknown;
    try {
      await googleEditConnector(request, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: secret,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'provider_error' });
    expect((thrown as Error).message).not.toContain(secret);
    expect((thrown as Error).message).not.toContain(sourceData);
  });
});
