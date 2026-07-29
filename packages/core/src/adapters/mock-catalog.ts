import type { AspectRatio } from '../types';

export const MOCK_CATALOG: Record<AspectRatio, readonly string[]> = {
  square_1_1: ['/mocks/square-1.webp', '/mocks/square-2.webp'],
  widescreen_16_9: ['/mocks/wide-1.webp', '/mocks/wide-2.webp'],
  vertical_9_16: ['/mocks/tall-1.webp', '/mocks/tall-2.webp'],
};
