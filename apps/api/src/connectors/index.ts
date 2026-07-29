import { PlatformError, type PlaygroundMode, type ProviderId } from '@ai-playground/core';
import { googleEditConnector } from './google-edit';
import { googleConnector } from './google';
import { pollinationsConnector } from './pollinations';
import type { Connector } from './types';

/** mock no está aquí a propósito: corre client-side y no toca la API. */
const CONNECTORS: Partial<Record<ProviderId, Partial<Record<PlaygroundMode, Connector>>>> = {
  pollinations: { 'generate-image': pollinationsConnector },
  google: {
    'generate-image': googleConnector,
    'edit-image': googleEditConnector,
  },
};

export function connectorFor(
  provider: ProviderId,
  service: PlaygroundMode = 'generate-image',
): Connector {
  const connector = CONNECTORS[provider]?.[service];
  if (!connector) {
    throw new PlatformError(
      'unsupported_provider',
      `Unsupported provider "${provider}" for service "${service}"`,
    );
  }
  return connector;
}

export type { Connector, ConnectorContext } from './types';
