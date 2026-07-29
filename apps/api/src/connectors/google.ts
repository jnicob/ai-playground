import { PlatformError, type AspectRatio, type TaskOutput } from '@ai-playground/core';
import type { Connector } from './types';
import { sanitizeUpstreamMessage } from './sanitize';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ASPECT_HINT: Record<AspectRatio, string> = {
  square_1_1: 'square 1:1 framing',
  widescreen_16_9: 'widescreen 16:9 framing',
  vertical_9_16: 'vertical 9:16 framing',
};

type GooglePart = { inlineData?: { mimeType?: string; data?: string } };

/**
 * Verificado 2026-07-29: :generateContent sigue vivo para los modelos de imagen y la auth va
 * por header x-goog-api-key. El control de aspect ratio por campo NO está verificado para
 * estos modelos, así que se transmite como sugerencia en el prompt y las dimensiones reales
 * quedan desconocidas (el contrato las hace opcionales en vez de declarar valores falsos).
 */
export const googleConnector: Connector = async (request, ctx) => {
  if (!ctx.apiKey) throw new PlatformError('missing_api_key', 'Google requires an API key');

  const response = await ctx.fetchImpl(`${BASE_URL}/${request.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${request.prompt} — ${ASPECT_HINT[request.aspectRatio]}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; details?: { reason?: string }[] };
    candidates?: { content?: { parts?: GooglePart[] } }[];
  };

  if (!response.ok) throw mapGoogleError(response.status, payload, ctx.apiKey);

  const inline = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  )?.inlineData;
  if (!inline?.data) {
    throw new PlatformError('content_blocked', 'Google returned no image for this prompt');
  }

  const output: TaskOutput = {
    kind: 'image',
    url: `data:${inline.mimeType ?? 'image/png'};base64,${inline.data}`,
  };
  return output;
};

export function mapGoogleError(
  status: number,
  payload: { error?: { message?: string; details?: { reason?: string }[] } },
  sensitiveValues: string | readonly string[] | undefined,
): PlatformError {
  const message = sanitizeUpstreamMessage(
    payload.error?.message,
    sensitiveValues,
    'Google request failed',
  );
  if (status === 429) return new PlatformError('rate_limited', message);
  if (status === 403) return new PlatformError('invalid_api_key', message);
  if (status === 400) {
    const invalidKey = payload.error?.details?.some((d) => d.reason === 'API_KEY_INVALID');
    return new PlatformError(invalidKey ? 'invalid_api_key' : 'invalid_request', message);
  }
  return new PlatformError('provider_error', message);
}
