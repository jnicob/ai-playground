import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@/i18n/i18n';
import { EXAMPLES } from '@/examples';
import { ExampleGallery } from './example-gallery';

const renderGallery = (service: 'generate-image' | 'edit-image' | 'generate-video') => {
  const onUse = vi.fn();
  render(
    <I18nProvider>
      <ExampleGallery service={service} onUse={onUse} />
    </I18nProvider>,
  );
  return onUse;
};

describe('EXAMPLES', () => {
  it('tiene ids únicos, URLs locales y cobertura por servicio/familia inicial', () => {
    expect(new Set(EXAMPLES.map(({ id }) => id)).size).toBe(EXAMPLES.length);
    expect(new Set(EXAMPLES.map(({ patch }) => patch.service))).toEqual(
      new Set(['generate-image', 'edit-image', 'generate-video']),
    );
    expect(EXAMPLES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ patch: expect.objectContaining({ model: 'flux' }) }),
        expect.objectContaining({
          patch: expect.objectContaining({ model: 'gemini-3.1-flash-lite-image' }),
        }),
        expect.objectContaining({ patch: expect.objectContaining({ model: 'mock-edit-v1' }) }),
        expect.objectContaining({ patch: expect.objectContaining({ model: 'mock-video-v1' }) }),
        expect.objectContaining({
          patch: expect.objectContaining({ model: 'veo-3.1-lite-generate-preview' }),
        }),
      ]),
    );
    for (const example of EXAMPLES) {
      const urls =
        example.result.kind === 'image'
          ? [example.result.url]
          : example.result.kind === 'image-pair'
            ? [example.result.before, example.result.after]
            : [example.result.url, example.result.poster];
      expect(urls.every((url) => url.startsWith('/mocks/'))).toBe(true);
    }
  });
});

describe('ExampleGallery', () => {
  it('muestra imágenes con alt, dimensiones y botón accesible', async () => {
    const onUse = renderGallery('generate-image');

    const preview = screen.getByRole('img', { name: 'Moonlit paper boat' });
    expect(preview).toHaveAttribute('width');
    expect(preview).toHaveAttribute('height');
    await userEvent.click(screen.getAllByRole('button', { name: 'Use example' })[0]!);

    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ id: 'image-mock-paper-boat' }));
  });

  it('usa un póster dimensionado para vídeo sin precargar el binario', () => {
    renderGallery('generate-video');

    const poster = screen.getByRole('img', { name: 'Aurora gradient video' });
    expect(poster).toHaveAttribute('width', '960');
    expect(poster).toHaveAttribute('height', '540');
    expect(screen.queryByRole('video')).not.toBeInTheDocument();
  });
});
