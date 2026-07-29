import { useCallback, useState } from 'react';
import type { ProviderId } from '@ai-playground/core';

const PREFIX = 'ai-playground:key:';

const storageKey = (provider: ProviderId): string => `${PREFIX}${provider}`;

function readAll(): Partial<Record<ProviderId, string>> {
  const entries: Partial<Record<ProviderId, string>> = {};
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    const value = sessionStorage.getItem(key);
    if (value) entries[key.slice(PREFIX.length) as ProviderId] = value;
  }
  return entries;
}

export function useApiKeys() {
  const [keys, setKeys] = useState<Partial<Record<ProviderId, string>>>(readAll);

  const keyFor = useCallback((provider: ProviderId) => keys[provider], [keys]);

  const setKey = useCallback((provider: ProviderId, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    sessionStorage.setItem(storageKey(provider), trimmed);
    setKeys((previous) => ({ ...previous, [provider]: trimmed }));
  }, []);

  const clearKey = useCallback((provider: ProviderId) => {
    sessionStorage.removeItem(storageKey(provider));
    setKeys((previous) => {
      const next = { ...previous };
      delete next[provider];
      return next;
    });
  }, []);

  return { keyFor, setKey, clearKey };
}
