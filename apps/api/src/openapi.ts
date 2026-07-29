import { API_ERROR_CODES, API_KEY_HEADER, SERVICES } from '@ai-playground/core';

/** Proveedores expuestos por HTTP; mock corre client-side y no tiene conector server-side. */
const HTTP_PROVIDERS = ['pollinations', 'google'] as const;

const taskOutput = {
  type: 'object',
  required: ['kind', 'url'],
  properties: {
    kind: { type: 'string', enum: ['image'] },
    url: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
  },
} as const;

const errorBody = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', enum: API_ERROR_CODES },
        message: { type: 'string' },
      },
    },
  },
} as const;

const keyHeader = {
  name: API_KEY_HEADER,
  in: 'header',
  required: false,
  schema: { type: 'string' },
  description: 'Provider API key, passed through per request. Never stored server-side.',
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'ai-playground API',
    version: '1.0.0',
    description:
      'Task-based generation API. Create a task, then poll it. Stateless: the task id encodes the request.',
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service is up' } },
      },
    },
    '/v1/services/{service}': {
      post: {
        summary: 'Create a generation task',
        parameters: [
          {
            name: 'service',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: SERVICES.map((s) => s.id) },
          },
          keyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['provider', 'prompt', 'model', 'aspect_ratio', 'seed'],
                properties: {
                  provider: { type: 'string', enum: HTTP_PROVIDERS },
                  prompt: { type: 'string', minLength: 1, maxLength: 1000 },
                  model: { type: 'string' },
                  aspect_ratio: {
                    type: 'string',
                    enum: ['square_1_1', 'widescreen_16_9', 'vertical_9_16'],
                  },
                  seed: { type: 'integer', minimum: 0, maximum: 999999 },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Task accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['task_id', 'status'],
                  properties: {
                    task_id: { type: 'string' },
                    status: { type: 'string', enum: ['IN_PROGRESS'] },
                  },
                },
              },
            },
          },
          '400': {
            description:
              'Invalid request, or unsupported_provider (the provider has no HTTP connector, e.g. mock, which runs client-side only)',
            content: { 'application/json': { schema: errorBody } },
          },
          '428': {
            description: 'Provider API key required',
            content: { 'application/json': { schema: errorBody } },
          },
        },
      },
    },
    '/v1/tasks/{task_id}': {
      get: {
        summary: 'Get task status and result',
        parameters: [
          { name: 'task_id', in: 'path', required: true, schema: { type: 'string' } },
          keyHeader,
        ],
        responses: {
          '200': {
            description: 'Task state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['task_id', 'status'],
                  properties: {
                    task_id: { type: 'string' },
                    status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'] },
                    provider: { type: 'string' },
                    elapsed_ms: { type: 'integer' },
                    output: taskOutput,
                    error: errorBody.properties.error,
                  },
                },
              },
            },
          },
          '400': {
            description: 'Malformed task id',
            content: { 'application/json': { schema: errorBody } },
          },
          '401': {
            description: 'Invalid provider API key',
            content: { 'application/json': { schema: errorBody } },
          },
          '422': {
            description: 'Content blocked by the provider',
            content: { 'application/json': { schema: errorBody } },
          },
          '428': {
            description: 'Provider API key required',
            content: { 'application/json': { schema: errorBody } },
          },
        },
      },
    },
  },
} as const;
