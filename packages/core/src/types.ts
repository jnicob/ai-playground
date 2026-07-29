export const ASPECT_RATIOS = {
  square_1_1: { width: 1024, height: 1024 },
  widescreen_16_9: { width: 1280, height: 720 },
  vertical_9_16: { width: 720, height: 1280 },
} as const;

export type AspectRatio = keyof typeof ASPECT_RATIOS;
export type PlaygroundMode = 'generate-image' | 'edit-image' | 'generate-video';
export type ProviderId = 'mock' | 'pollinations' | 'google';

export type GenerationRequest = {
  service: PlaygroundMode;
  provider: ProviderId;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  seed: number;
};

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
