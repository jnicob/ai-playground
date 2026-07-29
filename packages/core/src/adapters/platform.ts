import { API_KEY_HEADER, serviceResponseSchema, taskResponseSchema } from '../api-contract';
import type { ServiceResponse, TaskResponse } from '../api-contract';
import { buildApiRequest, buildApiTraceRequest } from '../api-request';
import { CommittedOperationError, PlatformError } from '../errors';
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
  maxPollIntervalMs?: number;
  maxPollMs?: number;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_MAX_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_POLL_MS = 10 * 60_000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

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

function asCommittedError(error: unknown): CommittedOperationError {
  if (error instanceof CommittedOperationError) return error;
  if (error instanceof PlatformError) {
    return new CommittedOperationError(error.code, error.message);
  }
  const message = error instanceof Error ? error.message : 'Provider operation failed';
  return new CommittedOperationError('provider_error', message);
}

function safeCompletedTrace(response: {
  status: 'COMPLETED';
  provider: string;
  elapsed_ms: number;
  output: { kind: string };
}): Extract<ApiTraceStep, { kind: 'completed' }> {
  return {
    kind: 'completed',
    response: {
      status: response.status,
      provider: response.provider,
      elapsed_ms: response.elapsed_ms,
      output: { kind: response.output.kind },
    },
  };
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function apiDownloadUrl(apiBaseUrl: string, value: string): string {
  if (!/^\/v1\/downloads\/[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new PlatformError('provider_error', 'Invalid platform video download URL');
  }
  const base = new URL(apiBaseUrl);
  const url = new URL(value, base);
  if (url.origin !== base.origin || url.search || url.hash) {
    throw new PlatformError('provider_error', 'Invalid platform video download URL');
  }
  return url.toString();
}

export function createPlatformAdapter(options: PlatformAdapterOptions): GenerationService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const initialPollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollIntervalMs = options.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS;
  const maxPollMs = options.maxPollMs ?? DEFAULT_MAX_POLL_MS;

  function headers(base: Record<string, string> = {}): Record<string, string> {
    const key = options.getApiKey?.();
    return { ...base, ...(key ? { [API_KEY_HEADER]: key } : {}) };
  }

  async function completedResult(
    request: GenerationRequest,
    completed:
      | Extract<ServiceResponse, { status: 'COMPLETED' }>
      | Extract<TaskResponse, { status: 'COMPLETED' }>,
    started: number,
    apiTrace: ApiTraceStep[],
    signal?: AbortSignal,
  ): Promise<GenerationResult> {
    apiTrace.push(safeCompletedTrace(completed));
    const meta = {
      provider: request.provider,
      degraded: false,
      elapsedMs: Date.now() - started,
      apiTrace,
    };

    if (completed.output.kind === 'image') {
      return {
        kind: 'image',
        url: completed.output.url,
        ...(completed.output.width === undefined ? {} : { width: completed.output.width }),
        ...(completed.output.height === undefined ? {} : { height: completed.output.height }),
        ...meta,
      };
    }
    if (completed.output.kind === 'image-pair') {
      return {
        kind: 'image-pair',
        before: completed.output.before_url,
        after: completed.output.after_url,
        ...meta,
      };
    }

    const download = await fetchImpl(
      apiDownloadUrl(options.apiBaseUrl, completed.output.download_url),
      {
        method: 'GET',
        headers: headers(),
        ...(signal ? { signal } : {}),
      },
    );
    if (!download.ok) throw await readError(download);
    const blob = await download.blob();
    if (blob.type !== 'video/mp4') {
      throw new PlatformError('provider_error', 'Platform returned an unsupported video type');
    }
    if (blob.size > MAX_VIDEO_BYTES) {
      throw new PlatformError('provider_error', 'Platform video exceeds the size limit');
    }
    const createObjectUrl =
      options.createObjectUrl ??
      ((value: Blob) => {
        return URL.createObjectURL(value);
      });
    const revokeObjectUrl =
      options.revokeObjectUrl ??
      ((value: string) => {
        URL.revokeObjectURL(value);
      });
    const url = createObjectUrl(blob);
    let disposed = false;
    return {
      kind: 'video',
      url,
      poster: completed.output.poster_url ?? '',
      dispose: () => {
        if (disposed) return;
        disposed = true;
        revokeObjectUrl(url);
      },
      ...meta,
    };
  }

  return {
    async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const started = Date.now();
      const deadline = started + maxPollMs;
      const apiTrace: ApiTraceStep[] = [];
      let operationCommitted = false;

      try {
        const apiRequest = buildApiRequest(request, options.apiBaseUrl);
        apiTrace.push(buildApiTraceRequest(request, options.apiBaseUrl));

        const created = await fetchImpl(apiRequest.url, {
          method: apiRequest.method,
          headers: headers(apiRequest.headers),
          body: JSON.stringify(apiRequest.body),
          ...(signal ? { signal } : {}),
        });
        if (!created.ok) throw await readError(created);

        const createdBody = serviceResponseSchema.parse(await created.json());
        if (createdBody.status === 'COMPLETED') {
          operationCommitted = request.provider === 'google';
          return await completedResult(request, createdBody, started, apiTrace, signal);
        }

        operationCommitted = true;
        apiTrace.push({ kind: 'status', state: 'IN_PROGRESS', taskId: createdBody.task_id });
        const pollUrl = `${options.apiBaseUrl}/v1/tasks/${createdBody.task_id}`;
        let pollIntervalMs = initialPollIntervalMs;

        for (;;) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0) {
            throw new PlatformError('provider_error', 'Timed out while polling the task');
          }
          await sleep(Math.min(pollIntervalMs, remainingMs), signal);
          if (Date.now() >= deadline) {
            throw new PlatformError('provider_error', 'Timed out while polling the task');
          }

          apiTrace.push({ kind: 'poll', method: 'GET', url: pollUrl });
          const polled = await fetchImpl(pollUrl, {
            method: 'GET',
            headers: headers(),
            ...(signal ? { signal } : {}),
          });
          if (polled.status === 429) {
            pollIntervalMs = Math.min(
              maxPollIntervalMs,
              Math.max(pollIntervalMs * 2, retryAfterMs(polled) ?? 0),
            );
            continue;
          }
          if (!polled.ok) throw await readError(polled);

          const task = taskResponseSchema.parse(await polled.json());
          if (task.status === 'FAILED') {
            throw new PlatformError(task.error.code, task.error.message);
          }
          if (task.status === 'COMPLETED') {
            return await completedResult(request, task, started, apiTrace, signal);
          }
        }
      } catch (error) {
        if (operationCommitted) throw asCommittedError(error);
        throw error;
      }
    },
  };
}
