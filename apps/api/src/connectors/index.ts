import { PlatformError, type ProviderId } from '@ai-playground/core';
import { googleConnector } from './google';
import { pollinationsConnector } from './pollinations';
import type { Connector } from './types';

/** mock no está aquí a propósito: corre client-side y no toca la API. */
const CONNECTORS: Partial<Record<ProviderId, Connector>> = {
  pollinations: pollinationsConnector,
  google: googleConnector,
};

export function connectorFor(provider: ProviderId): Connector {
  const connector = CONNECTORS[provider];
  if (!connector) {
    throw new PlatformError('unsupported_provider', `Unsupported provider: "${provider}"`);
  }
  return connector;
}

export type { Connector, ConnectorContext } from './types';
