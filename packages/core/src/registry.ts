import { z } from 'zod';
import type { AspectRatio, PlaygroundMode, ProviderId } from './types';

export type ServiceDefinition<Id extends PlaygroundMode = PlaygroundMode> = {
  id: Id;
  labelKey: string;
};

export type ProviderDefinition = {
  id: ProviderId;
  auth: 'none' | 'api-key';
  /** true → la UI exige confirmación explícita de coste antes de generar. */
  costWarning: boolean;
};

export const PRICING_VERIFIED_AT = '2026-07-29';
const PRICING_SOURCE = 'https://ai.google.dev/gemini-api/docs/pricing';

export type ModelPricing = {
  currency: 'USD';
  unit: 'image' | 'second';
  amount: number;
  verifiedAt: typeof PRICING_VERIFIED_AT;
  sourceUrl: typeof PRICING_SOURCE;
};

type BaseModelDefinition<Service extends PlaygroundMode> = {
  id: string;
  provider: ProviderId;
  service: Service;
  aspectRatios: readonly AspectRatio[];
  pricing?: ModelPricing;
};

export type ImageModelDefinition = BaseModelDefinition<'generate-image' | 'edit-image'>;

export type VideoModelDefinition = BaseModelDefinition<'generate-video'> & {
  aspectRatios: readonly ('widescreen_16_9' | 'vertical_9_16')[];
  durationSeconds: readonly (4 | 6 | 8)[];
  resolutions: readonly ['720p'];
};

export type ModelDefinition = ImageModelDefinition | VideoModelDefinition;

const ALL_ASPECT_RATIOS = [
  'square_1_1',
  'widescreen_16_9',
  'vertical_9_16',
] as const satisfies readonly AspectRatio[];
const VIDEO_ASPECT_RATIOS = ['widescreen_16_9', 'vertical_9_16'] as const;
const VIDEO_DURATIONS = [4, 6, 8] as const;
const VIDEO_RESOLUTIONS = ['720p'] as const;

function imagePrice(amount: number): ModelPricing {
  return {
    currency: 'USD',
    unit: 'image',
    amount,
    verifiedAt: PRICING_VERIFIED_AT,
    sourceUrl: PRICING_SOURCE,
  };
}

function videoPrice(amount: number): ModelPricing {
  return {
    currency: 'USD',
    unit: 'second',
    amount,
    verifiedAt: PRICING_VERIFIED_AT,
    sourceUrl: PRICING_SOURCE,
  };
}

export const SERVICE_CATALOG: readonly ServiceDefinition[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
  { id: 'edit-image', labelKey: 'service.edit-image' },
  { id: 'generate-video', labelKey: 'service.generate-video' },
];

/**
 * Servicios ya expuestos por la UI/API. C7 sustituirá esta lista por SERVICE_CATALOG cuando
 * existan formularios completos para edición y vídeo.
 */
export const SERVICES: readonly ServiceDefinition<'generate-image'>[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
];

export const PROVIDERS: readonly ProviderDefinition[] = [
  { id: 'mock', auth: 'none', costWarning: false },
  { id: 'pollinations', auth: 'none', costWarning: false },
  { id: 'google', auth: 'api-key', costWarning: true },
];

export const DEFAULT_VIDEO_SETTINGS = {
  provider: 'google',
  model: 'veo-3.1-lite-generate-preview',
  aspectRatio: 'widescreen_16_9',
  durationSeconds: 4,
  resolution: '720p',
} as const;

/**
 * Catálogo declarado y verificado el 2026-07-29. No se descubre desde endpoints de modelos:
 * el listado legacy de Pollinations no coincide con los modelos aceptados por /prompt.
 */
export const MODEL_CATALOG: readonly ModelDefinition[] = [
  {
    id: 'flux',
    provider: 'mock',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'turbo',
    provider: 'mock',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'mock-edit-v1',
    provider: 'mock',
    service: 'edit-image',
    aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'mock-video-v1',
    provider: 'mock',
    service: 'generate-video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durationSeconds: VIDEO_DURATIONS,
    resolutions: VIDEO_RESOLUTIONS,
  },
  {
    id: 'flux',
    provider: 'pollinations',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'turbo',
    provider: 'pollinations',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    provider: 'google',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
    pricing: imagePrice(0.0336),
  },
  {
    id: 'gemini-3.1-flash-image',
    provider: 'google',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
    pricing: imagePrice(0.067),
  },
  {
    id: 'gemini-2.5-flash-image',
    provider: 'google',
    service: 'generate-image',
    aspectRatios: ALL_ASPECT_RATIOS,
    pricing: imagePrice(0.039),
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    provider: 'google',
    service: 'edit-image',
    aspectRatios: ALL_ASPECT_RATIOS,
    pricing: imagePrice(0.0336),
  },
  {
    id: 'gemini-3.1-flash-image',
    provider: 'google',
    service: 'edit-image',
    aspectRatios: ALL_ASPECT_RATIOS,
    pricing: imagePrice(0.067),
  },
  {
    id: 'veo-3.1-lite-generate-preview',
    provider: 'google',
    service: 'generate-video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durationSeconds: VIDEO_DURATIONS,
    resolutions: VIDEO_RESOLUTIONS,
    pricing: videoPrice(0.05),
  },
  {
    id: 'veo-3.1-fast-generate-preview',
    provider: 'google',
    service: 'generate-video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durationSeconds: VIDEO_DURATIONS,
    resolutions: VIDEO_RESOLUTIONS,
    pricing: videoPrice(0.1),
  },
  {
    id: 'veo-3.1-generate-preview',
    provider: 'google',
    service: 'generate-video',
    aspectRatios: VIDEO_ASPECT_RATIOS,
    durationSeconds: VIDEO_DURATIONS,
    resolutions: VIDEO_RESOLUTIONS,
    pricing: videoPrice(0.4),
  },
];

export function providerById(id: ProviderId): ProviderDefinition {
  const provider = PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}

export function modelDefinitionsFor(
  provider: ProviderId,
  service: PlaygroundMode,
): readonly ModelDefinition[] {
  return MODEL_CATALOG.filter((model) => model.provider === provider && model.service === service);
}

export function modelsFor(provider: ProviderId, service: PlaygroundMode): readonly string[] {
  return modelDefinitionsFor(provider, service).map((model) => model.id);
}

export function modelById(
  provider: ProviderId,
  service: PlaygroundMode,
  modelId: string,
): ModelDefinition {
  const model = modelDefinitionsFor(provider, service).find(
    (candidate) => candidate.id === modelId,
  );
  if (!model) {
    throw new Error(
      `Unknown model "${modelId}" for provider "${provider}" and service "${service}"`,
    );
  }
  return model;
}

const commonRequestFields = {
  provider: z.enum(['mock', 'pollinations', 'google']),
  prompt: z.string().trim().min(1).max(1000),
  model: z.string().min(1),
  seed: z.number().int().min(0).max(999_999),
} as const;

const imageAspectRatioSchema = z.enum(['square_1_1', 'widescreen_16_9', 'vertical_9_16']);

const generateImageRequestObject = z
  .object({
    service: z.literal('generate-image'),
    ...commonRequestFields,
    aspectRatio: imageAspectRatioSchema,
  })
  .strict();

const editImageRequestObject = z
  .object({
    service: z.literal('edit-image'),
    ...commonRequestFields,
    aspectRatio: imageAspectRatioSchema,
    sourceImage: z
      .object({
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        data: z.string().min(1).max(14_000_000),
      })
      .strict(),
  })
  .strict();

const generateVideoRequestObject = z
  .object({
    service: z.literal('generate-video'),
    ...commonRequestFields,
    aspectRatio: z.enum(VIDEO_ASPECT_RATIOS),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    resolution: z.literal('720p'),
  })
  .strict();

function hasRegisteredModel(request: {
  provider: ProviderId;
  service: PlaygroundMode;
  model: string;
}): boolean {
  return MODEL_CATALOG.some(
    (model) =>
      model.provider === request.provider &&
      model.service === request.service &&
      model.id === request.model,
  );
}

const registeredModelIssue = {
  message: 'Model is not available for this provider and service',
  path: ['model'],
};

export const generateImageRequestSchema = generateImageRequestObject.refine(
  hasRegisteredModel,
  registeredModelIssue,
);

export const generationRequestSchema = z
  .discriminatedUnion('service', [
    generateImageRequestObject,
    editImageRequestObject,
    generateVideoRequestObject,
  ])
  .refine(hasRegisteredModel, registeredModelIssue);
