import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { GenerationForm } from './generation-form';
import { I18nProvider } from '@/i18n/i18n';
import { PROVIDERS, SERVICES, type GenerationRequest } from '@ai-playground/core';

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);
const service = SERVICES[0]!;
const provider = PROVIDERS[0]!;

describe('GenerationForm', () => {
  it('envía la request con seed explícita', async () => {
    const onGenerate = vi.fn<(r: GenerationRequest) => void>();
    wrap(
      <GenerationForm service={service} provider={provider} busy={false} onGenerate={onGenerate} />,
    );
    await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox');
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'turbo');
    await userEvent.type(screen.getByLabelText('Seed'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).toHaveBeenCalledWith({
      service: 'generate-image',
      provider: 'mock',
      prompt: 'a red fox',
      model: 'turbo',
      aspectRatio: 'square_1_1',
      seed: 42,
    });
  });
  it('sin seed, resuelve una aleatoria (0..999999)', async () => {
    const onGenerate = vi.fn<(r: GenerationRequest) => void>();
    wrap(
      <GenerationForm service={service} provider={provider} busy={false} onGenerate={onGenerate} />,
    );
    await userEvent.type(screen.getByLabelText('Prompt'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    const seed = onGenerate.mock.calls[0]?.[0]?.seed;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(999_999);
  });
  it('con prompt vacío no envía y el botón busy se deshabilita', async () => {
    const onGenerate = vi.fn();
    const { rerender } = wrap(
      <GenerationForm service={service} provider={provider} busy={false} onGenerate={onGenerate} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).not.toHaveBeenCalled();
    rerender(
      <I18nProvider>
        <GenerationForm service={service} provider={provider} busy={true} onGenerate={onGenerate} />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });

  it('usa el primer modelo válido cuando cambia el proveedor', async () => {
    const onGenerate = vi.fn<(request: GenerationRequest) => void>();
    const { rerender } = wrap(
      <GenerationForm service={service} provider={provider} busy={false} onGenerate={onGenerate} />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Model'), 'turbo');

    rerender(
      <I18nProvider>
        <GenerationForm
          service={service}
          provider={PROVIDERS[2]!}
          busy={false}
          onGenerate={onGenerate}
        />
      </I18nProvider>,
    );

    expect(screen.getByLabelText('Model')).toHaveValue('gemini-3.1-flash-lite-image');
    await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'google',
        model: 'gemini-3.1-flash-lite-image',
      }),
    );
  });
});
