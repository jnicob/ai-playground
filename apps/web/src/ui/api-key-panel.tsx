import { useState, type FormEvent } from 'react';
import type { ProviderDefinition } from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';

type Props = {
  provider: ProviderDefinition;
  currentKey?: string;
  onSave: (key: string) => void;
  onClear: () => void;
};

export function ApiKeyPanel({ provider, currentKey, onSave, onClear }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const key = draft.trim();
    if (!key) return;
    onSave(key);
    setDraft('');
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-fg">{t('key.title')}</h2>
      <p className="text-xs text-muted">{t('key.description')}</p>
      {provider.costWarning && (
        <p role="note" className="text-xs text-danger">
          {t('key.cost.warning')}
        </p>
      )}
      {currentKey ? (
        <div className="flex items-center gap-2">
          <span role="status" className="text-xs text-muted">
            {t('key.saved')}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 rounded-md border border-border px-3 text-sm text-fg"
          >
            {t('key.clear')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="api-key" className="text-sm text-muted">
            {t('key.input')}
          </label>
          <input
            id="api-key"
            name="provider-api-key"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-11 rounded-md border border-border bg-bg p-2 text-fg"
          />
          <button
            type="submit"
            className="min-h-11 self-start rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          >
            {t('key.save')}
          </button>
        </form>
      )}
    </section>
  );
}
