import type { ApiTraceStep, GenerationRequest } from './types';

export type ApiRequestBody =
  | {
      provider: GenerationRequest['provider'];
      prompt: string;
      model: string;
      aspect_ratio: GenerationRequest['aspectRatio'];
      seed: number;
    }
  | {
      provider: GenerationRequest['provider'];
      prompt: string;
      model: string;
      aspect_ratio: GenerationRequest['aspectRatio'];
      seed: number;
      source_image: {
        mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
        data: string;
      };
    }
  | {
      provider: GenerationRequest['provider'];
      prompt: string;
      model: string;
      aspect_ratio: 'widescreen_16_9' | 'vertical_9_16';
      seed: number;
      duration_seconds: 4 | 6 | 8;
      resolution: '720p';
    };

export type CanonicalApiRequest = {
  method: 'POST';
  url: string;
  headers: { 'content-type': 'application/json' };
  body: ApiRequestBody;
};

export type ApiTraceRequest = Extract<ApiTraceStep, { kind: 'request' }>;

function baseBody(request: GenerationRequest) {
  return {
    provider: request.provider,
    prompt: request.prompt,
    model: request.model,
    aspect_ratio: request.aspectRatio,
    seed: request.seed,
  };
}

function requestBody(request: GenerationRequest, redactMedia: boolean): ApiRequestBody {
  if (request.service === 'edit-image') {
    return {
      ...baseBody(request),
      source_image: {
        mime_type: request.sourceImage.mimeType,
        data: redactMedia ? '<BASE64_IMAGE>' : request.sourceImage.data,
      },
    };
  }

  if (request.service === 'generate-video') {
    return {
      ...baseBody(request),
      duration_seconds: request.durationSeconds,
      resolution: request.resolution,
    };
  }

  return baseBody(request);
}

function serviceUrl(apiBaseUrl: string, service: GenerationRequest['service']): string {
  return `${apiBaseUrl.replace(/\/+$/, '')}/v1/services/${service}`;
}

export function buildApiRequest(
  request: GenerationRequest,
  apiBaseUrl: string,
): CanonicalApiRequest {
  return {
    method: 'POST',
    url: serviceUrl(apiBaseUrl, request.service),
    headers: { 'content-type': 'application/json' },
    body: requestBody(request, false),
  };
}

export function buildApiTraceRequest(
  request: GenerationRequest,
  apiBaseUrl: string,
): ApiTraceRequest {
  return {
    kind: 'request',
    method: 'POST',
    url: serviceUrl(apiBaseUrl, request.service),
    body: requestBody(request, true),
  };
}
