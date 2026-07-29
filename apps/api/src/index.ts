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
    const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = generationRequestSchema.safeParse({
      service: c.req.param('service'),
      provider: raw.provider,
      prompt: raw.prompt,
      model: raw.model,
      aspectRatio: raw.aspect_ratio,
      seed: raw.seed,
    });
    if (!parsed.success) throw new PlatformError('invalid_request', 'Invalid generation request');
    request = parsed.data;
    connectorFor(request.provider);
    assertKeyIfRequired(request, c.req.header(API_KEY_HEADER));
  } catch (error) {
    const platform =
      error instanceof PlatformError
        ? error
        : new PlatformError('invalid_request', 'Invalid request');
    const { body, status } = errorResponse(platform);
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
    const connector = connectorFor(request.provider);
    const output = await connector(request, {
      fetchImpl: fetch,
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
