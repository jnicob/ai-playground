import { useMemo, useRef, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18n';
import {
  SERVICES,
  createGenerationService,
  providerById,
  type GenerationRequest,
  type GenerationService,
  type PlaygroundMode,
  type ProviderId,
} from '@ai-playground/core';
import type { MessageKey } from './i18n/messages';
import { ApiKeyPanel } from './ui/api-key-panel';
import { GenerationForm } from './ui/generation-form';
import { ProviderSelector } from './ui/provider-selector';
import { ResultPanel } from './ui/result-panel';
import { useApiKeys } from './ui/use-api-keys';
import { useGeneration } from './ui/use-generation';

function Playground({ service }: { service?: GenerationService }) {
  const { t, locale, setLocale } = useI18n();
  const [activeService, setActiveService] = useState<PlaygroundMode>('generate-image');
  const [providerId, setProviderId] = useState<ProviderId>('mock');
  const { keyFor, setKey, clearKey } = useApiKeys();
  const lastRequest = useRef<GenerationRequest | null>(null);

  const provider = providerById(providerId);
  const apiKey = keyFor(providerId);
  const needsKey = provider.auth === 'api-key' && !apiKey;
  const activeGenerationService = useMemo(
    () =>
      service ??
      createGenerationService(providerId, {
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787',
        getApiKey: () => keyFor(providerId),
      }),
    [service, providerId, keyFor],
  );

  const { state, generate } = useGeneration(activeGenerationService);
  const serviceDef = SERVICES.find((s) => s.id === activeService) ?? SERVICES[0]!;

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
        <nav aria-label="Services" className="flex flex-col gap-1">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveService(s.id)}
              aria-current={s.id === activeService ? 'true' : undefined}
              className="rounded-md px-3 py-2 text-left text-sm text-muted aria-[current]:bg-surface aria-[current]:text-fg"
            >
              {t(s.labelKey as MessageKey)}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-4">
          <ProviderSelector value={providerId} onChange={setProviderId} />
          {provider.auth === 'api-key' && (
            <ApiKeyPanel
              provider={provider}
              {...(apiKey ? { currentKey: apiKey } : {})}
              onSave={(key) => setKey(providerId, key)}
              onClear={() => clearKey(providerId)}
            />
          )}
          <GenerationForm
            service={serviceDef}
            provider={provider}
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
