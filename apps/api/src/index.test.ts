import { describe, expect, it } from 'vitest';
import { app } from './index';

describe('api', () => {
  it('GET /health responde ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'ai-playground-api' });
  });
  it('ruta desconocida → 404', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
  });
});
