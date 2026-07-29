import { describe, expect, it, vi } from 'vitest';
import type { GenerationResult } from '@ai-playground/core';
import { downloadResult, sanitizeDownloadFilename } from './download-result';

const imageResult: GenerationResult = {
  kind: 'image',
  url: '/mocks/square-1.webp',
  provider: 'mock',
  degraded: false,
  elapsedMs: 1,
  apiTrace: [],
};

describe('sanitizeDownloadFilename', () => {
  it('elimina rutas y extensiones engañosas y aplica la extensión del MIME', () => {
    expect(sanitizeDownloadFilename('../../My video.exe', 'video/webm')).toBe('my-video.webm');
  });
});

describe('downloadResult', () => {
  it('descarga como Blob permitido y revoca la URL temporal', async () => {
    const blob = new Blob(['image'], { type: 'image/webp' });
    const createObjectUrl = vi.fn(() => 'blob:download');
    const revokeObjectUrl = vi.fn();
    const save = vi.fn();

    await downloadResult(imageResult, 'Paper boat', {
      fetchImpl: vi.fn(async () => ({ ok: true, blob: async () => blob }) as Response),
      createObjectUrl,
      revokeObjectUrl,
      save,
    });

    expect(save).toHaveBeenCalledWith('blob:download', 'paper-boat.webp');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:download');
  });

  it('rechaza contenido con MIME no permitido antes de crear un object URL', async () => {
    const createObjectUrl = vi.fn();

    await expect(
      downloadResult(imageResult, 'result', {
        fetchImpl: vi.fn(
          async () =>
            ({ ok: true, blob: async () => new Blob(['x'], { type: 'text/html' }) }) as Response,
        ),
        createObjectUrl,
      }),
    ).rejects.toThrow(/unsupported/i);

    expect(createObjectUrl).not.toHaveBeenCalled();
  });
});
