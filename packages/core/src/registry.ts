import { z } from 'zod';
import type { PlaygroundMode, ProviderId } from './types';

export type ServiceDefinition = { id: PlaygroundMode; labelKey: string };

export type ProviderDefinition = {
  id: ProviderId;
  auth: 'none' | 'api-key';
  models: Partial<Record<PlaygroundMode, readonly string[]>>;
};

export const SERVICES: readonly ServiceDefinition[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
];

export const PROVIDERS: readonly ProviderDefinition[] = [
  { id: 'mock', auth: 'none', models: { 'generate-image': ['flux', 'turbo'] } },
];

export const generationRequestSchema = z.object({
  service: z.literal('generate-image'),
  provider: z.literal('mock'),
  prompt: z.string().trim().min(1).max(1000),
  model: z.string().min(1),
  aspectRatio: z.enum(['square_1_1', 'widescreen_16_9', 'vertical_9_16']),
  seed: z.number().int().min(0).max(999_999),
});
