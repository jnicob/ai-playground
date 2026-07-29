import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AspectRatio,
  GenerationRequest,
  GenerationResult,
  PlaygroundMode,
  ProviderId,
} from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';

const MAX_HISTORY_ENTRIES = 20;

export type RequestSummary = {
  service: PlaygroundMode;
  provider: ProviderId;
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  seed: number;
  durationSeconds?: 4 | 6 | 8;
  resolution?: '720p';
};

export type SessionHistoryEntry = {
  id: string;
  request: RequestSummary;
  status: 'completed' | 'failed';
  result?: GenerationResult;
};

export function summarizeRequest(request: GenerationRequest): RequestSummary {
  const summary: RequestSummary = {
    service: request.service,
    provider: request.provider,
    prompt: request.prompt,
    model: request.model,
    aspectRatio: request.aspectRatio,
    seed: request.seed,
  };
  if (request.service === 'generate-video') {
    summary.durationSeconds = request.durationSeconds;
    summary.resolution = request.resolution;
  }
  return summary;
}

function isSafeHistoryUrl(url: string): boolean {
  return url.startsWith('/mocks/') || url.startsWith('blob:');
}

function historyResult(result: GenerationResult): GenerationResult | undefined {
  const metadata = {
    provider: result.provider,
    degraded: result.degraded,
    elapsedMs: result.elapsedMs,
    apiTrace: [],
  };
  if (result.kind === 'image') {
    if (!isSafeHistoryUrl(result.url)) return undefined;
    return {
      kind: 'image',
      url: result.url,
      ...(result.width === undefined ? {} : { width: result.width }),
      ...(result.height === undefined ? {} : { height: result.height }),
      ...metadata,
    };
  }
  if (result.kind === 'image-pair') {
    if (!isSafeHistoryUrl(result.after)) return undefined;
    return { kind: 'image', url: result.after, ...metadata };
  }
  if (!isSafeHistoryUrl(result.url)) return undefined;
  return {
    kind: 'video',
    url: result.url,
    poster: isSafeHistoryUrl(result.poster) ? result.poster : '',
    dispose: result.dispose,
    ...metadata,
  };
}

function disposeEntry(entry: SessionHistoryEntry): void {
  if (entry.result?.kind === 'video') entry.result.dispose();
}

export function useSessionHistory() {
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([]);
  const entriesRef = useRef(entries);
  const sequence = useRef(0);

  const replaceEntries = useCallback((next: SessionHistoryEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const addCompleted = useCallback(
    (request: GenerationRequest, result: GenerationResult) => {
      const retainedResult = historyResult(result);
      if (!retainedResult && result.kind === 'video') result.dispose();
      const entry: SessionHistoryEntry = {
        id: `history-${++sequence.current}`,
        request: summarizeRequest(request),
        status: 'completed',
        ...(retainedResult ? { result: retainedResult } : {}),
      };
      const next = [...entriesRef.current, entry];
      const evicted = next.slice(0, -MAX_HISTORY_ENTRIES);
      evicted.forEach(disposeEntry);
      replaceEntries(next.slice(-MAX_HISTORY_ENTRIES));
    },
    [replaceEntries],
  );

  const addFailed = useCallback(
    (request: GenerationRequest) => {
      const entry: SessionHistoryEntry = {
        id: `history-${++sequence.current}`,
        request: summarizeRequest(request),
        status: 'failed',
      };
      const next = [...entriesRef.current, entry];
      const evicted = next.slice(0, -MAX_HISTORY_ENTRIES);
      evicted.forEach(disposeEntry);
      replaceEntries(next.slice(-MAX_HISTORY_ENTRIES));
    },
    [replaceEntries],
  );

  const remove = useCallback(
    (id: string) => {
      const entry = entriesRef.current.find((candidate) => candidate.id === id);
      if (entry) disposeEntry(entry);
      replaceEntries(entriesRef.current.filter((candidate) => candidate.id !== id));
    },
    [replaceEntries],
  );

  useEffect(
    () => () => {
      entriesRef.current.forEach(disposeEntry);
      entriesRef.current = [];
    },
    [],
  );

  return { entries, addCompleted, addFailed, remove };
}

type SessionHistoryProps = {
  entries: readonly SessionHistoryEntry[];
  onRestore: (entry: SessionHistoryEntry & { result: GenerationResult }) => void;
  onRemove: (id: string) => void;
};

export function SessionHistory({ entries, onRestore, onRemove }: SessionHistoryProps) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-2">
      <h2 id="history-title" className="font-medium">
        {t('history.title')}
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{t('history.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {[...entries].reverse().map((entry) => {
            const result = entry.result;
            return (
              <li key={entry.id} className="rounded-md border border-border p-2 text-sm">
                <p>
                  {entry.request.model} ·{' '}
                  {entry.status === 'completed'
                    ? t('history.status.completed')
                    : t('history.status.failed')}
                </p>
                <p className="truncate text-muted">{entry.request.prompt}</p>
                <div className="mt-2 flex gap-2">
                  {result ? (
                    <button
                      type="button"
                      onClick={() => onRestore({ ...entry, result })}
                      className="min-h-11 rounded-md border border-border px-3"
                    >
                      {t('history.restore')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="min-h-11 rounded-md border border-border px-3"
                  >
                    {t('history.remove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
