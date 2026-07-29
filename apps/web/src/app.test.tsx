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
