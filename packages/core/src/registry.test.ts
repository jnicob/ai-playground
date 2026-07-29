import { describe, expect, it } from 'vitest';
import { generationRequestSchema, PROVIDERS, SERVICES, modelsFor, providerById } from './registry';
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
  it('todo modelo declarado por un provider pertenece a un servicio del registry', () => {
    const serviceIds = SERVICES.map((s) => s.id);
    for (const p of PROVIDERS)
      for (const mode of Object.keys(p.models)) expect(serviceIds).toContain(mode);
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
