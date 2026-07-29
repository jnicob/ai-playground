import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './app';
import { createMockAdapter } from '@ai-playground/core';

afterEach(() => history.replaceState({}, '', '/'));

describe('App', () => {
  it('flujo completo: prompt → Generate → imagen mock + traza en tab API', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByRole('img', { name: 'Generated image' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'API' }));
    expect(screen.getByText(/COMPLETED/)).toBeInTheDocument();
  });
  it('el rail lista los servicios del registry y marca el activo', () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    expect(screen.getByRole('button', { name: 'Generate image' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Edit image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeInTheDocument();
  });

  it('preserva el prompt al cambiar de servicio y muestra solo campos compatibles', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.type(screen.getByLabelText('Prompt'), 'A paper boat');
    await userEvent.click(screen.getByRole('button', { name: 'Generate video' }));

    expect(screen.getByLabelText('Prompt')).toHaveValue('A paper boat');
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.queryByLabelText('Source image')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Edit image' }));
    expect(screen.getByLabelText('Prompt')).toHaveValue('A paper boat');
    expect(screen.getByLabelText('Source image')).toBeInTheDocument();
    expect(screen.queryByLabelText('Duration')).not.toBeInTheDocument();
  });

  it('usar un ejemplo hidrata draft y resultado sin invocar el adaptador', async () => {
    const service = createMockAdapter({ latencyMs: 0 });
    const generate = vi.spyOn(service, 'generate');
    render(<App service={service} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Use example' })[0]!);

    expect(screen.getByLabelText('Prompt')).toHaveValue('A paper boat under moonlight');
    expect(screen.getByRole('img', { name: 'Generated image' })).toHaveAttribute(
      'src',
      '/mocks/wide-1.webp',
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it('hidrata la configuración inicial, reacciona a popstate y actualiza la URL con debounce', async () => {
    history.replaceState(
      {},
      '',
      '/?service=generate-image&provider=mock&model=flux&prompt=From+URL&aspect=square_1_1',
    );
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);

    expect(screen.getByLabelText('Prompt')).toHaveValue('From URL');

    history.pushState(
      {},
      '',
      '/?service=generate-image&provider=mock&model=flux&prompt=Back&aspect=square_1_1',
    );
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByDisplayValue('Back')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Prompt'), ' forward');
    await waitFor(() => expect(location.search).toContain('prompt=Back+forward'));
  });

  it('abre el diálogo de compartir con una URL segura', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);

    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(screen.getByRole('dialog', { name: 'Share configuration' })).toBeInTheDocument();
  });

  it('registra resultados en historial y los restaura sin relanzar', async () => {
    const service = createMockAdapter({ latencyMs: 0 });
    const generate = vi.spyOn(service, 'generate');
    render(<App service={service} />);

    await userEvent.type(screen.getByLabelText('Prompt'), 'History fox');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText(/flux · completed/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Restore result' }));

    expect(screen.getByRole('img', { name: 'Generated image' })).toBeInTheDocument();
    expect(generate).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.queryByRole('img', { name: 'Generated image' })).not.toBeInTheDocument();
  });
});

describe('App con proveedores live', () => {
  it('muestra el panel de key al elegir un proveedor que la requiere', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    expect(screen.getByRole('heading', { name: 'API key required' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/no free tier/i);
  });

  it('no pide key para un proveedor sin auth', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'pollinations');
    expect(screen.queryByRole('heading', { name: 'API key required' })).not.toBeInTheDocument();
  });

  it('el formulario ofrece los modelos del proveedor elegido', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    const models = screen.getByLabelText('Model') as HTMLSelectElement;
    expect([...models.options].map((option) => option.value)).toContain('gemini-2.5-flash-image');
    expect(models).toHaveValue('gemini-3.1-flash-lite-image');
  });

  it('bloquea generar si falta la key del proveedor', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });
});
