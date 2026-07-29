import { describe, expect, it } from 'vitest';
import { createGenerationService } from './factory';

describe('createGenerationService', () => {
  it('crea el servicio mock', () => {
    expect(createGenerationService('mock')).toHaveProperty('generate');
  });
});

describe('createGenerationService con proveedores live', () => {
  it('crea un servicio para pollinations y google con base url', () => {
    const options = { apiBaseUrl: 'https://api.test' };
    expect(createGenerationService('pollinations', options)).toHaveProperty('generate');
    expect(createGenerationService('google', options)).toHaveProperty('generate');
  });

  it('exige apiBaseUrl para los proveedores live', () => {
    expect(() => createGenerationService('pollinations')).toThrow(/apiBaseUrl/i);
  });
});
