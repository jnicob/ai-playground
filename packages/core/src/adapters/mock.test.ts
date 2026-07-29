import { describe, expect, it, vi } from 'vitest';
import { createMockAdapter } from './mock';
import { MOCK_CATALOG } from './mock-catalog';
import { ASPECT_RATIOS, type AspectRatio, type GenerateImageRequest } from '../types';
import { MODEL_CATALOG } from '../registry';

const req = (over: Partial<GenerateImageRequest> = {}): GenerateImageRequest => ({
  service: 'generate-image',
  provider: 'mock',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 7,
  ...over,
});

const adapter = createMockAdapter({ latencyMs: 0 });

describe('mock adapter', () => {
  it('es determinista: misma request → misma url', async () => {
    const [a, b] = await Promise.all([adapter.generate(req()), adapter.generate(req())]);
    expect(a.kind === 'image' && b.kind === 'image' && a.url === b.url).toBe(true);
  });
  it('seeds distintas cubren todo el catálogo del ratio', async () => {
    const urls = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const r = await adapter.generate(req({ seed }));
      if (r.kind === 'image') urls.add(r.url);
    }
    expect(urls.size).toBe(MOCK_CATALOG.square_1_1.length);
  });
  it('cubre TODA combinación servicio×modelo×ratio del registry sin fallar', async () => {
    const imageModels = MODEL_CATALOG.filter((model) => model.service === 'generate-image');
    for (const { id: model } of imageModels)
      for (const aspectRatio of Object.keys(ASPECT_RATIOS) as AspectRatio[]) {
        const r = await adapter.generate(req({ model, aspectRatio }));
        expect(r.kind).toBe('image');
        if (r.kind === 'image') {
          expect(r.width).toBe(ASPECT_RATIOS[aspectRatio].width);
          expect(r.url).toMatch(/^\/mocks\//);
        }
      }
  });
  it('emite la traza task-based completa', async () => {
    const r = await adapter.generate(req());
    expect(r.apiTrace.map((s) => s.kind)).toEqual(['request', 'status', 'poll', 'completed']);
    expect(r.provider).toBe('mock');
    expect(r.degraded).toBe(false);
  });
  it('devuelve un par antes/después para edición', async () => {
    const result = await adapter.generate({
      ...req(),
      service: 'edit-image',
      model: 'mock-edit-v1',
      sourceImage: { mimeType: 'image/png', data: 'YQ==' },
    });

    expect(result).toMatchObject({
      kind: 'image-pair',
      before: 'data:image/png;base64,YQ==',
      after: expect.stringMatching(/^\/mocks\//),
    });
  });
  it('devuelve un vídeo propio con poster para generate-video', async () => {
    const result = await adapter.generate({
      ...req(),
      service: 'generate-video',
      model: 'mock-video-v1',
      aspectRatio: 'widescreen_16_9',
      durationSeconds: 4,
      resolution: '720p',
    });

    expect(result).toMatchObject({
      kind: 'video',
      url: '/mocks/video-gradient.webm',
      poster: '/mocks/wide-1.webp',
    });
  });
  it('aborta con AbortSignal', async () => {
    const slow = createMockAdapter({ latencyMs: 5_000 });
    const controller = new AbortController();
    const promise = slow.generate(req(), controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });
  it('no acumula listeners de abort en el signal tras un generate() exitoso', async () => {
    const controller = new AbortController();
    const addSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener');

    await adapter.generate(req(), controller.signal);

    const abortAdds = addSpy.mock.calls.filter(([type]) => type === 'abort');
    const abortRemoves = removeSpy.mock.calls.filter(([type]) => type === 'abort');
    expect(abortRemoves.length).toBe(abortAdds.length);
    for (const [, handler] of abortAdds) {
      expect(removeSpy.mock.calls.some(([, h]) => h === handler)).toBe(true);
    }
  });
});
