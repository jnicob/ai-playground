import { useCallback, useEffect, useRef, useState } from 'react';
import type { GenerationRequest, GenerationResult, GenerationService } from '@ai-playground/core';

export type GenerationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: GenerationResult }
  | { status: 'error'; message: string };

export function useGeneration(service: GenerationService) {
  const [state, setState] = useState<GenerationState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    (request: GenerationRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'loading' });
      service
        .generate(request, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setState({ status: 'success', result });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
        });
    },
    [service],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return { state, generate };
}
