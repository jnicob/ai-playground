import { useMemo, useReducer, useRef } from 'react';
import { I18nProvider, useI18n } from './i18n/i18n';
import {
  SERVICE_CATALOG,
  createGenerationService,
  providerById,
  type GenerationRequest,
  type GenerationService,
} from '@ai-playground/core';
import type { MessageKey } from './i18n/messages';
import { ApiKeyPanel } from './ui/api-key-panel';
import { GenerationForm } from './ui/generation-form';
import { createGenerationDraft, generationDraftReducer } from './ui/generation-draft';
import { ProviderSelector } from './ui/provider-selector';
import { ResultPanel } from './ui/result-panel';
import { useApiKeys } from './ui/use-api-keys';
import { useGeneration } from './ui/use-generation';

function Playground({ service }: { service?: GenerationService }) {
  const { t, locale, setLocale } = useI18n();
  const [draft, dispatch] = useReducer(generationDraftReducer, undefined, createGenerationDraft);
  const { keyFor, setKey, clearKey } = useApiKeys();
  const lastRequest = useRef<GenerationRequest | null>(null);

  const provider = providerById(draft.provider);
  const apiKey = keyFor(draft.provider);
  const needsKey = provider.auth === 'api-key' && !apiKey;
  const activeGenerationService = useMemo(
    () =>
      service ??
      createGenerationService(draft.provider, {
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787',
        getApiKey: () => keyFor(draft.provider),
      }),
    [service, draft.provider, keyFor],
  );

  const { state, generate } = useGeneration(activeGenerationService);
  function handleGenerate(request: GenerationRequest) {
    lastRequest.current = request;
    generate(request);
  }

  function toggleTheme() {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="font-semibold">{t('app.title')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted"
            aria-label={t('toggle.locale')}
          >
            {locale.toUpperCase()}
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted"
            aria-label={t('toggle.theme')}
          >
            ◐
          </button>
        </div>
      </header>
      <main className="grid gap-6 p-6 lg:grid-cols-[12rem_minmax(20rem,24rem)_1fr]">
        <nav aria-label={t('nav.services')} className="flex flex-col gap-1">
          {SERVICE_CATALOG.map((serviceDefinition) => (
            <button
              key={serviceDefinition.id}
              onClick={() => dispatch({ type: 'select-service', value: serviceDefinition.id })}
              aria-current={serviceDefinition.id === draft.service ? 'true' : undefined}
              className="rounded-md px-3 py-2 text-left text-sm text-muted aria-[current]:bg-surface aria-[current]:text-fg"
            >
              {t(serviceDefinition.labelKey as MessageKey)}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-4">
          <ProviderSelector
            value={draft.provider}
            service={draft.service}
            onChange={(value) => dispatch({ type: 'select-provider', value })}
          />
          {provider.auth === 'api-key' && (
            <ApiKeyPanel
              provider={provider}
              {...(apiKey ? { currentKey: apiKey } : {})}
              onSave={(key) => setKey(draft.provider, key)}
              onClear={() => clearKey(draft.provider)}
            />
          )}
          <GenerationForm
            key={draft.service}
            draft={draft}
            dispatch={dispatch}
            busy={state.status === 'loading'}
            disabled={needsKey}
            onGenerate={handleGenerate}
          />
        </div>
        <ResultPanel
          state={state}
          onRetry={() => lastRequest.current && handleGenerate(lastRequest.current)}
        />
      </main>
    </div>
  );
}

export default function App({ service }: { service?: GenerationService }) {
  return (
    <I18nProvider>
      <Playground {...(service ? { service } : {})} />
    </I18nProvider>
  );
}
