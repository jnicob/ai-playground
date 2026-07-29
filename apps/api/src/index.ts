import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  API_KEY_HEADER,
  PlatformError,
  decodeTaskId,
  encodeTaskId,
  generationRequestSchema,
  providerById,
  type ApiErrorCode,
  type GenerationRequest,
} from '@ai-playground/core';
import { connectorFor } from './connectors';
import { openApiDocument } from './openapi';

export const app = new Hono();

app.use('/v1/*', cors({ origin: '*', allowHeaders: ['content-type', API_KEY_HEADER] }));

app.get('/health', (c) => c.json({ status: 'ok', service: 'ai-playground-api' }));
app.get('/openapi.json', (c) => c.json(openApiDocument));

const STATUS_BY_CODE: Partial<Record<ApiErrorCode, 400 | 401 | 422 | 428>> = {
  invalid_request: 400,
  unsupported_provider: 400,
  invalid_api_key: 401,
  content_blocked: 422,
  missing_api_key: 428,
};

function errorResponse(error: PlatformError) {
  return {
    body: { error: { code: error.code, message: error.message } },
    status: STATUS_BY_CODE[error.code] ?? 400,
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** El proveedor exige key y no vino en el header → 428, antes de tocar al proveedor. */
function assertKeyIfRequired(request: GenerationRequest, apiKey: string | undefined): void {
  if (providerById(request.provider).auth === 'api-key' && !apiKey) {
    throw new PlatformError(
      'missing_api_key',
      `Provider "${request.provider}" requires an API key`,
    );
  }
}

app.post('/v1/services/:service', async (c) => {
  let request: GenerationRequest;
  try {
    const payload: unknown = await c.req.json().catch(() => ({}));
    const raw = isRecord(payload) ? payload : {};
    const sourceImage = isRecord(raw.source_image)
      ? {
          mimeType: raw.source_image.mime_type,
          data: raw.source_image.data,
        }
      : undefined;
    const parsed = generationRequestSchema.safeParse({
      service: c.req.param('service'),
      provider: raw.provider,
      prompt: raw.prompt,
      model: raw.model,
      aspectRatio: raw.aspect_ratio,
      seed: raw.seed,
      ...(sourceImage ? { sourceImage } : {}),
      ...(raw.duration_seconds === undefined ? {} : { durationSeconds: raw.duration_seconds }),
      ...(raw.resolution === undefined ? {} : { resolution: raw.resolution }),
    });
    if (!parsed.success) throw new PlatformError('invalid_request', 'Invalid generation request');
    request = parsed.data;
    connectorFor(request.provider, request.service);
    assertKeyIfRequired(request, c.req.header(API_KEY_HEADER));
  } catch (error) {
    const platform =
      error instanceof PlatformError
        ? error
        : new PlatformError('invalid_request', 'Invalid request');
    const { body, status } = errorResponse(platform);
    return c.json(body, status);
  }

  if (request.service === 'edit-image') {
    const started = Date.now();
    try {
      const apiKey = c.req.header(API_KEY_HEADER);
      const output = await connectorFor(request.provider, request.service)(request, {
        fetchImpl: globalThis.fetch.bind(globalThis),
        ...(apiKey ? { apiKey } : {}),
      });
      return c.json(
        {
          status: 'COMPLETED',
          provider: request.provider,
          elapsed_ms: Date.now() - started,
          output,
        },
        200,
      );
    } catch (error) {
      const platform =
        error instanceof PlatformError
          ? error
          : new PlatformError('provider_error', 'Image editing failed');
      const { body, status } = errorResponse(platform);
      const syncStatus =
        platform.code === 'rate_limited' ? 429 : platform.code === 'provider_error' ? 502 : status;
      return c.json(body, syncStatus);
    }
  }

  if (request.service !== 'generate-image') {
    const { body, status } = errorResponse(
      new PlatformError('unsupported_provider', 'Service is not available yet'),
    );
    return c.json(body, status);
  }
  return c.json({ task_id: encodeTaskId(request), status: 'IN_PROGRESS' }, 202);
});

app.get('/v1/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const apiKey = c.req.header(API_KEY_HEADER);

  let request: GenerationRequest;
  try {
    request = decodeTaskId(taskId);
    assertKeyIfRequired(request, apiKey);
  } catch (error) {
    const platform =
      error instanceof PlatformError
        ? error
        : new PlatformError('invalid_request', 'Malformed task id');
    const { body, status } = errorResponse(platform);
    return c.json(body, status);
  }

  const started = Date.now();
  try {
    const connector = connectorFor(request.provider, request.service);
    const output = await connector(request, {
      fetchImpl: globalThis.fetch.bind(globalThis),
      ...(apiKey ? { apiKey } : {}),
    });
    return c.json({
      task_id: taskId,
      status: 'COMPLETED',
      provider: request.provider,
      elapsed_ms: Date.now() - started,
      output,
    });
  } catch (error) {
    if (error instanceof PlatformError && STATUS_BY_CODE[error.code]) {
      const { body, status } = errorResponse(error);
      return c.json(body, status);
    }
    const code: ApiErrorCode = error instanceof PlatformError ? error.code : 'provider_error';
    const message = error instanceof Error ? error.message : 'Generation failed';
    return c.json({ task_id: taskId, status: 'FAILED', error: { code, message } });
  }
});

export default app;
