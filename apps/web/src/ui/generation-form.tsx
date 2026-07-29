import { useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n/i18n';
import {
  ASPECT_RATIOS,
  type AspectRatio,
  type GenerationRequest,
  type ProviderDefinition,
  type ServiceDefinition,
} from '@ai-playground/core';

type Props = {
  service: ServiceDefinition;
  provider: ProviderDefinition;
  busy: boolean;
  onGenerate: (request: GenerationRequest) => void;
};

const MAX_SEED = 999_999;
export const randomSeed = () => Math.floor(Math.random() * (MAX_SEED + 1));

export function GenerationForm({ service, provider, busy, onGenerate }: Props) {
  const { t } = useI18n();
  const models = provider.models[service.id] ?? [];
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(models[0] ?? '');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('square_1_1');
  const [seedInput, setSeedInput] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    onGenerate({
      service: service.id,
      provider: provider.id,
      prompt: prompt.trim(),
      model,
      aspectRatio,
      seed: seedInput === '' ? randomSeed() : Number(seedInput),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="prompt" className="text-sm text-muted">{t('form.prompt')}</label>
        <textarea
          id="prompt" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          className="rounded-md border border-border bg-surface p-2 text-fg"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="model" className="text-sm text-muted">{t('form.model')}</label>
        <select
          id="model" value={model} onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border bg-surface p-2 text-fg"
        >
          {models.map((m) => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="aspect" className="text-sm text-muted">{t('form.aspectRatio')}</label>
        <select
          id="aspect" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
          className="rounded-md border border-border bg-surface p-2 text-fg"
        >
          {(Object.keys(ASPECT_RATIOS) as AspectRatio[]).map((ar) => (
            <option key={ar} value={ar}>{t(`aspect.${ar}`)}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="seed" className="text-sm text-muted">{t('form.seed')}</label>
        <div className="flex gap-2">
          <input
            id="seed" type="number" min={0} max={MAX_SEED} value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            className="w-32 rounded-md border border-border bg-surface p-2 text-fg"
          />
          <button
            type="button" onClick={() => setSeedInput(String(randomSeed()))}
            className="rounded-md border border-border px-3 text-sm text-muted"
          >
            {t('form.seed.random')}
          </button>
        </div>
      </div>
      <button
        type="submit" disabled={busy}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
        {busy ? t('form.generating') : t('form.generate')}
      </button>
    </form>
  );
}
