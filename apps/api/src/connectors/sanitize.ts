const MAX_MESSAGE_LENGTH = 300;

/**
 * Sanea un mensaje de error de un upstream antes de reenviarlo al cliente: nunca debe poder
 * filtrar la API key del usuario (ni ningún otro secreto reflejado por el proveedor) y nunca
 * debe reenviar cuerpos enormes tal cual.
 */
export function sanitizeUpstreamMessage(
  message: string | undefined,
  secret: string | undefined,
  fallback: string,
): string {
  if (!message) return fallback;

  const redacted = secret ? message.split(secret).join('«redacted»') : message;

  if (redacted.length <= MAX_MESSAGE_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_MESSAGE_LENGTH)}…`;
}
