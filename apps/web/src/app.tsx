import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18n';
import {
  SERVICE_CATALOG,
  createGenerationService,
  providerById,
  type GenerationRequest,
  type GenerationResult,
  type GenerationService,
} from '@ai-playground/core';
import { EXAMPLES, type ExampleDefinition } from './examples';
import type { MessageKey } from './i18n/messages';
import { ApiKeyPanel } from './ui/api-key-panel';
import { ExampleGallery } from './ui/example-gallery';
import { GenerationForm } from './ui/generation-form';
import { createGenerationDraft, generationDraftReducer } from './ui/generation-draft';
import { ProviderSelector } from './ui/provider-selector';
import { ResultPanel } from './ui/result-panel';
import { ShareDialog } from './ui/share-dialog';
import { buildSafeUrl, parseUrlState } from './ui/url-state';
import { useApiKeys } from './ui/use-api-keys';
import { useGeneration } from './ui/use-generation';

function resultForExample(example: ExampleDefinition | undefined): GenerationResult | null {
  if (!example) return null;
  const metadata = {
    provider: example.patch.provider,
    degraded: false,
    elapsedMs: 0,
    apiTrace: [],
  };
  return example.result.kind === 'video'
    ? { ...example.result, ...metadata, dispose: () => undefined }
    : { ...example.result, ...metadata };
}

function exampleById(id: string | undefined, service?: ExampleDefinition['patch']['service']) {
  if (!id || !service) return undefined;
  return EXAMPLES.find((example) => example.id === id && example.patch.service === service);
}

function Playground({ service }: { service?: GenerationService }) {
  const { t, locale, setLocale } = useI18n();
  const [initialUrlState] = useState(() => parseUrlState(window.location.search));
  const [draft, dispatch] = useReducer(generationDraftReducer, initialUrlState.patch, (patch) =>
    generationDraftReducer(createGenerationDraft(), {
      type: 'hydrate-url',
      value: patch,
    }),
  );
  const { keyFor, setKey, clearKey } = useApiKeys();
  const lastRequest = useRef<GenerationRequest | null>(null);
  const initialExample = exampleById(initialUrlState.exampleId, initialUrlState.patch.service);
  const [exampleId, setExampleId] = useState<string | undefined>(() => initialExample?.id);
  const [exampleResult, setExampleResult] = useState<GenerationResult | null>(() =>
    resultForExample(initialExample),
  );
  const [shareUrl, setShareUrl] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const url = buildSafeUrl(new URL(window.location.href), draft, exampleId);
      window.history.replaceState(window.history.state, '', url);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [draft, exampleId]);

  useEffect(() => {
    function handlePopState() {
      const parsed = parseUrlState(window.location.search);
      dispatch({ type: 'hydrate-url', value: parsed.patch });
      const example = exampleById(parsed.exampleId, parsed.patch.service);
      setExampleId(example?.id);
      setExampleResult(resultForExample(example));
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function dispatchDraft(action: Parameters<typeof dispatch>[0]) {
    if (action.type !== 'load-example' && action.type !== 'hydrate-url') {
      setExampleId(undefined);
    }
    dispatch(action);
  }

  function handleGenerate(request: GenerationRequest) {
    lastRequest.current = request;
    setExampleResult(null);
    generate(request);
  }

  function handleUseExample(example: ExampleDefinition) {
    dispatch({ type: 'load-example', value: example.patch });
    setExampleId(example.id);
    setExampleResult(resultForExample(example));
  }

  function handleSelectService(value: (typeof SERVICE_CATALOG)[number]['id']) {
    setExampleResult(null);
    dispatchDraft({ type: 'select-service', value });
  }

  function openShareDialog() {
    const url = buildSafeUrl(new URL(window.location.href), draft, exampleId);
    window.history.replaceState(window.history.state, '', url);
    setShareUrl(url.toString());
    setShareOpen(true);
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
            onClick={openShareDialog}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted"
          >
            {t('share.open')}
          </button>
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
              onClick={() => handleSelectService(serviceDefinition.id)}
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
            onChange={(value) => dispatchDraft({ type: 'select-provider', value })}
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
            dispatch={dispatchDraft}
            busy={state.status === 'loading'}
            disabled={needsKey}
            onGenerate={handleGenerate}
          />
          <ExampleGallery service={draft.service} onUse={handleUseExample} />
        </div>
        <ResultPanel
          state={exampleResult ? { status: 'success', result: exampleResult } : state}
          onRetry={() => lastRequest.current && handleGenerate(lastRequest.current)}
        />
      </main>
      <ShareDialog open={shareOpen} url={shareUrl} onClose={() => setShareOpen(false)} />
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
