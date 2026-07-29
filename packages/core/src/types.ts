export const ASPECT_RATIOS = {
  square_1_1: { width: 1024, height: 1024 },
  widescreen_16_9: { width: 1280, height: 720 },
  vertical_9_16: { width: 720, height: 1280 },
} as const;

export type AspectRatio = keyof typeof ASPECT_RATIOS;
export type PlaygroundMode = 'generate-image' | 'edit-image' | 'generate-video';
export type ProviderId = 'mock' | 'pollinations' | 'google';

type BaseGenerationRequest<
  Service extends PlaygroundMode,
  Ratio extends AspectRatio = AspectRatio,
> = {
  service: Service;
  provider: ProviderId;
  prompt: string;
  model: string;
  aspectRatio: Ratio;
  seed: number;
};

export type GenerateImageRequest = BaseGenerationRequest<'generate-image'>;

export type SourceImage = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  /** Base64 efímero: nunca se serializa en task ids, URLs, snippets ni historial. */
  data: string;
};

export type EditImageRequest = BaseGenerationRequest<'edit-image'> & {
  sourceImage: SourceImage;
};

export type GenerateVideoRequest = BaseGenerationRequest<
  'generate-video',
  'widescreen_16_9' | 'vertical_9_16'
> & {
  durationSeconds: 4 | 6 | 8;
  resolution: '720p';
};

export type GenerationRequest = GenerateImageRequest | EditImageRequest | GenerateVideoRequest;

export type ApiTraceStep =
  | { kind: 'request'; method: 'POST'; url: string; body: unknown }
  | { kind: 'status'; state: 'IN_PROGRESS'; taskId: string }
  | { kind: 'poll'; method: 'GET'; url: string }
  | { kind: 'completed'; response: unknown };

type GenerationMeta = {
  provider: ProviderId;
  degraded: boolean;
  elapsedMs: number;
  apiTrace: ApiTraceStep[];
};

export type GenerationResult = GenerationMeta &
  (
    | { kind: 'image'; url: string; width?: number; height?: number }
    | { kind: 'image-pair'; before: string; after: string }
    | { kind: 'video'; url: string; poster: string }
  );

export type GenerationService = {
  generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult>;
};
