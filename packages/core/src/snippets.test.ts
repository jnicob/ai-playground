import { describe, expect, it } from 'vitest';
import { buildApiTraceRequest } from './api-request';
import { generateSnippet, SNIPPET_LANGUAGES } from './snippets';
import type { EditImageRequest, GenerateVideoRequest } from './types';

const edit: EditImageRequest = {
  service: 'edit-image',
  provider: 'google',
  prompt: "make the fox's coat blue",
  model: 'gemini-3.1-flash-lite-image',
  aspectRatio: 'square_1_1',
  seed: 42,
  sourceImage: { mimeType: 'image/png', data: 'private-base64-sentinel' },
};

const video: GenerateVideoRequest = {
  service: 'generate-video',
  provider: 'google',
  prompt: 'a fox walking through snow',
  model: 'veo-3.1-lite-generate-preview',
  aspectRatio: 'widescreen_16_9',
  seed: 42,
  durationSeconds: 4,
  resolution: '720p',
};

describe('generateSnippet', () => {
  it('expone exactamente los tres lenguajes comprometidos', () => {
    expect(SNIPPET_LANGUAGES).toEqual(['curl', 'javascript', 'python']);
  });

  it.each(SNIPPET_LANGUAGES)('%s usa placeholders y nunca el base64 real', (language) => {
    const snippet = generateSnippet(
      buildApiTraceRequest(edit, 'https://api.example.test'),
      language,
    );

    expect(snippet).toContain('<BASE64_IMAGE>');
    expect(snippet).toContain('GOOGLE_API_KEY');
    expect(snippet).not.toContain('private-base64-sentinel');
    expect(snippet).not.toContain('secret-key-sentinel');
    expect(snippet).toContain('/v1/services/edit-image');
  });

  it('cURL escapa prompts con comillas simples y contempla respuesta síncrona o polling', () => {
    const snippet = generateSnippet(buildApiTraceRequest(edit, 'https://api.example.test'), 'curl');

    expect(snippet).toContain(`fox'"'"'s coat`);
    expect(snippet).toContain('IN_PROGRESS');
    expect(snippet).toContain('/v1/tasks/$TASK_ID');
  });

  it('JavaScript conserva el payload canónico y descarga vídeo con el mismo header', () => {
    const snippet = generateSnippet(
      buildApiTraceRequest(video, 'https://api.example.test'),
      'javascript',
    );

    expect(snippet).toContain('"duration_seconds": 4');
    expect(snippet).toContain('"resolution": "720p"');
    expect(snippet).toContain('while (result.status ===');
    expect(snippet).toContain('result.output.download_url');
    expect(snippet).toContain('x-provider-key');
  });

  it('Python incluye polling, timeout y descarga autenticada', () => {
    const snippet = generateSnippet(
      buildApiTraceRequest(video, 'https://api.example.test'),
      'python',
    );

    expect(snippet).toContain('requests.post(');
    expect(snippet).toContain('time.sleep(');
    expect(snippet).toContain('timeout=');
    expect(snippet).toContain('download_url');
  });

  it('omite el header de key para proveedores sin auth', () => {
    const request = buildApiTraceRequest(
      {
        service: 'generate-image',
        provider: 'pollinations',
        prompt: 'a fox',
        model: 'flux',
        aspectRatio: 'square_1_1',
        seed: 1,
      },
      'https://api.example.test',
    );

    expect(generateSnippet(request, 'javascript')).not.toContain('GOOGLE_API_KEY');
  });
});
