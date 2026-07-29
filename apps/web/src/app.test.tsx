import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './app';
import { createMockAdapter } from '@ai-playground/core';

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
