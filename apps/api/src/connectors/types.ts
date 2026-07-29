import type { GenerationRequest, TaskOutput } from '@ai-playground/core';

export type ConnectorContext = {
  fetchImpl: typeof fetch;
  apiKey?: string;
  signal?: AbortSignal;
};

export type Connector = (request: GenerationRequest, ctx: ConnectorContext) => Promise<TaskOutput>;
