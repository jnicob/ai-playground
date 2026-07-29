import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultPanel } from './result-panel';
import { I18nProvider } from '@/i18n/i18n';
import type { GenerationState } from './use-generation';

const wrap = (state: GenerationState, onRetry = vi.fn()) =>
  render(
    <I18nProvider>
      <ResultPanel state={state} onRetry={onRetry} />
    </I18nProvider>,
  );

const success: GenerationState = {
  status: 'success',
  result: {
    kind: 'image',
    url: '/mocks/square-1.webp',
    width: 1024,
    height: 1024,
    provider: 'mock',
    degraded: false,
    elapsedMs: 12,
    apiTrace: [{ kind: 'status', state: 'IN_PROGRESS', taskId: 'task_1' }],
  },
};

describe('ResultPanel', () => {
  it('empty state', () => {
    wrap({ status: 'idle' });
    expect(screen.getByText(/press Generate/i)).toBeInTheDocument();
  });
  it('loading con aria-live', () => {
    wrap({ status: 'loading' });
    expect(screen.getByRole('status')).toHaveTextContent('Generating…');
  });
  it('error con botón de reintento', async () => {
    const onRetry = vi.fn();
    wrap({ status: 'error', message: 'boom' }, onRetry);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('success: imagen + badge de origen + tab API con la traza', async () => {
    wrap(success);
    expect(screen.getByRole('img', { name: 'Generated image' })).toHaveAttribute(
      'src',
      '/mocks/square-1.webp',
    );
    expect(screen.getByText('mock')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'API' }));
    expect(screen.getByText(/IN_PROGRESS/)).toBeInTheDocument();
  });
  it('badge degradado', () => {
    wrap({ ...success, result: { ...success.result, degraded: true } });
    expect(screen.getByText('live → mock')).toBeInTheDocument();
  });
  it('badge live para un resultado real', () => {
    wrap({
      ...success,
      result: { ...success.result, provider: 'pollinations', degraded: false },
    });
    expect(screen.getByText('live')).toBeInTheDocument();
  });
  it('imagen sin width/height (adaptador live que no las conoce): no inventa dimensiones', () => {
    const imageResult = success.result;
    if (imageResult.kind !== 'image') throw new Error('unreachable: fixture debe ser image');
    const resultWithoutDimensions: GenerationState = {
      status: 'success',
      result: {
        kind: 'image',
        url: imageResult.url,
        provider: imageResult.provider,
        degraded: imageResult.degraded,
        elapsedMs: imageResult.elapsedMs,
        apiTrace: imageResult.apiTrace,
      },
    };
    wrap(resultWithoutDimensions);
    const img = screen.getByRole('img', { name: 'Generated image' });
    expect(img).not.toHaveAttribute('width');
    expect(img).not.toHaveAttribute('height');
  });

  it('renderiza comparación antes/después', () => {
    wrap({
      status: 'success',
      result: {
        kind: 'image-pair',
        before: '/mocks/square-1.webp',
        after: '/mocks/square-2.webp',
        provider: 'mock',
        degraded: false,
        elapsedMs: 2,
        apiTrace: [],
      },
    });

    expect(screen.getByRole('img', { name: 'Original image' })).toHaveAttribute(
      'src',
      '/mocks/square-1.webp',
    );
    expect(screen.getByRole('img', { name: 'Edited image' })).toHaveAttribute(
      'src',
      '/mocks/square-2.webp',
    );
  });

  it('renderiza vídeo con controles y poster', () => {
    const { container } = wrap({
      status: 'success',
      result: {
        kind: 'video',
        url: '/mocks/video-gradient.webm',
        poster: '/mocks/wide-1.webp',
        dispose: vi.fn(),
        provider: 'mock',
        degraded: false,
        elapsedMs: 2,
        apiTrace: [],
      },
    });

    const video = container.querySelector('video');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('poster', '/mocks/wide-1.webp');
    expect(video).toHaveAttribute('preload', 'metadata');
  });

  it('descarga el resultado y anuncia éxito', async () => {
    const onDownload = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider>
        <ResultPanel state={success} onRetry={vi.fn()} onDownload={onDownload} />
      </I18nProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(onDownload).toHaveBeenCalledWith(success.result);
    expect(screen.getByRole('status')).toHaveTextContent('Download ready');
  });

  it('permite recorrer las tabs con flechas y expone el tabpanel', async () => {
    wrap(success);
    const preview = screen.getByRole('tab', { name: 'Preview' });
    preview.focus();

    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'API' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'API' })).toBeInTheDocument();
  });
});
