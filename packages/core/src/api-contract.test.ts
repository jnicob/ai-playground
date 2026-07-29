import { describe, expect, it } from 'vitest';
import {
  API_KEY_HEADER,
  decodeTaskId,
  decodeTaskReference,
  encodeOperationTaskId,
  encodeTaskId,
  serviceResponseSchema,
  taskOutputSchema,
  taskResponseSchema,
} from './api-contract';
import { API_ERROR_CODES, PlatformError, isFatalPlatformError } from './errors';
import type { GenerateImageRequest } from './types';

const request: GenerateImageRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'un zorro rojo en la nieve',
  model: 'flux',
  aspectRatio: 'widescreen_16_9',
  seed: 42,
};

describe('task id codec', () => {
  it('es determinista: misma request → mismo id', () => {
    expect(encodeTaskId(request)).toBe(encodeTaskId({ ...request }));
  });

  it('round-trip: decode(encode(r)) === r', () => {
    expect(decodeTaskId(encodeTaskId(request))).toEqual(request);
  });

  it('sobrevive a prompts con acentos y emoji', () => {
    const unicode = { ...request, prompt: 'ñandú 🦊 en la nieve' };
    expect(decodeTaskId(encodeTaskId(unicode))).toEqual(unicode);
  });

  it('genera un id url-safe con prefijo de versión', () => {
    const id = encodeTaskId(request);
    expect(id.startsWith('v1.')).toBe(true);
    expect(id).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(id)).toBe(id);
  });

  it('nunca contiene la api key (no forma parte de la request)', () => {
    expect(decodeTaskId(encodeTaskId(request))).not.toHaveProperty('apiKey');
  });

  it.each([
    ['prefijo desconocido', 'v9.abc'],
    ['sin prefijo', 'abc'],
    ['payload no base64url', 'v1.$$$'],
    ['payload que no es una request válida', `v1.${btoa('{"nope":1}')}`],
  ])('rechaza %s con PlatformError fatal invalid_request', (_name, id) => {
    let thrown: unknown;
    try {
      decodeTaskId(id);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PlatformError);
    expect((thrown as PlatformError).code).toBe('invalid_request');
    expect(isFatalPlatformError(thrown)).toBe(true);
  });

  it('encodeTaskId normaliza la request: el id es idéntico tras un round-trip aunque el prompt tenga espacios', () => {
    const withSpaces = { ...request, prompt: '  un zorro rojo en la nieve  ' };
    const firstId = encodeTaskId(withSpaces);
    const roundTrippedId = encodeTaskId(decodeTaskId(firstId));
    expect(roundTrippedId).toBe(firstId);
  });

  it('rechaza un task id de más de 4096 caracteres con PlatformError invalid_request antes de decodificar, aunque el payload sea por lo demás válido', () => {
    // Payload que, salvo por el tamaño, decodificaría con éxito (JSON válido, schema válido:
    // el campo "padding" extra es ignorado por zod). Así el test prueba el guard de longitud
    // en sí, no un fallo incidental de JSON.parse/schema en basura aleatoria.
    const toBase64Url = (input: string): string => {
      const bytes = new TextEncoder().encode(input);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const oversizedPayload = JSON.stringify({ ...request, padding: 'a'.repeat(4000) });
    const oversized = `v1.${toBase64Url(oversizedPayload)}`;
    expect(oversized.length).toBeGreaterThan(4096);

    let thrown: unknown;
    try {
      decodeTaskId(oversized);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PlatformError);
    expect((thrown as PlatformError).code).toBe('invalid_request');
  });

  it('encodeTaskId rechaza una request inválida con PlatformError invalid_request', () => {
    const invalid = { ...request, prompt: '   ' };
    let thrown: unknown;
    try {
      encodeTaskId(invalid);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PlatformError);
    expect((thrown as PlatformError).code).toBe('invalid_request');
  });

  it('decodifica los task ids v1 como una referencia discriminada compatible', () => {
    expect(decodeTaskReference(encodeTaskId(request))).toEqual({
      version: 'v1',
      kind: 'request',
      request,
    });
  });
});

describe('task id v2 para operaciones externas', () => {
  const operation = {
    service: 'generate-video' as const,
    provider: 'google' as const,
    operationName: 'models/veo-3.1-lite-generate-preview/operations/abc_123',
  };

  it('round-trip: conserva únicamente la referencia validada a la operación', () => {
    const taskId = encodeOperationTaskId(operation);

    expect(taskId).toMatch(/^v2\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(taskId)).toBe(taskId);
    expect(decodeTaskReference(taskId)).toEqual({
      version: 'v2',
      kind: 'operation',
      ...operation,
    });
  });

  it('es determinista para la misma operación', () => {
    expect(encodeOperationTaskId(operation)).toBe(encodeOperationTaskId({ ...operation }));
  });

  it.each([
    ['servicio distinto de vídeo', { ...operation, service: 'edit-image' }],
    ['proveedor distinto de google', { ...operation, provider: 'mock' }],
    ['nombre sin jerarquía', { ...operation, operationName: 'operations/abc' }],
    [
      'nombre excesivamente largo',
      { ...operation, operationName: `models/veo/operations/${'a'.repeat(500)}` },
    ],
    ['campo secreto adicional', { ...operation, apiKey: 'secret-sentinel' }],
    ['contenido de usuario adicional', { ...operation, sourceImage: 'base64-sentinel' }],
  ])('rechaza %s', (_name, invalid) => {
    expect(() => encodeOperationTaskId(invalid)).toThrowError(PlatformError);
  });

  it('decodeTaskId v1 rechaza una operación v2 en vez de fingir que es una request', () => {
    expect(() => decodeTaskId(encodeOperationTaskId(operation))).toThrowError(PlatformError);
  });

  it.each(['v2.$$$', 'v2.e30', `v2.${'a'.repeat(4094)}`])(
    'rechaza un task id v2 malformado o desmesurado: %s',
    (taskId) => {
      expect(() => decodeTaskReference(taskId)).toThrowError(PlatformError);
    },
  );
});

describe('taskOutputSchema', () => {
  it.each([
    { kind: 'image', url: 'https://example.test/result.webp', width: 1024, height: 1024 },
    {
      kind: 'image-pair',
      before_url: 'data:image/png;base64,YQ==',
      after_url: 'data:image/png;base64,Yg==',
    },
    {
      kind: 'video',
      download_url: '/v1/files/v2.abc',
      poster_url: 'https://example.test/poster.webp',
    },
  ])('acepta un output $kind completo', (output) => {
    expect(taskOutputSchema.parse(output)).toEqual(output);
  });

  it.each([
    { kind: 'image-pair', before_url: 'before' },
    { kind: 'video', download_url: '' },
    { kind: 'audio', url: 'https://example.test/result.mp3' },
    { kind: 'image', url: 'x', source_image: 'base64-sentinel' },
  ])('rechaza outputs incompletos, desconocidos o con datos extra', (output) => {
    expect(taskOutputSchema.safeParse(output).success).toBe(false);
  });
});

describe('serviceResponseSchema', () => {
  it('acepta edición síncrona completada sin inventar task_id', () => {
    const response = {
      status: 'COMPLETED',
      provider: 'google',
      elapsed_ms: 123,
      output: {
        kind: 'image-pair',
        before_url: 'data:image/png;base64,YQ==',
        after_url: 'data:image/png;base64,Yg==',
      },
    };

    expect(serviceResponseSchema.parse(response)).toEqual(response);
  });

  it('acepta vídeo asíncrono con task_id', () => {
    expect(
      serviceResponseSchema.parse({
        task_id: 'v2.abc',
        status: 'IN_PROGRESS',
      }),
    ).toEqual({ task_id: 'v2.abc', status: 'IN_PROGRESS' });
  });

  it.each([
    { status: 'IN_PROGRESS' },
    { task_id: 'v2.abc', status: 'COMPLETED', provider: 'google', elapsed_ms: 1 },
    {
      task_id: 'v2.abc',
      status: 'IN_PROGRESS',
      output: { kind: 'video', download_url: '/v1/files/x' },
    },
  ])('rechaza estados POST contradictorios', (response) => {
    expect(serviceResponseSchema.safeParse(response).success).toBe(false);
  });
});

describe('taskResponseSchema', () => {
  it('acepta COMPLETED con output', () => {
    const parsed = taskResponseSchema.parse({
      task_id: 'v1.abc',
      status: 'COMPLETED',
      provider: 'pollinations',
      elapsed_ms: 1200,
      output: { kind: 'image', url: 'https://example.test/a.jpg' },
    });
    expect(parsed.status).toBe('COMPLETED');
  });

  it('acepta IN_PROGRESS y FAILED', () => {
    expect(taskResponseSchema.parse({ task_id: 'v1.a', status: 'IN_PROGRESS' }).status).toBe(
      'IN_PROGRESS',
    );
    expect(
      taskResponseSchema.parse({
        task_id: 'v1.a',
        status: 'FAILED',
        error: { code: 'provider_error', message: 'boom' },
      }).status,
    ).toBe('FAILED');
  });

  it('acepta FAILED con cualquier código de API_ERROR_CODES (evita drift entre errors.ts y el schema)', () => {
    for (const code of API_ERROR_CODES) {
      const parsed = taskResponseSchema.safeParse({
        task_id: 'v1.a',
        status: 'FAILED',
        error: { code, message: 'x' },
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rechaza COMPLETED sin output y estados desconocidos', () => {
    expect(
      taskResponseSchema.safeParse({
        task_id: 'v1.a',
        status: 'COMPLETED',
        provider: 'mock',
        elapsed_ms: 1,
      }).success,
    ).toBe(false);
    expect(taskResponseSchema.safeParse({ task_id: 'v1.a', status: 'PENDING' }).success).toBe(
      false,
    );
  });
});

describe('errores de plataforma', () => {
  it('marca fatales los errores de cliente y no fatales los transitorios', () => {
    expect(isFatalPlatformError(new PlatformError('invalid_api_key', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('missing_api_key', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('content_blocked', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('rate_limited', 'x'))).toBe(false);
    expect(isFatalPlatformError(new PlatformError('provider_error', 'x'))).toBe(false);
    expect(isFatalPlatformError(new Error('cualquier otra cosa'))).toBe(false);
  });

  it('expone el nombre del header de key', () => {
    expect(API_KEY_HEADER).toBe('x-provider-key');
  });
});
