import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROVIDERS } from '@ai-playground/core';
import { ApiKeyPanel } from './api-key-panel';
import { I18nProvider } from '@/i18n/i18n';

const google = PROVIDERS.find((provider) => provider.id === 'google')!;

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('ApiKeyPanel', () => {
  it('pide la key con un input password identificado para el autocompletado', () => {
    wrap(<ApiKeyPanel provider={google} onSave={vi.fn()} onClear={vi.fn()} />);
    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('name', 'provider-api-key');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('avisa del coste cuando el proveedor lo requiere', () => {
    wrap(<ApiKeyPanel provider={google} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('note')).toHaveTextContent(/cost/i);
  });

  it('guarda la key escrita mediante submit nativo', async () => {
    const onSave = vi.fn();
    wrap(<ApiKeyPanel provider={google} onSave={onSave} onClear={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('API key'), 'my-key{Enter}');
    expect(onSave).toHaveBeenCalledWith('my-key');
  });

  it('no guarda un valor vacío', async () => {
    const onSave = vi.fn();
    wrap(<ApiKeyPanel provider={google} onSave={onSave} onClear={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('con key guardada muestra el estado y permite borrarla', async () => {
    const onClear = vi.fn();
    wrap(<ApiKeyPanel provider={google} currentKey="abc" onSave={vi.fn()} onClear={onClear} />);
    expect(screen.getByRole('status')).toHaveTextContent(/key saved/i);
    await userEvent.click(screen.getByRole('button', { name: 'Clear key' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('nunca muestra la key guardada en claro', () => {
    wrap(
      <ApiKeyPanel
        provider={google}
        currentKey="super-secret"
        onSave={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByText(/super-secret/)).not.toBeInTheDocument();
  });
});
