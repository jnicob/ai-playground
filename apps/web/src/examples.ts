import type { PlaygroundMode, ProviderId } from '@ai-playground/core';
import type { MessageKey } from './i18n/messages';
import type { GenerationDraftPatch } from './ui/generation-draft';

type ExamplePatch = GenerationDraftPatch & {
  service: PlaygroundMode;
  provider: ProviderId;
  prompt: string;
  model: string;
};

type ExampleResult =
  | { kind: 'image'; url: string; width: number; height: number }
  | {
      kind: 'image-pair';
      before: string;
      after: string;
      width: number;
      height: number;
    }
  | {
      kind: 'video';
      url: string;
      poster: string;
      width: number;
      height: number;
    };

export type ExampleDefinition = {
  id: string;
  titleKey: MessageKey;
  altKey: MessageKey;
  patch: ExamplePatch;
  result: ExampleResult;
};

export const EXAMPLES = [
  {
    id: 'image-mock-paper-boat',
    titleKey: 'example.image.paperBoat.title',
    altKey: 'example.image.paperBoat.alt',
    patch: {
      service: 'generate-image',
      provider: 'mock',
      prompt: 'A paper boat under moonlight',
      model: 'flux',
      aspectRatio: 'widescreen_16_9',
      seedInput: '17',
    },
    result: { kind: 'image', url: '/mocks/wide-1.webp', width: 960, height: 540 },
  },
  {
    id: 'image-google-crystal-garden',
    titleKey: 'example.image.crystalGarden.title',
    altKey: 'example.image.crystalGarden.alt',
    patch: {
      service: 'generate-image',
      provider: 'google',
      prompt: 'A crystal garden at sunrise',
      model: 'gemini-3.1-flash-lite-image',
      aspectRatio: 'square_1_1',
      seedInput: '31',
    },
    result: { kind: 'image', url: '/mocks/square-2.webp', width: 1200, height: 1200 },
  },
  {
    id: 'edit-mock-neon-portrait',
    titleKey: 'example.edit.neonPortrait.title',
    altKey: 'example.edit.neonPortrait.alt',
    patch: {
      service: 'edit-image',
      provider: 'mock',
      prompt: 'Transform the portrait into a neon editorial illustration',
      model: 'mock-edit-v1',
      aspectRatio: 'square_1_1',
      seedInput: '53',
    },
    result: {
      kind: 'image-pair',
      before: '/mocks/square-1.webp',
      after: '/mocks/square-2.webp',
      width: 1200,
      height: 1200,
    },
  },
  {
    id: 'edit-google-botanical-poster',
    titleKey: 'example.edit.botanicalPoster.title',
    altKey: 'example.edit.botanicalPoster.alt',
    patch: {
      service: 'edit-image',
      provider: 'google',
      prompt: 'Turn this composition into a botanical poster',
      model: 'gemini-3.1-flash-lite-image',
      aspectRatio: 'vertical_9_16',
      seedInput: '71',
    },
    result: {
      kind: 'image-pair',
      before: '/mocks/tall-1.webp',
      after: '/mocks/tall-2.webp',
      width: 900,
      height: 1600,
    },
  },
  {
    id: 'video-mock-aurora',
    titleKey: 'example.video.aurora.title',
    altKey: 'example.video.aurora.alt',
    patch: {
      service: 'generate-video',
      provider: 'mock',
      prompt: 'An aurora flowing across a midnight gradient',
      model: 'mock-video-v1',
      aspectRatio: 'widescreen_16_9',
      seedInput: '89',
      durationSeconds: 4,
      resolution: '720p',
    },
    result: {
      kind: 'video',
      url: '/mocks/video-gradient.webm',
      poster: '/mocks/wide-1.webp',
      width: 960,
      height: 540,
    },
  },
  {
    id: 'video-google-aurora',
    titleKey: 'example.video.cinematicAurora.title',
    altKey: 'example.video.cinematicAurora.alt',
    patch: {
      service: 'generate-video',
      provider: 'google',
      prompt: 'A cinematic aurora reflected on a quiet arctic lake',
      model: 'veo-3.1-lite-generate-preview',
      aspectRatio: 'widescreen_16_9',
      seedInput: '97',
      durationSeconds: 4,
      resolution: '720p',
    },
    result: {
      kind: 'video',
      url: '/mocks/video-gradient.webm',
      poster: '/mocks/wide-2.webp',
      width: 1200,
      height: 675,
    },
  },
] as const satisfies readonly ExampleDefinition[];
