import { describe, expect, it, vi } from 'vitest';
import type { GenerateVideoRequest } from '@ai-playground/core';
import {
  decodeGoogleVideoDownloadToken,
  downloadGoogleVideo,
  encodeGoogleVideoDownloadToken,
  pollGoogleVideoOperation,
  startGoogleVideoOperation,
} from './google-video';
import { connectorFor, videoConnectorFor } from './index';

const request: GenerateVideoRequest = {
  service: 'generate-video',
  provider: 'google',
  prompt: 'A paper boat crossing a moonlit pond',
  model: 'veo-3.1-lite-generate-preview',
  aspectRatio: 'widescreen_16_9',
  seed: 17,
  durationSeconds: 4,
  resolution: '720p',
};

const operationName = 'models/veo-3.1-lite-generate-preview/operations/abc-123';
const videoUri =
  'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media';

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('startGoogleVideoOperation', () => {
  it('está registrado solo para google generate-video', () => {
    expect(videoConnectorFor('google')).toBeDefined();
    expect(() => videoConnectorFor('pollinations')).toThrow(/unsupported/i);
    expect(() => connectorFor('google', 'generate-video')).toThrow(/operation/i);
  });

  it('inicia predictLongRunning con parámetros Veo y devuelve una operación validada', async () => {
    const fetchImpl = vi.fn(async () => json({ name: operationName, done: false }));

    const operation = await startGoogleVideoOperation(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'personal-key',
    });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-lite-generate-preview:predictLongRunning',
    );
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' });
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('personal-key');
    expect(JSON.parse(String(init.body))).toEqual({
      instances: [{ prompt: request.prompt }],
      parameters: {
        aspectRatio: '16:9',
        durationSeconds: 4,
        resolution: '720p',
        seed: 17,
      },
    });
    expect(operation).toEqual({ operationName });
  });

  it.each([
    ['path traversal', 'models/veo/operations/../secret'],
    ['otro recurso', 'files/secret'],
    ['unicode', 'models/veo/operations/operación'],
  ])('rechaza operación malformada: %s', async (_case, name) => {
    const fetchImpl = vi.fn(async () => json({ name }));

    await expect(
      startGoogleVideoOperation(request, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'personal-key',
      }),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });

  it('redacta la key y el prompt reflejados por Google', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { message: `personal-key ${request.prompt}` } }, 500),
    );

    let thrown: unknown;
    try {
      await startGoogleVideoOperation(request, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'personal-key',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'provider_error' });
    expect((thrown as Error).message).not.toContain('personal-key');
    expect((thrown as Error).message).not.toContain(request.prompt);
  });

  it('propaga AbortSignal al inicio', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException('aborted', 'AbortError');
    });

    await expect(
      startGoogleVideoOperation(request, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'k',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('pollGoogleVideoOperation', () => {
  it('consulta la operación existente sin reiniciarla y mantiene IN_PROGRESS', async () => {
    const fetchImpl = vi.fn(async () => json({ name: operationName, done: false }));

    const result = await pollGoogleVideoOperation(operationName, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'personal-key',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      expect.objectContaining({ method: 'GET', redirect: 'error' }),
    );
    expect(result).toEqual({ status: 'IN_PROGRESS' });
  });

  it('convierte el URI final validado en una descarga opaca propia', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        name: operationName,
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: videoUri } }],
          },
        },
      }),
    );

    const result = await pollGoogleVideoOperation(operationName, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'personal-key',
    });

    expect(result).toEqual({
      status: 'COMPLETED',
      output: {
        kind: 'video',
        download_url: expect.stringMatching(/^\/v1\/downloads\/[A-Za-z0-9_-]+$/),
      },
    });
    expect(JSON.stringify(result)).not.toContain(videoUri);
  });

  it.each([
    'http://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media',
    'https://127.0.0.1/v1beta/files/video-123:download?alt=media',
    'https://evil.example/v1beta/files/video-123:download?alt=media',
    'https://generativelanguage.googleapis.com.evil.example/v1beta/files/video-123:download?alt=media',
    'https://generativelanguage.googleapis.com/v1beta/files/../models/secret:download?alt=media',
    'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media&x=1',
  ])('rechaza URI final no permitido: %s', async (uri) => {
    const fetchImpl = vi.fn(async () =>
      json({
        done: true,
        response: {
          generateVideoResponse: { generatedSamples: [{ video: { uri } }] },
        },
      }),
    );

    await expect(
      pollGoogleVideoOperation(operationName, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'k',
      }),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });

  it('mapea un error terminal sin filtrar secretos', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ done: true, error: { code: 13, message: `failed personal-key ${videoUri}` } }),
    );

    let thrown: unknown;
    try {
      await pollGoogleVideoOperation(operationName, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'personal-key',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ code: 'provider_error' });
    expect((thrown as Error).message).not.toContain('personal-key');
    expect((thrown as Error).message).not.toContain(videoUri);
  });
});

describe('downloadGoogleVideo', () => {
  it('descodifica solo tokens canónicos y no conserva la URL original', () => {
    const token = encodeGoogleVideoDownloadToken(videoUri);
    expect(token).not.toContain('google');
    expect(decodeGoogleVideoDownloadToken(token)).toBe(videoUri);
    expect(() => decodeGoogleVideoDownloadToken(`${token}.extra`)).toThrow(/token/i);
  });

  it('descarga autenticada sin redirects, valida MP4 y limita el tamaño', async () => {
    const bytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(bytes, {
          headers: {
            'content-type': 'video/mp4',
            'content-length': String(bytes.byteLength),
          },
        }),
    );

    const result = await downloadGoogleVideo(encodeGoogleVideoDownloadToken(videoUri), {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'personal-key',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      videoUri,
      expect.objectContaining({
        method: 'GET',
        redirect: 'manual',
        headers: { 'x-goog-api-key': 'personal-key' },
      }),
    );
    expect(result).toMatchObject({ contentType: 'video/mp4', bytes });
  });

  it.each([
    [
      'redirect externo',
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/private.mp4' },
      }),
    ],
    ['tipo activo', new Response('<script>', { headers: { 'content-type': 'text/html' } })],
    [
      'tamaño declarado excesivo',
      new Response('x', {
        headers: { 'content-type': 'video/mp4', 'content-length': String(101 * 1024 * 1024) },
      }),
    ],
  ])('bloquea %s', async (_case, response) => {
    const fetchImpl = vi.fn(async () => response);

    await expect(
      downloadGoogleVideo(encodeGoogleVideoDownloadToken(videoUri), {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        apiKey: 'k',
      }),
    ).rejects.toMatchObject({ code: 'provider_error' });
  });
});
