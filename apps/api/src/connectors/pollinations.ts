import { ASPECT_RATIOS, PlatformError, type TaskOutput } from '@ai-playground/core';
import type { Connector } from './types';

const BASE_URL = 'https://image.pollinations.ai/prompt';

/**
 * Verificado 2026-07-29: GET con el prompt en el path devuelve los bytes de la imagen
 * (content-type image/*) y sirve la URL con CORS *. El Worker solo valida la respuesta y
 * devuelve la URL pública: no proxea bytes, así el CPU del Worker se mantiene mínimo.
 */
export const pollinationsConnector: Connector = async (request, ctx) => {
  const { width, height } = ASPECT_RATIOS[request.aspectRatio];
  const url = new URL(`${BASE_URL}/${encodeURIComponent(request.prompt)}`);
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('seed', String(request.seed));
  url.searchParams.set('model', request.model);
  url.searchParams.set('nologo', 'true');

  const response = await ctx.fetchImpl(url.toString(), {
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  if (!response.ok) {
    throw new PlatformError(
      response.status === 429 ? 'rate_limited' : 'provider_error',
      `Pollinations responded with ${response.status}`,
    );
  }
  if (!response.headers.get('content-type')?.startsWith('image/')) {
    throw new PlatformError('provider_error', 'Pollinations did not return an image');
  }

  const output: TaskOutput = { kind: 'image', url: url.toString(), width, height };
  return output;
};
