import { PlatformError, type GenerateVideoRequest, type TaskOutput } from '@ai-playground/core';
import { mapGoogleError } from './google';
import { sanitizeUpstreamMessage } from './sanitize';
import type { ConnectorContext } from './types';

const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const OPERATION_NAME_PATTERN = /^models\/[A-Za-z0-9._-]+\/operations\/[A-Za-z0-9._-]+$/;
const FILE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const DOWNLOAD_PATH_PATTERN = /^\/v1beta\/files\/([a-z0-9-]{1,40}):download$/;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type GoogleOperationResult =
  { status: 'IN_PROGRESS' } | { status: 'COMPLETED'; output: TaskOutput };

export type GoogleVideoConnector = {
  start(request: GenerateVideoRequest, ctx: ConnectorContext): Promise<{ operationName: string }>;
  poll(operationName: string, ctx: ConnectorContext): Promise<GoogleOperationResult>;
  download(
    token: string,
    ctx: ConnectorContext,
  ): Promise<{ bytes: Uint8Array; contentType: 'video/mp4' }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireApiKey(ctx: ConnectorContext): string {
  if (!ctx.apiKey) throw new PlatformError('missing_api_key', 'Google requires an API key');
  return ctx.apiKey;
}

function validateOperationName(value: unknown, owner: 'provider' | 'client'): string {
  if (typeof value !== 'string' || value.length > 512 || !OPERATION_NAME_PATTERN.test(value)) {
    throw new PlatformError(
      owner === 'provider' ? 'provider_error' : 'invalid_request',
      owner === 'provider' ? 'Google returned an invalid operation' : 'Malformed video operation',
    );
  }
  return value;
}

function errorPayload(payload: unknown): {
  error?: { message?: string; details?: { reason?: string }[] };
} {
  if (!isRecord(payload) || !isRecord(payload.error)) return {};
  const details = Array.isArray(payload.error.details)
    ? payload.error.details.flatMap((detail) =>
        isRecord(detail) && typeof detail.reason === 'string' ? [{ reason: detail.reason }] : [],
      )
    : undefined;
  return {
    error: {
      ...(typeof payload.error.message === 'string' ? { message: payload.error.message } : {}),
      ...(details ? { details } : {}),
    },
  };
}

function reflectedSensitiveValues(message: string | undefined, apiKey: string): string[] {
  const urls = message?.match(/https?:\/\/[^\s]+/g) ?? [];
  return [apiKey, ...urls];
}

function operationError(payload: unknown, apiKey: string): PlatformError | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
  const message = typeof payload.error.message === 'string' ? payload.error.message : undefined;
  return new PlatformError(
    'provider_error',
    sanitizeUpstreamMessage(
      message,
      reflectedSensitiveValues(message, apiKey),
      'Google video generation failed',
    ),
  );
}

function parseVideoUri(value: unknown, errorCode: 'provider_error' | 'invalid_request'): string {
  if (typeof value !== 'string' || value.length > 2048) {
    throw new PlatformError(errorCode, 'Invalid Google video download URL');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PlatformError(errorCode, 'Invalid Google video download URL');
  }

  const match = DOWNLOAD_PATH_PATTERN.exec(url.pathname);
  const fileId = match?.[1];
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'generativelanguage.googleapis.com' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !fileId ||
    !FILE_ID_PATTERN.test(fileId) ||
    url.search !== '?alt=media' ||
    url.hash !== ''
  ) {
    throw new PlatformError(errorCode, 'Google video download URL is not allowed');
  }
  return fileId;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  try {
    return atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new PlatformError('invalid_request', 'Malformed video download token');
  }
}

function canonicalDownloadUrl(fileId: string): string {
  return `${API_BASE_URL}/files/${fileId}:download?alt=media`;
}

export function encodeGoogleVideoDownloadToken(videoUri: string): string {
  const fileId = parseVideoUri(videoUri, 'provider_error');
  return base64UrlEncode(`v1:${fileId}`);
}

export function decodeGoogleVideoDownloadToken(token: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) {
    throw new PlatformError('invalid_request', 'Malformed video download token');
  }
  const decoded = base64UrlDecode(token);
  if (!decoded.startsWith('v1:')) {
    throw new PlatformError('invalid_request', 'Malformed video download token');
  }
  const fileId = decoded.slice(3);
  if (!FILE_ID_PATTERN.test(fileId) || base64UrlEncode(decoded) !== token) {
    throw new PlatformError('invalid_request', 'Malformed video download token');
  }
  return canonicalDownloadUrl(fileId);
}

export async function startGoogleVideoOperation(
  request: GenerateVideoRequest,
  ctx: ConnectorContext,
): Promise<{ operationName: string }> {
  if (request.service !== 'generate-video' || request.provider !== 'google') {
    throw new PlatformError('invalid_request', 'Google video connector requires generate-video');
  }
  const apiKey = requireApiKey(ctx);
  const response = await ctx.fetchImpl(
    `${API_BASE_URL}/models/${request.model}:predictLongRunning`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        instances: [{ prompt: request.prompt }],
        parameters: {
          aspectRatio: request.aspectRatio === 'widescreen_16_9' ? '16:9' : '9:16',
          durationSeconds: request.durationSeconds,
          resolution: request.resolution,
          seed: request.seed,
        },
      }),
      redirect: 'error',
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    },
  );
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = errorPayload(payload);
    const message = upstream.error?.message;
    throw mapGoogleError(response.status, upstream, [
      apiKey,
      request.prompt,
      ...reflectedSensitiveValues(message, apiKey),
    ]);
  }
  const operationName = validateOperationName(
    isRecord(payload) ? payload.name : undefined,
    'provider',
  );
  return { operationName };
}

export async function pollGoogleVideoOperation(
  operationName: string,
  ctx: ConnectorContext,
): Promise<GoogleOperationResult> {
  const apiKey = requireApiKey(ctx);
  const validatedName = validateOperationName(operationName, 'client');
  const response = await ctx.fetchImpl(`${API_BASE_URL}/${validatedName}`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
    redirect: 'error',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const upstream = errorPayload(payload);
    const message = upstream.error?.message;
    throw mapGoogleError(response.status, upstream, reflectedSensitiveValues(message, apiKey));
  }

  const terminalError = operationError(payload, apiKey);
  if (terminalError) throw terminalError;
  if (!isRecord(payload) || payload.done !== true) return { status: 'IN_PROGRESS' };

  const responsePayload = isRecord(payload.response) ? payload.response : undefined;
  const generateVideoResponse =
    responsePayload && isRecord(responsePayload.generateVideoResponse)
      ? responsePayload.generateVideoResponse
      : undefined;
  const sample =
    generateVideoResponse &&
    Array.isArray(generateVideoResponse.generatedSamples) &&
    isRecord(generateVideoResponse.generatedSamples[0])
      ? generateVideoResponse.generatedSamples[0]
      : undefined;
  const video = sample && isRecord(sample.video) ? sample.video : undefined;
  const fileId = parseVideoUri(video?.uri, 'provider_error');
  const token = encodeGoogleVideoDownloadToken(canonicalDownloadUrl(fileId));
  return {
    status: 'COMPLETED',
    output: { kind: 'video', download_url: `/v1/downloads/${token}` },
  };
}

function isMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

export async function downloadGoogleVideo(
  token: string,
  ctx: ConnectorContext,
): Promise<{ bytes: Uint8Array; contentType: 'video/mp4' }> {
  const apiKey = requireApiKey(ctx);
  const url = decodeGoogleVideoDownloadToken(token);
  const response = await ctx.fetchImpl(url, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
    redirect: 'manual',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new PlatformError('provider_error', 'Google video redirect is not allowed');
  }
  if (!response.ok) {
    throw mapGoogleError(response.status, {}, apiKey);
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'video/mp4') {
    throw new PlatformError('provider_error', 'Google returned an unsupported video type');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_VIDEO_BYTES) {
    throw new PlatformError('provider_error', 'Google video exceeds the size limit');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) {
    throw new PlatformError('provider_error', 'Google video exceeds the size limit');
  }
  if (!isMp4(bytes)) {
    throw new PlatformError('provider_error', 'Google video signature does not match MP4');
  }
  return { bytes, contentType: 'video/mp4' };
}

export const googleVideoConnector: GoogleVideoConnector = {
  start: startGoogleVideoOperation,
  poll: pollGoogleVideoOperation,
  download: downloadGoogleVideo,
};
