import {
  ASPECT_RATIOS,
  type ApiTraceStep,
  type GenerationRequest,
  type GenerationService,
} from '../types';
import { MOCK_CATALOG, MOCK_VIDEO_CATALOG } from './mock-catalog';

const DEFAULT_LATENCY_MS = 600;

function hashString(input: string): number {
  let h = 0;
  for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildTrace(req: GenerationRequest, url: string): ApiTraceStep[] {
  const taskId = `task_${req.seed.toString(16).padStart(6, '0')}`;
  const base = 'https://api.playground.local/v1';
  return [
    {
      kind: 'request',
      method: 'POST',
      url: `${base}/services/${req.service}`,
      body: { prompt: req.prompt, model: req.model, aspect_ratio: req.aspectRatio, seed: req.seed },
    },
    { kind: 'status', state: 'IN_PROGRESS', taskId },
    { kind: 'poll', method: 'GET', url: `${base}/tasks/${taskId}` },
    { kind: 'completed', response: { task_id: taskId, status: 'COMPLETED', generated: [url] } },
  ];
}

export function createMockAdapter(options: { latencyMs?: number } = {}): GenerationService {
  const latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
  return {
    async generate(request, signal) {
      const started = Date.now();
      await sleep(latencyMs, signal);
      const assets = MOCK_CATALOG[request.aspectRatio];
      const url = assets[(request.seed + hashString(request.model)) % assets.length]!;
      const meta = {
        provider: 'mock' as const,
        degraded: false,
        elapsedMs: Date.now() - started,
        apiTrace: buildTrace(request, url),
      };

      if (request.service === 'edit-image') {
        return {
          kind: 'image-pair',
          before: `data:${request.sourceImage.mimeType};base64,${request.sourceImage.data}`,
          after: url,
          ...meta,
        };
      }

      if (request.service === 'generate-video') {
        return {
          kind: 'video',
          ...MOCK_VIDEO_CATALOG[request.aspectRatio],
          ...meta,
        };
      }

      const { width, height } = ASPECT_RATIOS[request.aspectRatio];
      return { kind: 'image', url, width, height, ...meta };
    },
  };
}
