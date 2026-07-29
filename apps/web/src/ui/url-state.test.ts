import { describe, expect, it } from 'vitest';
import { createGenerationDraft } from './generation-draft';
import { buildSafeUrl, parseUrlState } from './url-state';

describe('parseUrlState', () => {
  it('acepta únicamente configuración segura y validada por el registry', () => {
    const parsed = parseUrlState(
      '?service=generate-video&provider=google&model=veo-3.1-lite-generate-preview' +
        '&prompt=Aurora&aspect=widescreen_16_9&seed=42&duration=4&resolution=720p' +
        '&example=video-google-aurora&apiKey=secret&taskId=paid-operation&upload=data',
    );

    expect(parsed).toEqual({
      patch: {
        service: 'generate-video',
        provider: 'google',
        model: 'veo-3.1-lite-generate-preview',
        prompt: 'Aurora',
        aspectRatio: 'widescreen_16_9',
        seedInput: '42',
        durationSeconds: 4,
        resolution: '720p',
      },
      exampleId: 'video-google-aurora',
    });
    expect(JSON.stringify(parsed)).not.toMatch(/secret|paid-operation|upload/);
  });

  it('ignora valores fuera de límites, combinaciones inválidas y campos desconocidos', () => {
    const parsed = parseUrlState(
      `?service=generate-video&provider=google&model=flux&prompt=${'x'.repeat(1001)}` +
        '&seed=-1&duration=99&example=../../unsafe&unknown=value',
    );

    expect(parsed).toEqual({
      patch: {
        service: 'generate-video',
        provider: 'google',
      },
    });
  });

  it('no convierte una seed vacía en cero', () => {
    expect(parseUrlState('?seed=')).toEqual({ patch: {} });
  });
});

describe('buildSafeUrl', () => {
  it('serializa solo la allowlist y sustituye cualquier query sensible anterior', () => {
    const draft = {
      ...createGenerationDraft(),
      prompt: 'A paper boat',
      seedInput: '17',
      sourceImage: { mimeType: 'image/png' as const, data: 'private-upload' },
    };

    const url = buildSafeUrl(
      new URL('https://playground.example/app?apiKey=secret&taskId=paid#result'),
      draft,
      'image-mock-paper-boat',
    );

    expect(url.toString()).toBe(
      'https://playground.example/app?service=generate-image&provider=mock&model=flux' +
        '&prompt=A+paper+boat&aspect=square_1_1&seed=17&duration=4&resolution=720p' +
        '&example=image-mock-paper-boat#result',
    );
    expect(url.toString()).not.toMatch(/secret|taskId|private-upload/);
  });
});
