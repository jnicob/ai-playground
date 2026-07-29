import { useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '@/i18n/i18n';
import { ApiTraceView } from './api-trace-view';
import type { GenerationState } from './use-generation';
import type { GenerationResult } from '@ai-playground/core';
import { downloadResult } from './download-result';

type Props = {
  state: GenerationState;
  onRetry: () => void;
  onDownload?: (result: GenerationResult) => Promise<void>;
};
type TabId = 'preview' | 'api';

export function ResultPanel({
  state,
  onRetry,
  onDownload = (result) => downloadResult(result, 'ai-playground-result'),
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>('preview');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [downloadStatus, setDownloadStatus] = useState('');
  const tabs: { id: TabId; label: string }[] = [
    { id: 'preview', label: t('result.tab.preview') },
    { id: 'api', label: t('result.tab.api') },
  ];
  const result = state.status === 'success' ? state.result : null;

  async function handleDownload() {
    if (!result) return;
    try {
      await onDownload(result);
      setDownloadStatus(t('result.download.ready'));
    } catch {
      setDownloadStatus(t('result.download.failed'));
    }
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | undefined;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    setTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label }, index) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            id={`${id}-tab`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(event) => handleTabKey(event, index)}
            className="px-3 py-1.5 text-sm text-muted aria-selected:border-b-2 aria-selected:border-accent aria-selected:text-fg"
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'preview' && (
        <div id="preview-panel" role="tabpanel" aria-labelledby="preview-tab" tabIndex={0}>
          {state.status === 'idle' && <p className="text-muted">{t('result.empty')}</p>}
          {state.status === 'loading' && (
            <div role="status" aria-live="polite">
              <p className="text-muted">{t('result.loading')}</p>
              <div className="mt-2 aspect-square max-w-md animate-pulse rounded-md bg-surface" />
            </div>
          )}
          {state.status === 'error' && (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p className="text-danger">
                {t('result.error')} ({state.message})
              </p>
              <button
                onClick={onRetry}
                className="rounded-md border border-border px-3 py-1.5 text-fg"
              >
                {t('result.retry')}
              </button>
            </div>
          )}
          {result?.kind === 'image' && (
            <figure className="flex flex-col gap-2">
              <img
                src={result.url}
                alt={t('result.alt')}
                width={result.width}
                height={result.height}
                className="max-w-full rounded-md border border-border"
              />
              <figcaption className="font-mono text-xs text-muted">
                <span className="rounded-sm border border-border px-1.5 py-0.5">
                  {result.degraded
                    ? t('result.origin.degraded')
                    : result.provider === 'mock'
                      ? t('result.origin.mock')
                      : t('result.origin.live')}
                </span>{' '}
                · {result.elapsedMs} ms
              </figcaption>
            </figure>
          )}
          {result?.kind === 'image-pair' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <figure>
                <img
                  src={result.before}
                  alt={t('result.before.alt')}
                  className="max-w-full rounded-md border border-border"
                />
                <figcaption className="text-sm text-muted">{t('result.before')}</figcaption>
              </figure>
              <figure>
                <img
                  src={result.after}
                  alt={t('result.after.alt')}
                  className="max-w-full rounded-md border border-border"
                />
                <figcaption className="text-sm text-muted">{t('result.after')}</figcaption>
              </figure>
            </div>
          )}
          {result?.kind === 'video' && (
            <video
              src={result.url}
              poster={result.poster}
              controls
              playsInline
              preload="metadata"
              aria-label={t('result.video')}
              className="max-w-full rounded-md border border-border"
            />
          )}
          {result && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-11 rounded-md border border-border px-3"
              >
                {t('result.download')}
              </button>
              <p role="status" aria-live="polite" className="text-sm text-muted">
                {downloadStatus}
              </p>
            </div>
          )}
        </div>
      )}
      {tab === 'api' && (
        <div id="api-panel" role="tabpanel" aria-labelledby="api-tab" tabIndex={0}>
          <ApiTraceView trace={result?.apiTrace ?? []} />
        </div>
      )}
    </section>
  );
}
