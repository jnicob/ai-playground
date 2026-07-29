import { describe, expect, it } from 'vitest';
import { generationRequestSchema, PROVIDERS, SERVICES } from './registry';
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
    ['provider desconocido', { ...valid, provider: 'openai' }],
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
