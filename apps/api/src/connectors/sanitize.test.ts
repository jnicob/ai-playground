import { describe, expect, it } from 'vitest';
import { sanitizeUpstreamMessage } from './sanitize';

describe('sanitizeUpstreamMessage', () => {
  it('devuelve el fallback si el mensaje está vacío o undefined', () => {
    expect(sanitizeUpstreamMessage(undefined, 'secret', 'fallback')).toBe('fallback');
    expect(sanitizeUpstreamMessage('', 'secret', 'fallback')).toBe('fallback');
  });

  it('redacta todas las apariciones del secreto en el mensaje', () => {
    const result = sanitizeUpstreamMessage(
      'API key not valid: my-secret-key. Key was: my-secret-key',
      'my-secret-key',
      'fallback',
    );
    expect(result).not.toContain('my-secret-key');
    expect(result).toContain('«redacted»');
    expect(result.split('«redacted»').length - 1).toBe(2);
  });

  it('redacta un secreto con caracteres especiales de regex sin romper', () => {
    const secret = 'a+b.c*d';
    const result = sanitizeUpstreamMessage(`token invalido: ${secret}`, secret, 'fallback');
    expect(result).not.toContain(secret);
    expect(result).toContain('«redacted»');
  });

  it('trunca mensajes largos a como máximo 301 caracteres (300 + elipsis)', () => {
    const long = 'x'.repeat(1000);
    const result = sanitizeUpstreamMessage(long, undefined, 'fallback');
    expect(result.length).toBeLessThanOrEqual(301);
    expect(result.endsWith('…')).toBe(true);
  });

  it('deja el mensaje intacto si no hay secreto', () => {
    const result = sanitizeUpstreamMessage('mensaje normal', undefined, 'fallback');
    expect(result).toBe('mensaje normal');
  });

  it('no toca el mensaje si el secreto está vacío', () => {
    const result = sanitizeUpstreamMessage('mensaje normal', '', 'fallback');
    expect(result).toBe('mensaje normal');
  });
});
