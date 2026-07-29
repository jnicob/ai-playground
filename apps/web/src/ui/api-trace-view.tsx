import { useId, useState } from 'react';
import { useI18n } from '@/i18n/i18n';
import {
  SNIPPET_LANGUAGES,
  generateSnippet,
  type ApiTraceRequest,
  type ApiTraceStep,
  type SnippetLanguage,
} from '@ai-playground/core';

const label = (step: ApiTraceStep): string => {
  switch (step.kind) {
    case 'request':
      return `${step.method} ${step.url}`;
    case 'status':
      return `status: ${step.state}`;
    case 'poll':
      return `${step.method} ${step.url}`;
    case 'completed':
      return 'response';
  }
};

export function ApiTraceView({ trace }: { trace: ApiTraceStep[] }) {
  const { t } = useI18n();
  const languageId = useId();
  const [language, setLanguage] = useState<SnippetLanguage>('curl');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const request = trace.find((step): step is ApiTraceRequest => step.kind === 'request');
  const snippet = request ? generateSnippet(request, language) : null;

  async function copySnippet() {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {snippet && (
        <section aria-label={t('snippet.title')} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={languageId} className="text-sm text-muted">
                {t('snippet.language')}
              </label>
              <select
                id={languageId}
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value as SnippetLanguage);
                  setCopyStatus('idle');
                }}
                className="min-h-11 rounded-md border border-border bg-surface px-3 text-fg"
              >
                {SNIPPET_LANGUAGES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'curl' ? 'cURL' : value === 'javascript' ? 'JavaScript' : 'Python'}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={copySnippet}
              className="min-h-11 rounded-md border border-border px-3 text-sm text-fg"
            >
              {t('snippet.copy')}
            </button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs text-fg">
            <code>{snippet}</code>
          </pre>
          <span role="status" aria-live="polite" className="min-h-5 text-sm text-muted">
            {copyStatus === 'copied'
              ? t('snippet.copied')
              : copyStatus === 'failed'
                ? t('snippet.copyFailed')
                : ''}
          </span>
        </section>
      )}
      <ol className="flex flex-col gap-3">
        {trace.map((step, i) => (
          <li key={i}>
            <p className="font-mono text-xs text-muted">{label(step)}</p>
            {'body' in step || 'response' in step ? (
              <pre className="overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-xs text-fg">
                {JSON.stringify('body' in step ? step.body : step.response, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
