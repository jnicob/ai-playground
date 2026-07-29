import { z } from 'zod';
import { API_ERROR_CODES, PlatformError } from './errors';
import { generationRequestSchema } from './registry';
import type { GenerateImageRequest } from './types';

/** Header por el que viaja la key del usuario en pass-through. Nunca se almacena server-side. */
export const API_KEY_HEADER = 'x-provider-key';

const REQUEST_TASK_ID_PREFIX = 'v1.';
const OPERATION_TASK_ID_PREFIX = 'v2.';
const MAX_TASK_ID_LENGTH = 4096;

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
function canonicalRequest(request: GenerateImageRequest): string {
  return JSON.stringify({
    service: request.service,
    provider: request.provider,
    prompt: request.prompt,
    model: request.model,
    aspectRatio: request.aspectRatio,
    seed: request.seed,
  });
}

export function encodeTaskId(request: GenerateImageRequest): string {
  const result = generationRequestSchema.safeParse(request);
  if (!result.success) throw new PlatformError('invalid_request', 'Invalid generation request');
  return `${REQUEST_TASK_ID_PREFIX}${toBase64Url(canonicalRequest(result.data))}`;
}

function parsePayload(taskId: string, prefix: string): unknown {
  if (taskId.length > MAX_TASK_ID_LENGTH) {
    throw new PlatformError('invalid_request', 'Task id exceeds maximum length');
  }
  if (!taskId.startsWith(prefix)) {
    throw new PlatformError('invalid_request', 'Unsupported task id version');
  }
  const payload = taskId.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
  try {
    return JSON.parse(fromBase64Url(payload)) as unknown;
  } catch {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
}

const operationTaskInputSchema = z
  .object({
    service: z.literal('generate-video'),
    provider: z.literal('google'),
    operationName: z
      .string()
      .max(512)
      .regex(/^models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9._-]+$/),
  })
  .strict();

const operationTaskSchema = z
  .object({
    kind: z.literal('operation'),
    ...operationTaskInputSchema.shape,
  })
  .strict();

export type OperationTask = z.infer<typeof operationTaskInputSchema>;

export type TaskReference =
  | { version: 'v1'; kind: 'request'; request: GenerateImageRequest }
  | ({ version: 'v2' } & z.infer<typeof operationTaskSchema>);

export function encodeOperationTaskId(operation: unknown): string {
  const result = operationTaskInputSchema.safeParse(operation);
  if (!result.success) throw new PlatformError('invalid_request', 'Malformed task id');
  return `${OPERATION_TASK_ID_PREFIX}${toBase64Url(
    JSON.stringify({
      kind: 'operation',
      service: result.data.service,
      provider: result.data.provider,
      operationName: result.data.operationName,
    }),
  )}`;
}

export function decodeTaskReference(taskId: string): TaskReference {
  if (taskId.length > MAX_TASK_ID_LENGTH) {
    throw new PlatformError('invalid_request', 'Task id exceeds maximum length');
  }

  if (taskId.startsWith(REQUEST_TASK_ID_PREFIX)) {
    const result = generationRequestSchema.safeParse(parsePayload(taskId, REQUEST_TASK_ID_PREFIX));
    if (!result.success) throw new PlatformError('invalid_request', 'Malformed task id');
    return { version: 'v1', kind: 'request', request: result.data };
  }

  if (taskId.startsWith(OPERATION_TASK_ID_PREFIX)) {
    const result = operationTaskSchema.safeParse(parsePayload(taskId, OPERATION_TASK_ID_PREFIX));
    if (!result.success) throw new PlatformError('invalid_request', 'Malformed task id');
    return { version: 'v2', ...result.data };
  }

  throw new PlatformError('invalid_request', 'Unsupported task id version');
}

/** Compatibilidad con la API de fase B: solo los ids v1 contienen una request ejecutable. */
export function decodeTaskId(taskId: string): GenerateImageRequest {
  const reference = decodeTaskReference(taskId);
  if (reference.kind !== 'request') {
    throw new PlatformError('invalid_request', 'Task id does not contain a generation request');
  }
  return reference.request;
}

const imageOutputSchema = z
  .object({
    kind: z.literal('image'),
    url: z.string().min(1),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

const imagePairOutputSchema = z
  .object({
    kind: z.literal('image-pair'),
    before_url: z.string().min(1),
    after_url: z.string().min(1),
  })
  .strict();

const videoOutputSchema = z
  .object({
    kind: z.literal('video'),
    download_url: z.string().min(1),
    poster_url: z.string().min(1).optional(),
  })
  .strict();

export const taskOutputSchema = z.discriminatedUnion('kind', [
  imageOutputSchema,
  imagePairOutputSchema,
  videoOutputSchema,
]);

export type TaskOutput = z.infer<typeof taskOutputSchema>;

const apiErrorSchema = z
  .object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
  })
  .strict();

const inProgressResponseSchema = z
  .object({ task_id: z.string().min(1), status: z.literal('IN_PROGRESS') })
  .strict();

const completedResponseFields = {
  status: z.literal('COMPLETED'),
  provider: z.string().min(1),
  elapsed_ms: z.number().nonnegative(),
  output: taskOutputSchema,
} as const;

export const serviceResponseSchema = z.discriminatedUnion('status', [
  inProgressResponseSchema,
  z.object(completedResponseFields).strict(),
]);

export type ServiceResponse = z.infer<typeof serviceResponseSchema>;

export const taskResponseSchema = z.discriminatedUnion('status', [
  inProgressResponseSchema,
  z
    .object({
      task_id: z.string().min(1),
      ...completedResponseFields,
    })
    .strict(),
  z
    .object({
      task_id: z.string().min(1),
      status: z.literal('FAILED'),
      error: apiErrorSchema,
    })
    .strict(),
]);

export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type ApiErrorBody = { error: z.infer<typeof apiErrorSchema> };
