import { modelsFor } from '@ai-playground/core';
import { z } from 'zod';
import type { GenerationDraft, GenerationDraftPatch } from './generation-draft';

const serviceSchema = z.enum(['generate-image', 'edit-image', 'generate-video']);
const providerSchema = z.enum(['mock', 'pollinations', 'google']);
const modelSchema = z.string().min(1).max(100);
const promptSchema = z.string().max(1000);
const aspectRatioSchema = z.enum(['square_1_1', 'widescreen_16_9', 'vertical_9_16']);
const seedSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.number().int().min(0).max(999_999));
const durationSchema = z.coerce.number().pipe(z.union([z.literal(4), z.literal(6), z.literal(8)]));
const resolutionSchema = z.literal('720p');
const exampleSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type ParsedUrlState = {
  patch: GenerationDraftPatch;
  exampleId?: string;
};

function parseValue<Output>(schema: z.ZodType<Output>, value: string | null): Output | undefined {
  if (value === null) return undefined;
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function parseUrlState(search: string): ParsedUrlState {
  const params = new URLSearchParams(search);
  const service = parseValue(serviceSchema, params.get('service'));
  const provider = parseValue(providerSchema, params.get('provider'));
  const candidateModel = parseValue(modelSchema, params.get('model'));
  const model =
    service &&
    provider &&
    candidateModel &&
    modelsFor(provider, service).some((id) => id === candidateModel)
      ? candidateModel
      : undefined;
  const prompt = parseValue(promptSchema, params.get('prompt'));
  const aspectRatio = parseValue(aspectRatioSchema, params.get('aspect'));
  const seed = parseValue(seedSchema, params.get('seed'));
  const durationSeconds = parseValue(durationSchema, params.get('duration'));
  const resolution = parseValue(resolutionSchema, params.get('resolution'));
  const exampleId = parseValue(exampleSchema, params.get('example'));

  const patch: GenerationDraftPatch = {};
  if (service) patch.service = service;
  if (provider) patch.provider = provider;
  if (model) patch.model = model;
  if (prompt !== undefined) patch.prompt = prompt;
  if (aspectRatio) patch.aspectRatio = aspectRatio;
  if (seed !== undefined) patch.seedInput = String(seed);
  if (durationSeconds) patch.durationSeconds = durationSeconds;
  if (resolution) patch.resolution = resolution;

  return exampleId ? { patch, exampleId } : { patch };
}

export function buildSafeUrl(currentUrl: URL, draft: GenerationDraft, exampleId?: string): URL {
  const url = new URL(currentUrl);
  const params = new URLSearchParams({
    service: draft.service,
    provider: draft.provider,
    model: draft.model,
    prompt: draft.prompt,
    aspect: draft.aspectRatio,
    seed: draft.seedInput,
    duration: String(draft.durationSeconds),
    resolution: draft.resolution,
  });
  if (exampleId) params.set('example', exampleId);
  url.search = params.toString();
  return url;
}
