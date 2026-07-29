import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/i18n/i18n';
import { ApiTraceView } from './api-trace-view';
import type { ApiTraceStep } from '@ai-playground/core';

const trace: ApiTraceStep[] = [
  {
    kind: 'request',
    method: 'POST',
    url: 'https://api.example.test/v1/services/generate-image',
    body: {
      provider: 'google',
      prompt: 'a red fox',
      model: 'gemini-3.1-flash-lite-image',
      aspect_ratio: 'square_1_1',
      seed: 42,
    },
  },
  { kind: 'status', state: 'IN_PROGRESS', taskId: 'v1.abc' },
];

const renderView = () =>
  render(
    <I18nProvider>
      <ApiTraceView trace={trace} />
    </I18nProvider>,
  );

describe('ApiTraceView snippets', () => {
  it('ofrece cURL, JavaScript y Python con un control etiquetado', async () => {
    renderView();

    const language = screen.getByLabelText('Code language');
    expect(language).toHaveValue('curl');
    expect(screen.getByText(/curl --fail-with-body/)).toBeInTheDocument();

    await userEvent.selectOptions(language, 'javascript');
    expect(screen.getByText(/await fetch/)).toBeInTheDocument();

    await userEvent.selectOptions(language, 'python');
    expect(screen.getByText(/requests\.post/)).toBeInTheDocument();
  });

  it('copia el snippet y anuncia el resultado', async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderView();

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(String(writeText.mock.calls[0]?.[0])).toContain('curl --fail-with-body');
    expect(screen.getByRole('status')).toHaveTextContent('Copied');
  });

  it('anuncia un fallo de clipboard sin romper la traza', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    renderView();

    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));

    expect(screen.getByRole('status')).toHaveTextContent('Could not copy');
    expect(screen.getByText('status: IN_PROGRESS')).toBeInTheDocument();
  });
});
