import { useRef, useState, type ChangeEvent, type Dispatch, type FormEvent } from 'react';
import {
  modelById,
  modelsFor,
  providerById,
  type GenerationRequest,
  type SourceImage,
} from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';
import type { GenerationDraft, GenerationDraftAction } from './generation-draft';

type Props = {
  draft: GenerationDraft;
  dispatch: Dispatch<GenerationDraftAction>;
  busy: boolean;
  disabled?: boolean;
  onGenerate: (request: GenerationRequest) => void;
};

type FormErrors = {
  prompt?: string;
  seed?: string;
  sourceImage?: string;
};

function withoutError(errors: FormErrors, field: keyof FormErrors): FormErrors {
  const result = { ...errors };
  delete result[field];
  return result;
}

const MAX_SEED = 999_999;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES: readonly SourceImage['mimeType'][] = [
  'image/png',
  'image/jpeg',
  'image/webp',
];

export const randomSeed = () => Math.floor(Math.random() * (MAX_SEED + 1));

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read failed')),
    );
    reader.addEventListener('error', () => reject(new Error('read failed')));
    reader.readAsDataURL(file);
  });
}

function hasExpectedSignature(mimeType: SourceImage['mimeType'], data: string): boolean {
  let binary: string;
  try {
    binary = atob(data);
  } catch {
    return false;
  }
  const byte = (index: number) => binary.charCodeAt(index);
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => byte(index) === value,
    );
  }
  if (mimeType === 'image/jpeg') {
    return byte(0) === 0xff && byte(1) === 0xd8 && byte(2) === 0xff;
  }
  return (
    byte(0) === 0x52 &&
    byte(1) === 0x49 &&
    byte(2) === 0x46 &&
    byte(3) === 0x46 &&
    byte(8) === 0x57 &&
    byte(9) === 0x45 &&
    byte(10) === 0x42 &&
    byte(11) === 0x50
  );
}

function isAllowedImageType(value: string): value is SourceImage['mimeType'] {
  return ALLOWED_IMAGE_TYPES.some((mimeType) => mimeType === value);
}

function estimateFor(draft: GenerationDraft): string | undefined {
  const pricing = modelById(draft.provider, draft.service, draft.model).pricing;
  if (!pricing) return undefined;
  const amount =
    pricing.unit === 'second' ? pricing.amount * draft.durationSeconds : pricing.amount;
  return `USD ${amount < 0.1 ? amount.toFixed(4) : amount.toFixed(2)}`;
}

export function GenerationForm({ draft, dispatch, busy, disabled, onGenerate }: Props) {
  const { t } = useI18n();
  const [errors, setErrors] = useState<FormErrors>({});
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadVersion = useRef(0);
  const provider = providerById(draft.provider);
  const models = modelsFor(draft.provider, draft.service);
  const definition = modelById(draft.provider, draft.service, draft.model);
  const estimate = estimateFor(draft);
  const sourcePreview = draft.sourceImage
    ? `data:${draft.sourceImage.mimeType};base64,${draft.sourceImage.data}`
    : undefined;

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++uploadVersion.current;
    dispatch({ type: 'clear-source-image' });
    setErrors((current) => withoutError(current, 'sourceImage'));

    if (!isAllowedImageType(file.type)) {
      setErrors((current) => ({ ...current, sourceImage: t('form.upload.typeError') }));
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setErrors((current) => ({ ...current, sourceImage: t('form.upload.sizeError') }));
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      if (version !== uploadVersion.current) return;
      const separator = dataUrl.indexOf(',');
      const data = separator >= 0 ? dataUrl.slice(separator + 1) : '';
      if (!hasExpectedSignature(file.type, data)) {
        setErrors((current) => ({ ...current, sourceImage: t('form.upload.signatureError') }));
        return;
      }
      dispatch({ type: 'set-source-image', value: { mimeType: file.type, data } });
    } catch {
      if (version === uploadVersion.current) {
        setErrors((current) => ({ ...current, sourceImage: t('form.upload.readError') }));
      }
    }
  }

  function clearSourceImage() {
    uploadVersion.current += 1;
    dispatch({ type: 'clear-source-image' });
    setErrors((current) => withoutError(current, 'sourceImage'));
    if (uploadRef.current) uploadRef.current.value = '';
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const prompt = draft.prompt.trim();
    const seed = draft.seedInput === '' ? randomSeed() : Number(draft.seedInput);
    const nextErrors: FormErrors = {};
    if (!prompt) nextErrors.prompt = t('form.prompt.required');
    if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
      nextErrors.seed = t('form.seed.invalid');
    }
    if (draft.service === 'edit-image' && !draft.sourceImage) {
      nextErrors.sourceImage = t('form.upload.required');
    }
    setErrors(nextErrors);

    if (nextErrors.prompt) {
      promptRef.current?.focus();
      return;
    }
    if (nextErrors.sourceImage) {
      uploadRef.current?.focus();
      return;
    }
    if (nextErrors.seed) {
      seedRef.current?.focus();
      return;
    }

    if (
      provider.costWarning &&
      estimate &&
      !globalThis.confirm(`${t('form.cost.confirm')} ${draft.model} — ${estimate}`)
    ) {
      return;
    }

    const base = {
      provider: draft.provider,
      prompt,
      model: draft.model,
      aspectRatio: draft.aspectRatio,
      seed,
    };
    if (draft.service === 'edit-image') {
      if (!draft.sourceImage) return;
      onGenerate({ ...base, service: draft.service, sourceImage: draft.sourceImage });
      return;
    }
    if (draft.service === 'generate-video') {
      if (draft.aspectRatio === 'square_1_1') return;
      onGenerate({
        ...base,
        service: draft.service,
        aspectRatio: draft.aspectRatio,
        durationSeconds: draft.durationSeconds,
        resolution: draft.resolution,
      });
      return;
    }
    onGenerate({ ...base, service: draft.service });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="prompt" className="text-sm text-muted">
          {t('form.prompt')}
        </label>
        <textarea
          ref={promptRef}
          id="prompt"
          name="prompt"
          rows={4}
          maxLength={1000}
          value={draft.prompt}
          aria-invalid={errors.prompt ? 'true' : undefined}
          aria-describedby={errors.prompt ? 'prompt-error' : undefined}
          onChange={(event) => {
            dispatch({ type: 'set-prompt', value: event.target.value });
            if (errors.prompt) setErrors((current) => withoutError(current, 'prompt'));
          }}
          className="rounded-md border border-border bg-surface p-2 text-fg"
        />
        {errors.prompt && (
          <p id="prompt-error" role="alert" className="text-sm text-danger">
            {errors.prompt}
          </p>
        )}
      </div>

      {draft.service === 'edit-image' && (
        <div className="flex flex-col gap-2">
          <label htmlFor="source-image" className="text-sm text-muted">
            {t('form.upload.label')}
          </label>
          <input
            ref={uploadRef}
            id="source-image"
            name="source-image"
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            aria-invalid={errors.sourceImage ? 'true' : undefined}
            aria-describedby={`source-image-help${errors.sourceImage ? ' source-image-error' : ''}`}
            onChange={handleUpload}
            className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
          />
          <p id="source-image-help" className="text-xs text-muted">
            {t('form.upload.help')}
          </p>
          {errors.sourceImage && (
            <p id="source-image-error" role="alert" className="text-sm text-danger">
              {errors.sourceImage}
            </p>
          )}
          {sourcePreview && (
            <div className="flex items-start gap-2">
              <img
                src={sourcePreview}
                alt={t('form.upload.preview')}
                className="h-24 w-24 rounded-md border border-border object-cover"
              />
              <button
                type="button"
                onClick={clearSourceImage}
                className="min-h-11 rounded-md border border-border px-3 text-sm text-muted"
              >
                {t('form.upload.remove')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="model" className="text-sm text-muted">
          {t('form.model')}
        </label>
        <select
          id="model"
          name="model"
          value={draft.model}
          onChange={(event) => dispatch({ type: 'select-model', value: event.target.value })}
          className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
        >
          {models.map((model) => (
            <option key={model}>{model}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="aspect" className="text-sm text-muted">
          {t('form.aspectRatio')}
        </label>
        <select
          id="aspect"
          name="aspect-ratio"
          value={draft.aspectRatio}
          onChange={(event) => {
            const value = definition.aspectRatios.find((ratio) => ratio === event.target.value);
            if (value) dispatch({ type: 'select-aspect-ratio', value });
          }}
          className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
        >
          {definition.aspectRatios.map((aspectRatio) => (
            <option key={aspectRatio} value={aspectRatio}>
              {t(`aspect.${aspectRatio}`)}
            </option>
          ))}
        </select>
      </div>

      {draft.service === 'generate-video' && (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="duration" className="text-sm text-muted">
              {t('form.duration')}
            </label>
            <select
              id="duration"
              name="duration"
              value={draft.durationSeconds}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === 4 || value === 6 || value === 8) {
                  dispatch({ type: 'set-duration', value });
                }
              }}
              className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
            >
              <option value={4}>4 s</option>
              <option value={6}>6 s</option>
              <option value={8}>8 s</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="resolution" className="text-sm text-muted">
              {t('form.resolution')}
            </label>
            <select
              id="resolution"
              name="resolution"
              value={draft.resolution}
              onChange={() => dispatch({ type: 'set-resolution', value: '720p' })}
              className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
            >
              <option value="720p">720p</option>
            </select>
          </div>
          {provider.costWarning && (
            <p className="text-sm text-muted">
              {estimate} {t('form.cost.estimated')}
            </p>
          )}
          {provider.costWarning && (
            <p role="note" className="text-sm text-muted">
              {t('form.video.abortWarning')}
            </p>
          )}
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="seed" className="text-sm text-muted">
          {t('form.seed')}
        </label>
        <div className="flex gap-2">
          <input
            ref={seedRef}
            id="seed"
            name="seed"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            min={0}
            max={MAX_SEED}
            value={draft.seedInput}
            aria-invalid={errors.seed ? 'true' : undefined}
            aria-describedby={errors.seed ? 'seed-error' : undefined}
            onChange={(event) => {
              dispatch({ type: 'set-seed', value: event.target.value });
              if (errors.seed) setErrors((current) => withoutError(current, 'seed'));
            }}
            className="min-h-11 w-32 rounded-md border border-border bg-surface p-2 text-fg"
          />
          <button
            type="button"
            onClick={() => dispatch({ type: 'set-seed', value: String(randomSeed()) })}
            className="min-h-11 rounded-md border border-border px-3 text-sm text-muted"
          >
            {t('form.seed.random')}
          </button>
        </div>
        {errors.seed && (
          <p id="seed-error" role="alert" className="text-sm text-danger">
            {errors.seed}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={busy || disabled}
        className="min-h-11 rounded-md bg-accent px-4 font-medium text-accent-fg disabled:opacity-60"
      >
        {busy ? t('form.generating') : t('form.generate')}
      </button>
    </form>
  );
}
