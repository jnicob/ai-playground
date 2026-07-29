import { describe, expect, it } from 'vitest';
import { buildApiRequest, buildApiTraceRequest } from './api-request';
import type { EditImageRequest, GenerateImageRequest, GenerateVideoRequest } from './types';

const image: GenerateImageRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 42,
};

describe('buildApiRequest', () => {
  it('construye la request canónica de generación de imagen', () => {
    expect(buildApiRequest(image, 'https://api.test/')).toEqual({
      method: 'POST',
      url: 'https://api.test/v1/services/generate-image',
      headers: { 'content-type': 'application/json' },
      body: {
        provider: 'pollinations',
        prompt: 'a red fox',
        model: 'flux',
        aspect_ratio: 'square_1_1',
        seed: 42,
      },
    });
  });

  it('incluye source_image snake_case solo en edición', () => {
    const edit: EditImageRequest = {
      ...image,
      service: 'edit-image',
      provider: 'google',
      model: 'gemini-3.1-flash-lite-image',
      sourceImage: { mimeType: 'image/png', data: 'private-base64-sentinel' },
    };

    expect(buildApiRequest(edit, 'https://api.test').body).toEqual({
      provider: 'google',
      prompt: 'a red fox',
      model: 'gemini-3.1-flash-lite-image',
      aspect_ratio: 'square_1_1',
      seed: 42,
      source_image: {
        mime_type: 'image/png',
        data: 'private-base64-sentinel',
      },
    });
  });

  it('incluye las opciones válidas de vídeo', () => {
    const video: GenerateVideoRequest = {
      ...image,
      service: 'generate-video',
      provider: 'google',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'vertical_9_16',
      durationSeconds: 4,
      resolution: '720p',
    };

    expect(buildApiRequest(video, 'https://api.test').body).toEqual({
      provider: 'google',
      prompt: 'a red fox',
      model: 'veo-3.1-lite-generate-preview',
      aspect_ratio: 'vertical_9_16',
      seed: 42,
      duration_seconds: 4,
      resolution: '720p',
    });
  });

  it('crea una traza segura que sustituye el medio sin mutar la request de red', () => {
    const edit: EditImageRequest = {
      ...image,
      service: 'edit-image',
      provider: 'google',
      model: 'gemini-3.1-flash-lite-image',
      sourceImage: { mimeType: 'image/webp', data: 'private-base64-sentinel' },
    };

    const network = buildApiRequest(edit, 'https://api.test');
    const trace = buildApiTraceRequest(edit, 'https://api.test');

    expect(JSON.stringify(network)).toContain('private-base64-sentinel');
    expect(JSON.stringify(trace)).not.toContain('private-base64-sentinel');
    expect(trace.body).toMatchObject({
      source_image: { mime_type: 'image/webp', data: '<BASE64_IMAGE>' },
    });
    expect(edit.sourceImage.data).toBe('private-base64-sentinel');
  });
});
