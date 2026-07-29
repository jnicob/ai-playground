import type { GenerationResult } from '@ai-playground/core';

const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
} as const;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

type AllowedMime = keyof typeof MIME_EXTENSIONS;

type DownloadOptions = {
  fetchImpl?: typeof fetch;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  save?: (url: string, filename: string) => void;
};

function isAllowedMime(value: string): value is AllowedMime {
  return Object.hasOwn(MIME_EXTENSIONS, value);
}

export function sanitizeDownloadFilename(value: string, mime: AllowedMime): string {
  const basename = value.replaceAll('\\', '/').split('/').at(-1) ?? '';
  const withoutExtension = basename.replace(/\.[^.]*$/, '');
  const safeBase =
    withoutExtension
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'ai-playground-result';
  return `${safeBase}.${MIME_EXTENSIONS[mime]}`;
}

function resultUrl(result: GenerationResult): string {
  return result.kind === 'image'
    ? result.url
    : result.kind === 'image-pair'
      ? result.after
      : result.url;
}

export async function downloadResult(
  result: GenerationResult,
  filename: string,
  options: DownloadOptions = {},
): Promise<void> {
  const response = await (options.fetchImpl ?? fetch)(resultUrl(result));
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  const blob = await response.blob();
  if (!isAllowedMime(blob.type)) throw new Error('Unsupported download content type');
  if (blob.size > MAX_DOWNLOAD_BYTES) throw new Error('Download exceeds the size limit');

  const createObjectUrl = options.createObjectUrl ?? URL.createObjectURL;
  const revokeObjectUrl = options.revokeObjectUrl ?? URL.revokeObjectURL;
  const url = createObjectUrl(blob);
  try {
    const safeFilename = sanitizeDownloadFilename(filename, blob.type);
    if (options.save) {
      options.save(url, safeFilename);
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = safeFilename;
      link.click();
    }
  } finally {
    revokeObjectUrl(url);
  }
}
