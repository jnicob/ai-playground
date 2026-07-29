import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GenerationRequest, GenerationResult } from '@ai-playground/core';
import { summarizeRequest, useSessionHistory } from './session-history';

const editRequest: GenerationRequest = {
  service: 'edit-image',
  provider: 'mock',
  prompt: 'Neon portrait',
  model: 'mock-edit-v1',
  aspectRatio: 'square_1_1',
  seed: 3,
  sourceImage: { mimeType: 'image/png', data: 'private-upload-base64' },
};

function videoResult(index: number, dispose = vi.fn()): GenerationResult {
  return {
    kind: 'video',
    url: `blob:video-${index}`,
    poster: '/mocks/wide-1.webp',
    dispose,
    provider: 'google',
    degraded: false,
    elapsedMs: 10,
    apiTrace: [{ kind: 'status', state: 'IN_PROGRESS', taskId: `task_${index}` }],
  };
}

describe('summarizeRequest', () => {
  it('excluye por construcción el contenido del upload', () => {
    const summary = summarizeRequest(editRequest);

    expect(summary).toEqual({
      service: 'edit-image',
      provider: 'mock',
      prompt: 'Neon portrait',
      model: 'mock-edit-v1',
      aspectRatio: 'square_1_1',
      seed: 3,
    });
    expect(JSON.stringify(summary)).not.toContain('private-upload-base64');
  });
});

describe('useSessionHistory', () => {
  it('limita a 20, elimina trazas/task IDs y libera el resultado expulsado', () => {
    const firstDispose = vi.fn();
    const { result } = renderHook(() => useSessionHistory());

    act(() => {
      for (let index = 0; index < 21; index += 1) {
        result.current.addCompleted(
          { ...editRequest, service: 'generate-image' },
          videoResult(index, index === 0 ? firstDispose : vi.fn()),
        );
      }
    });

    expect(result.current.entries).toHaveLength(20);
    expect(firstDispose).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.current.entries)).not.toMatch(/task_|private-upload/);
  });

  it('revoca resultados al eliminar y desmontar', () => {
    const removedDispose = vi.fn();
    const remainingDispose = vi.fn();
    const { result, unmount } = renderHook(() => useSessionHistory());

    act(() => {
      result.current.addCompleted(editRequest, videoResult(1, removedDispose));
      result.current.addCompleted(editRequest, videoResult(2, remainingDispose));
    });
    const first = result.current.entries[0];
    if (!first) throw new Error('expected first history entry');
    act(() => result.current.remove(first.id));

    expect(removedDispose).toHaveBeenCalledOnce();
    unmount();
    expect(remainingDispose).toHaveBeenCalledOnce();
  });

  it('registra fallos sin conservar mensajes potencialmente sensibles', () => {
    const { result } = renderHook(() => useSessionHistory());

    act(() => result.current.addFailed(editRequest));

    expect(result.current.entries[0]).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(result.current.entries)).not.toContain('private-upload-base64');
  });
});
