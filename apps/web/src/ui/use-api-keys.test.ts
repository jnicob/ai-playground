import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useApiKeys } from './use-api-keys';

beforeEach(() => sessionStorage.clear());

describe('useApiKeys', () => {
  it('empieza sin keys', () => {
    const { result } = renderHook(() => useApiKeys());
    expect(result.current.keyFor('google')).toBeUndefined();
  });

  it('guarda y lee por proveedor', () => {
    const { result } = renderHook(() => useApiKeys());
    act(() => result.current.setKey('google', 'abc'));
    expect(result.current.keyFor('google')).toBe('abc');
    expect(result.current.keyFor('pollinations')).toBeUndefined();
  });

  it('persiste en sessionStorage, nunca en localStorage', () => {
    const { result } = renderHook(() => useApiKeys());
    act(() => result.current.setKey('google', 'abc'));
    expect(sessionStorage.getItem('ai-playground:key:google')).toBe('abc');
    expect(localStorage.getItem('ai-playground:key:google')).toBeNull();
  });

  it('rehidrata desde sessionStorage al montar', () => {
    sessionStorage.setItem('ai-playground:key:google', 'from-storage');
    const { result } = renderHook(() => useApiKeys());
    expect(result.current.keyFor('google')).toBe('from-storage');
  });

  it('borra la key', () => {
    const { result } = renderHook(() => useApiKeys());
    act(() => result.current.setKey('google', 'abc'));
    act(() => result.current.clearKey('google'));
    expect(result.current.keyFor('google')).toBeUndefined();
    expect(sessionStorage.getItem('ai-playground:key:google')).toBeNull();
  });

  it('ignora valores en blanco', () => {
    const { result } = renderHook(() => useApiKeys());
    act(() => result.current.setKey('google', '   '));
    expect(result.current.keyFor('google')).toBeUndefined();
  });
});
