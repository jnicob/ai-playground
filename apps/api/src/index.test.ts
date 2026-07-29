import { describe, expect, it, vi, afterEach } from 'vitest';
import { API_ERROR_CODES, API_KEY_HEADER, decodeTaskId, encodeTaskId } from '@ai-playground/core';
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
              { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } },
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
      expect.arrayContaining(['/v1/services/{service}', '/v1/tasks/{task_id}']),
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
});
