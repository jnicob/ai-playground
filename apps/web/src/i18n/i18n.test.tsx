import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider, useI18n } from './i18n';
import { MESSAGES, type MessageKey } from './messages';
import { SERVICES } from '@ai-playground/core';

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('i18n', () => {
  it('es y en tienen exactamente las mismas claves', () => {
    expect(Object.keys(MESSAGES.es).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });
  it('todo labelKey del registry existe en el catálogo', () => {
    for (const s of SERVICES)
      expect(MESSAGES.en[s.labelKey as MessageKey], s.labelKey).toBeDefined();
  });
  it('traduce y cambia de locale persistiendo en localStorage', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.t('form.generate')).toBe(MESSAGES.en['form.generate']);
    act(() => result.current.setLocale('es'));
    expect(result.current.t('form.generate')).toBe(MESSAGES.es['form.generate']);
    expect(localStorage.getItem('ai-playground:locale')).toBe('es');
  });
});
