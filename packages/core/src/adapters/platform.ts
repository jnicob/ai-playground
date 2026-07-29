import { API_KEY_HEADER, taskResponseSchema } from '../api-contract';
import { buildApiRequest, buildApiTraceRequest } from '../api-request';
import { PlatformError } from '../errors';
import type {
  ApiTraceStep,
  GenerationRequest,
  GenerationResult,
  GenerationService,
} from '../types';

export type PlatformAdapterOptions = {
  apiBaseUrl: string;
  getApiKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPollMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_MS = 60_000;

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

async function readError(response: Response): Promise<PlatformError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return new PlatformError(
    (body.error?.code as PlatformError['code']) ?? 'provider_error',
    body.error?.message ?? `API responded with ${response.status}`,
  );
}

export function createPlatformAdapter(options: PlatformAdapterOptions): GenerationService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollMs = options.maxPollMs ?? DEFAULT_MAX_POLL_MS;

  function headers(base: Record<string, string> = {}): Record<string, string> {
    const key = options.getApiKey?.();
    return { ...base, ...(key ? { [API_KEY_HEADER]: key } : {}) };
  }

  return {
    async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const started = Date.now();
      const apiTrace: ApiTraceStep[] = [];

      const apiRequest = buildApiRequest(request, options.apiBaseUrl);
      apiTrace.push(buildApiTraceRequest(request, options.apiBaseUrl));

      const created = await fetchImpl(apiRequest.url, {
        method: apiRequest.method,
        headers: headers(apiRequest.headers),
        body: JSON.stringify(apiRequest.body),
        ...(signal ? { signal } : {}),
      });
      if (!created.ok) throw await readError(created);

      const createdBody = taskResponseSchema.parse(await created.json());
      apiTrace.push({ kind: 'status', state: 'IN_PROGRESS', taskId: createdBody.task_id });

      const pollUrl = `${options.apiBaseUrl}/v1/tasks/${createdBody.task_id}`;
      const deadline = Date.now() + maxPollMs;

      for (;;) {
        apiTrace.push({ kind: 'poll', method: 'GET', url: pollUrl });
        const polled = await fetchImpl(pollUrl, {
          headers: headers(),
          ...(signal ? { signal } : {}),
        });
        if (!polled.ok) throw await readError(polled);

        const task = taskResponseSchema.parse(await polled.json());
        if (task.status === 'FAILED') throw new PlatformError(task.error.code, task.error.message);
        if (task.status === 'COMPLETED') {
          if (task.output.kind !== 'image') {
            throw new PlatformError(
              'provider_error',
              `Unsupported output kind "${task.output.kind}"`,
            );
          }
          apiTrace.push({ kind: 'completed', response: task });
          return {
            kind: 'image',
            url: task.output.url,
            ...(task.output.width === undefined ? {} : { width: task.output.width }),
            ...(task.output.height === undefined ? {} : { height: task.output.height }),
            provider: request.provider,
            degraded: false,
            elapsedMs: Date.now() - started,
            apiTrace,
          };
        }
        if (Date.now() >= deadline) {
          throw new PlatformError('provider_error', 'Timed out while polling the task');
        }
        await sleep(pollIntervalMs, signal);
      }
    },
  };
}
