import { describe, expect, it } from 'vitest';
import {
  MODEL_CATALOG,
  DEFAULT_VIDEO_SETTINGS,
  PRICING_VERIFIED_AT,
  PROVIDERS,
  SERVICE_CATALOG,
  generateImageRequestSchema,
  generationRequestSchema,
  modelById,
  modelsFor,
  providerById,
} from './registry';
import { ASPECT_RATIOS } from './types';

const valid = {
  service: 'generate-image',
  provider: 'mock',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 42,
};

describe('registry', () => {
  it('valida una request correcta', () => {
    expect(generationRequestSchema.parse(valid)).toEqual(valid);
    expect(generateImageRequestSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    ['prompt vacío', { ...valid, prompt: '  ' }],
    ['seed negativa', { ...valid, seed: -1 }],
    ['seed no entera', { ...valid, seed: 1.5 }],
    ['aspect ratio desconocido', { ...valid, aspectRatio: 'panoramic' }],
    ['provider desconocido', { ...valid, provider: 'unknown' }],
  ])('rechaza %s', (_name, input) => {
    expect(generationRequestSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza un modelo que no pertenece a la combinación provider × servicio', () => {
    expect(
      generationRequestSchema.safeParse({ ...valid, provider: 'google', model: 'flux' }).success,
    ).toBe(false);
    expect(
      generationRequestSchema.safeParse({
        ...valid,
        service: 'generate-video',
        provider: 'google',
        model: 'gemini-3.1-flash-image',
        aspectRatio: 'widescreen_16_9',
        durationSeconds: 4,
        resolution: '720p',
      }).success,
    ).toBe(false);
  });

  it('declara los tres servicios y todo modelo pertenece a uno de ellos', () => {
    expect(SERVICE_CATALOG.map((service) => service.id)).toEqual([
      'generate-image',
      'edit-image',
      'generate-video',
    ]);
    const serviceIds = SERVICE_CATALOG.map((service) => service.id);
    for (const model of MODEL_CATALOG) expect(serviceIds).toContain(model.service);
  });
  it('cada aspect ratio tiene dimensiones', () => {
    for (const dims of Object.values(ASPECT_RATIOS)) {
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    }
  });
});

describe('registry live', () => {
  it('declara los tres proveedores con su auth', () => {
    expect(PROVIDERS.map((p) => [p.id, p.auth])).toEqual([
      ['mock', 'none'],
      ['pollinations', 'none'],
      ['google', 'api-key'],
    ]);
  });

  it('solo google avisa de coste', () => {
    expect(PROVIDERS.filter((p) => p.costWarning).map((p) => p.id)).toEqual(['google']);
  });

  it('todo proveedor declara al menos un modelo de generate-image', () => {
    for (const p of PROVIDERS) expect(modelsFor(p.id, 'generate-image').length).toBeGreaterThan(0);
  });

  it('solo google live ofrece edición y vídeo', () => {
    expect(modelsFor('pollinations', 'edit-image')).toEqual([]);
    expect(modelsFor('pollinations', 'generate-video')).toEqual([]);
    expect(modelsFor('google', 'edit-image')).toEqual([
      'gemini-3.1-flash-lite-image',
      'gemini-3.1-flash-image',
    ]);
    expect(modelsFor('google', 'generate-video')).toEqual([
      'veo-3.1-lite-generate-preview',
      'veo-3.1-fast-generate-preview',
      'veo-3.1-generate-preview',
    ]);
  });

  it('usa Veo Lite como modelo inicial y declara sus restricciones', () => {
    expect(DEFAULT_VIDEO_SETTINGS).toEqual({
      provider: 'google',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'widescreen_16_9',
      durationSeconds: 4,
      resolution: '720p',
    });
    const lite = modelById('google', 'generate-video', modelsFor('google', 'generate-video')[0]!);
    expect(lite).toMatchObject({
      id: 'veo-3.1-lite-generate-preview',
      service: 'generate-video',
      aspectRatios: ['widescreen_16_9', 'vertical_9_16'],
      durationSeconds: [4, 6, 8],
      resolutions: ['720p'],
      pricing: { currency: 'USD', unit: 'second', amount: 0.05 },
    });
  });

  it('fecha y cifra los costes oficiales de Google como estimaciones', () => {
    expect(PRICING_VERIFIED_AT).toBe('2026-07-29');
    expect(modelById('google', 'edit-image', 'gemini-3.1-flash-lite-image').pricing).toEqual({
      currency: 'USD',
      unit: 'image',
      amount: 0.0336,
      verifiedAt: PRICING_VERIFIED_AT,
      sourceUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    });
    expect(modelById('google', 'generate-video', 'veo-3.1-generate-preview').pricing).toEqual(
      expect.objectContaining({ unit: 'second', amount: 0.4 }),
    );
  });

  it('modelById rechaza combinaciones inexistentes', () => {
    expect(() => modelById('google', 'generate-video', 'flux')).toThrow(/unknown model/i);
  });

  it('acepta requests de proveedores live', () => {
    const base = {
      service: 'generate-image',
      prompt: 'a red fox',
      aspectRatio: 'square_1_1',
      seed: 7,
    };
    expect(
      generationRequestSchema.safeParse({ ...base, provider: 'pollinations', model: 'flux' })
        .success,
    ).toBe(true);
    expect(
      generationRequestSchema.safeParse({
        ...base,
        provider: 'google',
        model: 'gemini-2.5-flash-image',
      }).success,
    ).toBe(true);
  });

  it('providerById lanza para un proveedor desconocido', () => {
    expect(() => providerById('nope' as never)).toThrow(/unknown provider/i);
  });
});

describe('requests de edición y vídeo', () => {
  it('acepta una edición con source image tipada', () => {
    const edit = {
      ...valid,
      service: 'edit-image',
      provider: 'google',
      model: 'gemini-3.1-flash-lite-image',
      sourceImage: { mimeType: 'image/png', data: 'YQ==' },
    };
    expect(generationRequestSchema.parse(edit)).toEqual(edit);
  });

  it.each([
    ['sin source image', { ...valid, service: 'edit-image', provider: 'google' }],
    [
      'MIME no permitido',
      {
        ...valid,
        service: 'edit-image',
        provider: 'google',
        model: 'gemini-3.1-flash-lite-image',
        sourceImage: { mimeType: 'image/svg+xml', data: 'PHN2Zz4=' },
      },
    ],
  ])('rechaza edición %s', (_name, edit) => {
    expect(generationRequestSchema.safeParse(edit).success).toBe(false);
  });

  it('acepta vídeo 720p horizontal o vertical de 4/6/8 segundos', () => {
    for (const aspectRatio of ['widescreen_16_9', 'vertical_9_16'])
      for (const durationSeconds of [4, 6, 8]) {
        expect(
          generationRequestSchema.safeParse({
            ...valid,
            service: 'generate-video',
            provider: 'google',
            model: 'veo-3.1-lite-generate-preview',
            aspectRatio,
            durationSeconds,
            resolution: '720p',
          }).success,
        ).toBe(true);
      }
  });

  it.each([
    ['aspecto cuadrado', { aspectRatio: 'square_1_1', durationSeconds: 4, resolution: '720p' }],
    [
      'duración no soportada',
      { aspectRatio: 'widescreen_16_9', durationSeconds: 5, resolution: '720p' },
    ],
    [
      'resolución fuera de alcance',
      { aspectRatio: 'widescreen_16_9', durationSeconds: 8, resolution: '1080p' },
    ],
  ])('rechaza vídeo con %s', (_name, fields) => {
    expect(
      generationRequestSchema.safeParse({
        ...valid,
        service: 'generate-video',
        provider: 'google',
        model: 'veo-3.1-lite-generate-preview',
        ...fields,
      }).success,
    ).toBe(false);
  });
});
