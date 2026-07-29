import { z } from 'zod';
import { PlatformError } from './errors';
import { generationRequestSchema } from './registry';
import type { GenerationRequest } from './types';

/** Header por el que viaja la key del usuario en pass-through. Nunca se almacena server-side. */
export const API_KEY_HEADER = 'x-provider-key';

const TASK_ID_PREFIX = 'v1.';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/** Serialización canónica: orden de claves fijo → el mismo request produce siempre el mismo id. */
function canonical(request: GenerationRequest): string {
  return JSON.stringify({
    service: request.service,
    provider: request.provider,
    prompt: request.prompt,
    model: request.model,
    aspectRatio: request.aspectRatio,
    seed: request.seed,
  });
}

export function encodeTaskId(request: GenerationRequest): string {
  return `${TASK_ID_PREFIX}${toBase64Url(canonical(request))}`;
}

export function decodeTaskId(taskId: string): GenerationRequest {
  if (!taskId.startsWith(TASK_ID_PREFIX)) {
    throw new PlatformError('invalid_request', 'Unsupported task id version');
  }
  const payload = taskId.slice(TASK_ID_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
  const result = generationRequestSchema.safeParse(parsed);
  if (!result.success) throw new PlatformError('invalid_request', 'Malformed task id');
  return result.data;
}

export const taskOutputSchema = z.object({
  kind: z.literal('image'),
  url: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type TaskOutput = z.infer<typeof taskOutputSchema>;

const apiErrorSchema = z.object({
  code: z.enum([
    'invalid_request',
    'missing_api_key',
    'invalid_api_key',
    'content_blocked',
    'unsupported_provider',
    'rate_limited',
    'provider_error',
    'task_not_found',
  ]),
  message: z.string(),
});

export const taskResponseSchema = z.discriminatedUnion('status', [
  z.object({ task_id: z.string(), status: z.literal('IN_PROGRESS') }),
  z.object({
    task_id: z.string(),
    status: z.literal('COMPLETED'),
    provider: z.string(),
    elapsed_ms: z.number(),
    output: taskOutputSchema,
  }),
  z.object({ task_id: z.string(), status: z.literal('FAILED'), error: apiErrorSchema }),
]);

export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type ApiErrorBody = { error: z.infer<typeof apiErrorSchema> };
