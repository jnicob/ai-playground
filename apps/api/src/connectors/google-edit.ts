import {
  PlatformError,
  type EditImageRequest,
  type SourceImage,
  type TaskOutput,
} from '@ai-playground/core';
import { mapGoogleError } from './google';
import type { Connector } from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
function isAllowedMimeType(value: unknown): value is SourceImage['mimeType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function googleErrorPayload(payload: unknown): {
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

function findInlineImage(payload: unknown): { mimeType: unknown; data: string } | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return undefined;
  for (const candidate of payload.candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content)) continue;
    if (!Array.isArray(candidate.content.parts)) continue;
    for (const part of candidate.content.parts) {
      if (!isRecord(part) || !isRecord(part.inlineData)) continue;
      if (typeof part.inlineData.data !== 'string') continue;
      return { mimeType: part.inlineData.mimeType, data: part.inlineData.data };
    }
  }
  return undefined;
}

function decodedLength(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

function isBase64Character(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0x30 && code <= 0x39) ||
    code === 0x2b ||
    code === 0x2f
  );
}

function hasValidBase64Grammar(data: string): boolean {
  if (!data || data.length % 4 !== 0) return false;
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  const contentLength = data.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (!isBase64Character(data.charCodeAt(index))) return false;
  }
  for (let index = contentLength; index < data.length; index += 1) {
    if (data[index] !== '=') return false;
  }
  return true;
}

function decodeBoundedBase64(
  data: string,
  maxBytes: number,
  owner: 'source' | 'provider',
): Uint8Array {
  const code = owner === 'source' ? 'invalid_request' : 'provider_error';
  const label = owner === 'source' ? 'Source image' : 'Google image';
  if (decodedLength(data) > maxBytes) {
    throw new PlatformError(code, `${label} exceeds the size limit`);
  }
  if (!hasValidBase64Grammar(data)) {
    throw new PlatformError(code, `${label} must be valid base64`);
  }
  try {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    throw new PlatformError(code, `${label} must be valid base64`);
  }
}

function hasExpectedSignature(mimeType: SourceImage['mimeType'], bytes: Uint8Array): boolean {
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function validateSourceImage(sourceImage: EditImageRequest['sourceImage']): void {
  if (!isAllowedMimeType(sourceImage.mimeType)) {
    throw new PlatformError('invalid_request', 'Unsupported source image type');
  }
  const bytes = decodeBoundedBase64(sourceImage.data, MAX_UPLOAD_BYTES, 'source');
  if (!hasExpectedSignature(sourceImage.mimeType, bytes)) {
    throw new PlatformError('invalid_request', 'Source image signature does not match its type');
  }
}

export const googleEditConnector: Connector = async (candidate, ctx) => {
  if (candidate.service !== 'edit-image') {
    throw new PlatformError('invalid_request', 'Google edit connector requires edit-image');
  }
  if (!ctx.apiKey) throw new PlatformError('missing_api_key', 'Google requires an API key');
  validateSourceImage(candidate.sourceImage);

  const response = await ctx.fetchImpl(`${BASE_URL}/${candidate.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.apiKey },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: candidate.prompt },
            {
              inlineData: {
                mimeType: candidate.sourceImage.mimeType,
                data: candidate.sourceImage.data,
              },
            },
          ],
        },
      ],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  const payload: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw mapGoogleError(response.status, googleErrorPayload(payload), [
      ctx.apiKey,
      candidate.sourceImage.data,
    ]);
  }

  const inline = findInlineImage(payload);
  if (!inline) {
    throw new PlatformError('content_blocked', 'Google returned no edited image');
  }
  if (!isAllowedMimeType(inline.mimeType)) {
    throw new PlatformError('provider_error', 'Google returned an unsupported image type');
  }
  const outputBytes = decodeBoundedBase64(inline.data, MAX_OUTPUT_BYTES, 'provider');
  if (!hasExpectedSignature(inline.mimeType, outputBytes)) {
    throw new PlatformError('provider_error', 'Google image signature does not match its type');
  }

  const output: TaskOutput = {
    kind: 'image-pair',
    before_url: `data:${candidate.sourceImage.mimeType};base64,${candidate.sourceImage.data}`,
    after_url: `data:${inline.mimeType};base64,${inline.data}`,
  };
  return output;
};
