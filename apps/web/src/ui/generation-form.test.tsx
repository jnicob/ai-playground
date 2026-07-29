import { useReducer, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GenerationRequest } from '@ai-playground/core';
import { I18nProvider } from '@/i18n/i18n';
import {
  createGenerationDraft,
  generationDraftReducer,
  type GenerationDraft,
} from './generation-draft';
import { GenerationForm } from './generation-form';

const wrap = (ui: ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

afterEach(() => vi.unstubAllGlobals());

function ControlledForm({
  initialDraft = createGenerationDraft(),
  onGenerate,
  busy = false,
  disabled = false,
}: {
  initialDraft?: GenerationDraft;
  onGenerate: (request: GenerationRequest) => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const [draft, dispatch] = useReducer(generationDraftReducer, initialDraft);
  return (
    <GenerationForm
      draft={draft}
      dispatch={dispatch}
      busy={busy}
      disabled={disabled}
      onGenerate={onGenerate}
    />
  );
}

describe('GenerationForm', () => {
  it('envía imagen desde el draft controlado con seed explícita', async () => {
    const onGenerate = vi.fn<(request: GenerationRequest) => void>();
    wrap(<ControlledForm onGenerate={onGenerate} />);

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

  it('muestra errores asociados y enfoca el primer campo inválido', async () => {
    const onGenerate = vi.fn();
    wrap(<ControlledForm onGenerate={onGenerate} />);

    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(onGenerate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Prompt')).toHaveFocus();
    expect(screen.getByLabelText('Prompt')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a prompt');
  });

  it('carga, previsualiza, reemplaza y borra una imagen válida', async () => {
    const onGenerate = vi.fn<(request: GenerationRequest) => void>();
    const initialDraft = generationDraftReducer(createGenerationDraft(), {
      type: 'select-service',
      value: 'edit-image',
    });
    wrap(<ControlledForm initialDraft={initialDraft} onGenerate={onGenerate} />);
    const input = screen.getByLabelText('Source image');
    const first = new File(
      [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      'first.png',
      { type: 'image/png' },
    );
    const second = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], 'second.jpg', {
      type: 'image/jpeg',
    });

    await userEvent.upload(input, first);
    expect(await screen.findByRole('img', { name: 'Source image preview' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    await userEvent.upload(input, second);
    expect(await screen.findByRole('img', { name: 'Source image preview' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^data:image\/jpeg;base64,/),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove source image' }));
    expect(screen.queryByRole('img', { name: 'Source image preview' })).not.toBeInTheDocument();
  });

  it('rechaza tipo, firma y tamaño antes de generar', async () => {
    const onGenerate = vi.fn();
    const initialDraft = generationDraftReducer(createGenerationDraft(), {
      type: 'select-service',
      value: 'edit-image',
    });
    wrap(<ControlledForm initialDraft={initialDraft} onGenerate={onGenerate} />);
    const input = screen.getByLabelText('Source image');

    await userEvent.upload(input, new File(['<svg/>'], 'active.svg', { type: 'image/svg+xml' }), {
      applyAccept: false,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG, or WebP');

    await userEvent.upload(input, new File(['not-a-png'], 'fake.png', { type: 'image/png' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');

    const oversized = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    await userEvent.upload(input, oversized);
    expect(await screen.findByRole('alert')).toHaveTextContent('10 MiB');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('no conserva la imagen anterior si el reemplazo es inválido', async () => {
    const initialDraft = generationDraftReducer(createGenerationDraft(), {
      type: 'select-service',
      value: 'edit-image',
    });
    wrap(<ControlledForm initialDraft={initialDraft} onGenerate={vi.fn()} />);
    const input = screen.getByLabelText('Source image');
    await userEvent.upload(
      input,
      new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'valid.png', {
        type: 'image/png',
      }),
    );
    expect(await screen.findByRole('img', { name: 'Source image preview' })).toBeInTheDocument();

    await userEvent.upload(
      input,
      new File(['not-a-png'], 'replacement.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('does not match');
    expect(screen.queryByRole('img', { name: 'Source image preview' })).not.toBeInTheDocument();
  });

  it('muestra controles y coste de vídeo, y exige confirmación informada', async () => {
    const onGenerate = vi.fn<(request: GenerationRequest) => void>();
    const initialDraft = generationDraftReducer(
      generationDraftReducer(createGenerationDraft(), {
        type: 'select-service',
        value: 'generate-video',
      }),
      { type: 'select-provider', value: 'google' },
    );
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    wrap(<ControlledForm initialDraft={initialDraft} onGenerate={onGenerate} />);

    expect(screen.getByLabelText('Duration')).toHaveValue('4');
    expect(screen.getByLabelText('Resolution')).toHaveValue('720p');
    expect(screen.getByRole('note')).toHaveTextContent(/does not guarantee cancellation/i);
    expect(screen.getByText(/USD 0.20 estimated/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Prompt'), 'A paper boat');
    await userEvent.selectOptions(screen.getByLabelText('Duration'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/veo-3\.1-lite.*USD 0\.40/i));
    expect(onGenerate).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'generate-video',
          durationSeconds: 8,
          resolution: '720p',
        }),
      ),
    );
  });

  it('bloquea el submit si falta key y evita duplicados durante busy', () => {
    const { rerender } = wrap(<ControlledForm onGenerate={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();

    rerender(
      <I18nProvider>
        <ControlledForm onGenerate={vi.fn()} busy />
      </I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });
});
