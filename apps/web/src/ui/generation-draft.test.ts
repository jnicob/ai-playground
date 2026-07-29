import { describe, expect, it } from 'vitest';
import {
  createGenerationDraft,
  generationDraftReducer,
  type GenerationDraft,
} from './generation-draft';

function reduce(
  draft: GenerationDraft,
  ...actions: Parameters<typeof generationDraftReducer>[1][]
) {
  return actions.reduce(generationDraftReducer, draft);
}

describe('generationDraftReducer', () => {
  it('crea defaults válidos y económicos para imagen', () => {
    expect(createGenerationDraft()).toEqual({
      service: 'generate-image',
      provider: 'mock',
      prompt: '',
      model: 'flux',
      aspectRatio: 'square_1_1',
      seedInput: '',
      durationSeconds: 4,
      resolution: '720p',
    });
  });

  it('conserva prompt y campos compatibles; resetea solo provider/model/aspect inválidos', () => {
    const image = reduce(
      createGenerationDraft(),
      { type: 'set-prompt', value: 'A paper boat' },
      { type: 'select-provider', value: 'pollinations' },
      { type: 'select-model', value: 'turbo' },
      { type: 'select-aspect-ratio', value: 'square_1_1' },
    );

    const video = generationDraftReducer(image, {
      type: 'select-service',
      value: 'generate-video',
    });

    expect(video).toMatchObject({
      service: 'generate-video',
      provider: 'mock',
      prompt: 'A paper boat',
      model: 'mock-video-v1',
      aspectRatio: 'widescreen_16_9',
      durationSeconds: 4,
      resolution: '720p',
    });
  });

  it('conserva provider y aspecto cuando siguen siendo compatibles', () => {
    const googleImage = reduce(
      createGenerationDraft(),
      { type: 'select-provider', value: 'google' },
      { type: 'select-aspect-ratio', value: 'vertical_9_16' },
    );

    const video = generationDraftReducer(googleImage, {
      type: 'select-service',
      value: 'generate-video',
    });

    expect(video).toMatchObject({
      provider: 'google',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'vertical_9_16',
    });
  });

  it('el upload es efímero y se elimina al abandonar edición', () => {
    const sourceImage = { mimeType: 'image/png' as const, data: 'iVBORw0KGgo=' };
    const edit = reduce(
      createGenerationDraft(),
      { type: 'select-service', value: 'edit-image' },
      { type: 'set-source-image', value: sourceImage },
    );
    expect(edit.sourceImage).toEqual(sourceImage);

    const image = generationDraftReducer(edit, {
      type: 'select-service',
      value: 'generate-image',
    });
    expect(image).not.toHaveProperty('sourceImage');
  });

  it.each(['hydrate-url', 'load-example'] as const)(
    '%s aplica un patch explícito y normaliza combinaciones inválidas',
    (type) => {
      const draft = generationDraftReducer(createGenerationDraft(), {
        type,
        value: {
          service: 'generate-video',
          provider: 'pollinations',
          prompt: 'Shared prompt',
          model: 'gemini-3.1-flash-image',
          aspectRatio: 'square_1_1',
          durationSeconds: 8,
        },
      });

      expect(draft).toMatchObject({
        service: 'generate-video',
        provider: 'mock',
        prompt: 'Shared prompt',
        model: 'mock-video-v1',
        aspectRatio: 'widescreen_16_9',
        durationSeconds: 8,
      });
      expect(draft).not.toHaveProperty('sourceImage');
    },
  );
});
