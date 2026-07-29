import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderSelector } from './provider-selector';
import { I18nProvider } from '@/i18n/i18n';

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('ProviderSelector', () => {
  it('lista los tres proveedores del registry', () => {
    wrap(<ProviderSelector value="mock" onChange={vi.fn()} />);
    const select = screen.getByLabelText('Provider') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual([
      'mock',
      'pollinations',
      'google',
    ]);
  });

  it('marca cuáles requieren key', () => {
    wrap(<ProviderSelector value="google" onChange={vi.fn()} />);
    expect(screen.getByTestId('provider-auth')).toHaveTextContent('API key');
  });

  it('notifica el cambio de proveedor', async () => {
    const onChange = vi.fn();
    wrap(<ProviderSelector value="mock" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'pollinations');
    expect(onChange).toHaveBeenCalledWith('pollinations');
  });
});
