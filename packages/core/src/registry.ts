import { z } from 'zod';
import type { PlaygroundMode, ProviderId } from './types';

export type ServiceDefinition<Id extends PlaygroundMode = PlaygroundMode> = {
  id: Id;
  labelKey: string;
};

export type ProviderDefinition = {
  id: ProviderId;
  auth: 'none' | 'api-key';
  /** true → la UI exige confirmación explícita de coste antes de generar. */
  costWarning: boolean;
  models: Partial<Record<PlaygroundMode, readonly string[]>>;
};

export const SERVICES: readonly ServiceDefinition<'generate-image'>[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
];

/**
 * Catálogos verificados el 2026-07-29 contra los endpoints en vivo.
 * pollinations: /models del dominio legacy es inconsistente (devuelve solo "sana"),
 * pero /prompt acepta flux y turbo — por eso el catálogo se declara aquí, no se descubre.
 */
export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'mock',
    auth: 'none',
    costWarning: false,
    models: { 'generate-image': ['flux', 'turbo'] },
  },
  {
    id: 'pollinations',
    auth: 'none',
    costWarning: false,
    models: { 'generate-image': ['flux', 'turbo'] },
  },
  {
    id: 'google',
    auth: 'api-key',
    costWarning: true,
    models: { 'generate-image': ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'] },
  },
];

export function providerById(id: ProviderId): ProviderDefinition {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}

export function modelsFor(provider: ProviderId, service: PlaygroundMode): readonly string[] {
  return providerById(provider).models[service] ?? [];
}

export const generationRequestSchema = z.object({
  service: z.enum(['generate-image']),
  provider: z.enum(['mock', 'pollinations', 'google']),
  prompt: z.string().trim().min(1).max(1000),
  model: z.string().min(1),
  aspectRatio: z.enum(['square_1_1', 'widescreen_16_9', 'vertical_9_16']),
  seed: z.number().int().min(0).max(999_999),
});
