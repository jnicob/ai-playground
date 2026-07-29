import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  API_ERROR_CODES,
  API_KEY_HEADER,
  decodeTaskId,
  decodeTaskReference,
  encodeTaskId,
  encodeOperationTaskId,
} from '@ai-playground/core';
import { app } from './index';

const request = {
  service: 'generate-image' as const,
  provider: 'pollinations' as const,
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1' as const,
  seed: 3,
};

const body = (over: Record<string, unknown> = {}) => ({
  provider: request.provider,
  prompt: request.prompt,
  model: request.model,
  aspect_ratio: request.aspectRatio,
  seed: request.seed,
  ...over,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  app.request('/v1/services/generate-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

const postEdit = (payload: unknown, headers: Record<string, string> = {}) =>
  app.request('/v1/services/edit-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

const postVideo = (payload: unknown, headers: Record<string, string> = {}) =>
  app.request('/v1/services/generate-video', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('GET /health responde ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'ai-playground-api' });
  });

  it('ruta desconocida → 404', async () => {
    expect((await app.request('/nope')).status).toBe(404);
  });
});

describe('POST /v1/services/:service', () => {
  it('devuelve 202 con un task_id que decodifica a la request', async () => {
    const res = await post(body());
    expect(res.status).toBe(202);
    const json = (await res.json()) as { task_id: string; status: string };
    expect(json.status).toBe('IN_PROGRESS');
    expect(decodeTaskId(json.task_id)).toEqual(request);
  });

  it('es determinista: la misma request produce el mismo task_id', async () => {
    const first = (await (await post(body())).json()) as { task_id: string };
    const second = (await (await post(body())).json()) as { task_id: string };
    expect(first.task_id).toBe(second.task_id);
  });

  it('rechaza un body inválido con 400 invalid_request', async () => {
    const res = await post(body({ prompt: '   ' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('rechaza un servicio desconocido con 400', async () => {
    const res = await app.request('/v1/services/make-coffee', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(400);
  });

  it('exige la key con 428 cuando el proveedor la requiere', async () => {
    const res = await post(body({ provider: 'google', model: 'gemini-2.5-flash-image' }));
    expect(res.status).toBe(428);
    expect(await res.json()).toMatchObject({ error: { code: 'missing_api_key' } });
  });

  it('acepta el proveedor con key cuando viene el header', async () => {
    const res = await post(body({ provider: 'google', model: 'gemini-2.5-flash-image' }), {
      [API_KEY_HEADER]: 'k',
    });
    expect(res.status).toBe(202);
  });

  it('rechaza el proveedor mock con 400 unsupported_provider: no tiene conector HTTP y su GET nunca completaría', async () => {
    const res = await post(body({ provider: 'mock' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'unsupported_provider' } });
  });

  it('sigue aceptando pollinations (sin key)', async () => {
    const res = await post(body({ provider: 'pollinations' }));
    expect(res.status).toBe(202);
  });
});

describe('GET /v1/tasks/:taskId', () => {
  it('ejecuta el conector y devuelve COMPLETED con output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          }),
      ),
    );
    const res = await app.request(`/v1/tasks/${encodeTaskId(request)}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      status: 'COMPLETED',
      provider: 'pollinations',
      output: { kind: 'image' },
    });
    expect(typeof json.elapsed_ms).toBe('number');
  });

  it('invoca el fetch global con el contexto requerido por Cloudflare Workers', async () => {
    const fetchMock = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
        throw new TypeError('Illegal invocation');
      }
      return Promise.resolve(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'image/jpeg' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request(`/v1/tasks/${encodeTaskId(request)}`);

    expect(await res.json()).toMatchObject({
      status: 'COMPLETED',
      provider: 'pollinations',
    });
  });

  it('devuelve FAILED con el código mapeado cuando el proveedor falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const res = await app.request(`/v1/tasks/${encodeTaskId(request)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'FAILED',
      error: { code: 'provider_error' },
    });
  });

  it('rechaza un task id corrupto con 400', async () => {
    const res = await app.request('/v1/tasks/v9.zzz');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('pasa la key del header al conector y nunca la devuelve en la respuesta', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });
    const res = await app.request(`/v1/tasks/${googleId}`, {
      headers: { [API_KEY_HEADER]: 'secret-key' },
    });
    const raw = await res.text();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(raw).not.toContain('secret-key');
  });

  it('devuelve 428 si falta la key del proveedor que la requiere', async () => {
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });
    const res = await app.request(`/v1/tasks/${googleId}`);
    expect(res.status).toBe(428);
  });

  it.each([
    [403, 401, 'invalid_api_key'],
    [429, 429, 'rate_limited'],
  ])('mapea Google %i a HTTP %i con código %s', async (providerStatus, status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'provider rejected request' } }), {
            status: providerStatus,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });

    const res = await app.request(`/v1/tasks/${googleId}`, {
      headers: { [API_KEY_HEADER]: 'personal-key-placeholder' },
    });

    expect(res.status).toBe(status);
    expect(await res.json()).toMatchObject({ error: { code } });
  });

  it('devuelve 422 content_blocked cuando google bloquea el contenido por seguridad (200 sin imagen)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ candidates: [{ content: { parts: [] } }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });
    const res = await app.request(`/v1/tasks/${googleId}`, {
      headers: { [API_KEY_HEADER]: 'k' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'content_blocked' } });
  });
});

describe('POST /v1/services/edit-image', () => {
  const sourceData = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
  const editBody = {
    provider: 'google',
    prompt: 'make it blue',
    model: 'gemini-3.1-flash-lite-image',
    aspect_ratio: 'square_1_1',
    seed: 7,
    source_image: { mime_type: 'image/png', data: sourceData },
  };

  it('ejecuta síncrono y devuelve 200 COMPLETED sin task_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: { parts: [{ inlineData: { mimeType: 'image/png', data: sourceData } }] },
                },
              ],
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const res = await postEdit(editBody, { [API_KEY_HEADER]: 'secret-key' });
    const raw = await res.text();
    const responseBody = JSON.parse(raw);
    expect({ status: res.status, body: responseBody }).toMatchObject({
      status: 200,
      body: {
        status: 'COMPLETED',
        provider: 'google',
        output: { kind: 'image-pair' },
      },
    });
    expect(responseBody).not.toHaveProperty('task_id');
    expect(raw).not.toContain('secret-key');
  });

  it('rechaza upload inválido y falta de key antes de llamar al proveedor', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await postEdit(editBody)).status).toBe(428);
    expect(
      (
        await postEdit(
          { ...editBody, source_image: { mime_type: 'image/jpeg', data: sourceData } },
          { [API_KEY_HEADER]: 'k' },
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Veo long-running y descarga', () => {
  const operationName = 'models/veo-3.1-lite-generate-preview/operations/abc-123';
  const videoBody = {
    provider: 'google',
    prompt: 'A paper boat crossing a moonlit pond',
    model: 'veo-3.1-lite-generate-preview',
    aspect_ratio: 'widescreen_16_9',
    seed: 17,
    duration_seconds: 4,
    resolution: '720p',
  };

  it('inicia una operación una sola vez y devuelve 202 con task_id v2', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ name: operationName, done: false }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await postVideo(videoBody, { [API_KEY_HEADER]: 'personal-key' });
    const payload = (await res.json()) as { task_id: string; status: string };

    expect(res.status).toBe(202);
    expect(payload.status).toBe('IN_PROGRESS');
    expect(decodeTaskReference(payload.task_id)).toMatchObject({
      version: 'v2',
      kind: 'operation',
      service: 'generate-video',
      provider: 'google',
      operationName,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polling v2 consulta la operación sin volver a ejecutar POST', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ name: operationName, done: false }));
    vi.stubGlobal('fetch', fetchMock);
    const taskId = encodeOperationTaskId({
      service: 'generate-video',
      provider: 'google',
      operationName,
    });

    const res = await app.request(`/v1/tasks/${taskId}`, {
      headers: { [API_KEY_HEADER]: 'personal-key' },
    });

    expect(await res.json()).toEqual({ task_id: taskId, status: 'IN_PROGRESS' });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('expone el resultado final solo mediante endpoint propio', async () => {
    const uri =
      'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          done: true,
          response: {
            generateVideoResponse: { generatedSamples: [{ video: { uri } }] },
          },
        }),
      ),
    );
    const taskId = encodeOperationTaskId({
      service: 'generate-video',
      provider: 'google',
      operationName,
    });

    const res = await app.request(`/v1/tasks/${taskId}`, {
      headers: { [API_KEY_HEADER]: 'personal-key' },
    });
    const raw = await res.text();
    const payload = JSON.parse(raw) as {
      output: { download_url: string };
    };

    expect(payload.output.download_url).toMatch(/^\/v1\/downloads\//);
    expect(raw).not.toContain(uri);
  });

  it('transmite MP4 autenticado sin cache compartida', async () => {
    const uri =
      'https://generativelanguage.googleapis.com/v1beta/files/video-123:download?alt=media';
    const { encodeGoogleVideoDownloadToken } = await import('./connectors/google-video');
    const token = encodeGoogleVideoDownloadToken(uri);
    const bytes = new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70]);
    const fetchMock = vi.fn(
      async () =>
        new Response(bytes, {
          headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.byteLength) },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request(`/v1/downloads/${token}`, {
      headers: { [API_KEY_HEADER]: 'personal-key' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ headers: { 'x-goog-api-key': 'personal-key' } }),
    );
  });

  it('rechaza descarga sin key o con token manipulado antes de hacer fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect((await app.request('/v1/downloads/not-a-token')).status).toBe(428);
    expect(
      (
        await app.request('/v1/downloads/not-a-token', {
          headers: { [API_KEY_HEADER]: 'k' },
        })
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('CORS y OpenAPI', () => {
  it('responde al preflight permitiendo el header de key', async () => {
    const res = await app.request('/v1/services/generate-image', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': API_KEY_HEADER,
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      API_KEY_HEADER,
    );
  });

  it('publica la spec OpenAPI con las dos rutas', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/v1/services/{service}',
        '/v1/tasks/{task_id}',
        '/v1/downloads/{token}',
      ]),
    );
  });

  it('documenta 401 (key inválida) y 422 (contenido bloqueado) en GET /v1/tasks/{task_id}', async () => {
    const res = await app.request('/openapi.json');
    type OpenApiOperation = { responses: Record<string, unknown> };
    type OpenApiDoc = { paths: { '/v1/tasks/{task_id}': { get: OpenApiOperation } } };
    const spec = (await res.json()) as OpenApiDoc;
    const responseCodes = Object.keys(spec.paths['/v1/tasks/{task_id}'].get.responses);
    expect(responseCodes).toEqual(expect.arrayContaining(['401', '422']));
  });

  it('no lista mock como provider expuesto y el enum de error codes coincide con API_ERROR_CODES', async () => {
    const res = await app.request('/openapi.json');
    type ProviderSchema = { enum: string[] };
    type RequestBodySchema = { properties: { provider: ProviderSchema } };
    type ErrorCodeSchema = { enum: string[] };
    type ErrorBodySchema = { properties: { error: { properties: { code: ErrorCodeSchema } } } };
    type OpenApiDoc = {
      paths: {
        '/v1/services/{service}': {
          post: {
            requestBody: { content: { 'application/json': { schema: RequestBodySchema } } };
            responses: { '400': { content: { 'application/json': { schema: ErrorBodySchema } } } };
          };
        };
      };
    };
    const spec = (await res.json()) as OpenApiDoc;
    const postOp = spec.paths['/v1/services/{service}'].post;
    const providerEnum =
      postOp.requestBody.content['application/json'].schema.properties.provider.enum;
    expect(providerEnum).not.toContain('mock');
    expect(providerEnum.sort()).toEqual(['google', 'pollinations'].sort());

    const errorCodeEnum =
      postOp.responses['400'].content['application/json'].schema.properties.error.properties.code
        .enum;
    expect(errorCodeEnum.sort()).toEqual([...API_ERROR_CODES].sort());
  });

  it('la descripción del 400 en POST /v1/services/{service} cubre unsupported_provider', async () => {
    const res = await app.request('/openapi.json');
    type OpenApiDoc = {
      paths: {
        '/v1/services/{service}': { post: { responses: { '400': { description: string } } } };
      };
    };
    const spec = (await res.json()) as OpenApiDoc;
    const description = spec.paths['/v1/services/{service}'].post.responses['400'].description;
    expect(description).toMatch(/unsupported_provider/i);
  });

  it('documenta edit-image síncrono y su source_image', async () => {
    const spec = (await (await app.request('/openapi.json')).json()) as {
      paths: {
        '/v1/services/{service}': {
          post: {
            parameters: { name: string; schema: { enum?: string[] } }[];
            requestBody: {
              content: {
                'application/json': {
                  schema: {
                    properties: { source_image?: { properties: Record<string, unknown> } };
                  };
                };
              };
            };
            responses: Record<string, unknown>;
          };
        };
      };
    };
    const operation = spec.paths['/v1/services/{service}'].post;
    expect(
      operation.parameters.find((parameter) => parameter.name === 'service')?.schema.enum,
    ).toContain('edit-image');
    expect(
      operation.parameters.find((parameter) => parameter.name === 'service')?.schema.enum,
    ).toContain('generate-video');
    expect(
      operation.requestBody.content['application/json'].schema.properties.source_image?.properties,
    ).toHaveProperty('mime_type');
    expect(operation.responses).toHaveProperty('200');
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
