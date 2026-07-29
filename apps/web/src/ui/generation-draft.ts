import {
  PROVIDERS,
  modelById,
  modelsFor,
  type AspectRatio,
  type PlaygroundMode,
  type ProviderId,
  type SourceImage,
} from '@ai-playground/core';

export type GenerationDraft = {
  service: PlaygroundMode;
  provider: ProviderId;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  seedInput: string;
  durationSeconds: 4 | 6 | 8;
  resolution: '720p';
  sourceImage?: SourceImage;
};

export type GenerationDraftPatch = Partial<
  Pick<
    GenerationDraft,
    | 'service'
    | 'provider'
    | 'prompt'
    | 'model'
    | 'aspectRatio'
    | 'seedInput'
    | 'durationSeconds'
    | 'resolution'
  >
>;

export type GenerationDraftAction =
  | { type: 'select-service'; value: PlaygroundMode }
  | { type: 'select-provider'; value: ProviderId }
  | { type: 'set-prompt'; value: string }
  | { type: 'select-model'; value: string }
  | { type: 'select-aspect-ratio'; value: AspectRatio }
  | { type: 'set-seed'; value: string }
  | { type: 'set-duration'; value: 4 | 6 | 8 }
  | { type: 'set-resolution'; value: '720p' }
  | { type: 'set-source-image'; value: SourceImage }
  | { type: 'clear-source-image' }
  | { type: 'hydrate-url'; value: GenerationDraftPatch }
  | { type: 'load-example'; value: GenerationDraftPatch }
  | { type: 'reset-defaults' };

export function createGenerationDraft(): GenerationDraft {
  return {
    service: 'generate-image',
    provider: 'mock',
    prompt: '',
    model: 'flux',
    aspectRatio: 'square_1_1',
    seedInput: '',
    durationSeconds: 4,
    resolution: '720p',
  };
}

function withoutSourceImage(draft: GenerationDraft): GenerationDraft {
  const result = { ...draft };
  delete result.sourceImage;
  return result;
}

function normalized(candidate: GenerationDraft): GenerationDraft {
  const supportedProviders = PROVIDERS.filter(
    (provider) => modelsFor(provider.id, candidate.service).length > 0,
  );
  const firstProvider = supportedProviders[0];
  if (!firstProvider) throw new Error(`No provider supports "${candidate.service}"`);
  const provider = supportedProviders.some(({ id }) => id === candidate.provider)
    ? candidate.provider
    : firstProvider.id;
  const models = modelsFor(provider, candidate.service);
  const firstModel = models[0];
  if (!firstModel) throw new Error(`No model supports "${provider}/${candidate.service}"`);
  const model = models.includes(candidate.model) ? candidate.model : firstModel;
  const definition = modelById(provider, candidate.service, model);
  const firstAspectRatio = definition.aspectRatios[0];
  if (!firstAspectRatio) throw new Error(`Model "${model}" has no aspect ratio`);
  const aspectRatio = definition.aspectRatios.some((ratio) => ratio === candidate.aspectRatio)
    ? candidate.aspectRatio
    : firstAspectRatio;

  const base = {
    ...candidate,
    provider,
    model,
    aspectRatio,
  };
  if (candidate.service !== 'edit-image') {
    return withoutSourceImage(base);
  }
  return base;
}

export function generationDraftReducer(
  draft: GenerationDraft,
  action: GenerationDraftAction,
): GenerationDraft {
  switch (action.type) {
    case 'select-service':
      return normalized({ ...draft, service: action.value });
    case 'select-provider':
      return normalized({ ...draft, provider: action.value });
    case 'set-prompt':
      return { ...draft, prompt: action.value };
    case 'select-model':
      return normalized({ ...draft, model: action.value });
    case 'select-aspect-ratio':
      return normalized({ ...draft, aspectRatio: action.value });
    case 'set-seed':
      return { ...draft, seedInput: action.value };
    case 'set-duration':
      return { ...draft, durationSeconds: action.value };
    case 'set-resolution':
      return { ...draft, resolution: action.value };
    case 'set-source-image':
      return draft.service === 'edit-image' ? { ...draft, sourceImage: action.value } : draft;
    case 'clear-source-image': {
      return withoutSourceImage(draft);
    }
    case 'hydrate-url':
    case 'load-example':
      return normalized(withoutSourceImage({ ...draft, ...action.value }));
    case 'reset-defaults':
      return createGenerationDraft();
  }
}
