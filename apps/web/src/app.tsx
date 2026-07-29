import { useMemo, useRef, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18n';
import {
  PROVIDERS,
  SERVICES,
  createGenerationService,
  type GenerationRequest,
  type GenerationService,
  type PlaygroundMode,
} from '@ai-playground/core';
import type { MessageKey } from './i18n/messages';
import { GenerationForm } from './ui/generation-form';
import { ResultPanel } from './ui/result-panel';
import { useGeneration } from './ui/use-generation';

function Playground({ service }: { service: GenerationService }) {
  const { t, locale, setLocale } = useI18n();
  const [activeService, setActiveService] = useState<PlaygroundMode>('generate-image');
  const { state, generate } = useGeneration(service);
  const lastRequest = useRef<GenerationRequest | null>(null);
  const serviceDef = SERVICES.find((s) => s.id === activeService) ?? SERVICES[0]!;
  const provider = PROVIDERS[0]!;

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
        <GenerationForm
          service={serviceDef}
          provider={provider}
          busy={state.status === 'loading'}
          onGenerate={handleGenerate}
        />
        <ResultPanel
          state={state}
          onRetry={() => lastRequest.current && handleGenerate(lastRequest.current)}
        />
      </main>
    </div>
  );
}

export default function App({ service }: { service?: GenerationService }) {
  const svc = useMemo(() => service ?? createGenerationService('mock'), [service]);
  return (
    <I18nProvider>
      <Playground service={svc} />
    </I18nProvider>
  );
}
