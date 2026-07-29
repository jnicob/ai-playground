import { PROVIDERS, providerById, type ProviderId } from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';

type Props = {
  value: ProviderId;
  onChange: (provider: ProviderId) => void;
};

export function ProviderSelector({ value, onChange }: Props) {
  const { t } = useI18n();
  const auth = providerById(value).auth;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="provider" className="text-sm text-muted">
        {t('provider.label')}
      </label>
      <select
        id="provider"
        value={value}
        onChange={(event) => onChange(event.target.value as ProviderId)}
        className="min-h-11 rounded-md border border-border bg-surface p-2 text-fg"
      >
        {PROVIDERS.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.id}
          </option>
        ))}
      </select>
      <span data-testid="provider-auth" className="text-xs text-muted">
        {auth === 'api-key' ? t('provider.auth.key') : t('provider.auth.none')}
      </span>
    </div>
  );
}
