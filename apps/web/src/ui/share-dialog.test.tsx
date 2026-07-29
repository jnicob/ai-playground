import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/i18n';
import { ShareDialog } from './share-dialog';

describe('ShareDialog', () => {
  it('mueve el foco, copia la URL y explica los datos omitidos', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <I18nProvider>
        <ShareDialog open url="https://playground.example/?prompt=Aurora" onClose={vi.fn()} />
      </I18nProvider>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Share configuration' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(dialog).toHaveTextContent(/API key, uploads, results and history are not shared/i);

    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith('https://playground.example/?prompt=Aurora');
    expect(screen.getByRole('status')).toHaveTextContent('Link copied');
  });

  it('cierra con el evento cancel nativo de Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <ShareDialog open url="https://playground.example/" onClose={onClose} />
      </I18nProvider>,
    );

    fireEvent(
      screen.getByRole('dialog', { name: 'Share configuration' }),
      new Event('cancel', { bubbles: false, cancelable: true }),
    );

    expect(onClose).toHaveBeenCalledOnce();
  });
});
