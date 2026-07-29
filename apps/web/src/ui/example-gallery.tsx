import type { PlaygroundMode } from '@ai-playground/core';
import { EXAMPLES, type ExampleDefinition } from '@/examples';
import { useI18n } from '@/i18n/i18n';

type Props = {
  service: PlaygroundMode;
  onUse: (example: ExampleDefinition) => void;
};

export function ExampleGallery({ service, onUse }: Props) {
  const { t } = useI18n();
  const examples = EXAMPLES.filter((example) => example.patch.service === service);

  return (
    <section aria-labelledby="examples-title" className="flex flex-col gap-3">
      <h2 id="examples-title" className="font-medium">
        {t('examples.title')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {examples.map((example) => {
          const preview =
            example.result.kind === 'image'
              ? example.result.url
              : example.result.kind === 'image-pair'
                ? example.result.after
                : example.result.poster;

          return (
            <article
              key={example.id}
              className="flex flex-col overflow-hidden rounded-md border border-border bg-surface"
            >
              <img
                src={preview}
                alt={t(example.altKey)}
                width={example.result.width}
                height={example.result.height}
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              <div className="flex flex-1 flex-col items-start gap-2 p-3">
                <h3 className="text-sm font-medium">{t(example.titleKey)}</h3>
                <button
                  type="button"
                  onClick={() => onUse(example)}
                  className="mt-auto min-h-11 rounded-md border border-border px-3 py-2 text-sm"
                >
                  {t('examples.use')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
