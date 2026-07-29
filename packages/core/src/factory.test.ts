import { describe, expect, it } from 'vitest';
import { createGenerationService } from './factory';

describe('createGenerationService', () => {
  it('crea el servicio mock', () => {
    expect(createGenerationService('mock')).toHaveProperty('generate');
  });
  it('rechaza proveedores aún no implementados', () => {
    expect(() => createGenerationService('pollinations')).toThrow(/not implemented/i);
    expect(() => createGenerationService('google')).toThrow(/not implemented/i);
  });
});
