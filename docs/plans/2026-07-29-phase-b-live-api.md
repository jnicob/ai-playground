# Fase B — API task-based propia + proveedores live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el walking skeleton en un playground real: una API propia task-based (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) con spec OpenAPI publicada, conectores server-side a dos proveedores reales (pollinations sin key, google con key del usuario), adaptador `platform` client-side que la consume con polling y traza real, y panel de API keys pass-through.

**Architecture:** La API (Hono sobre Cloudflare Workers) es **stateless**: el `task_id` es la request canónica codificada en base64url (`v1.<payload>`), así que `GET /v1/tasks/{id}` la decodifica y ejecuta el conector en ese momento. Sin KV, sin Durable Objects, coste ≈ 0 € y todo `task_id` es determinista y reproducible (habilita share-by-URL en fase C). La key del usuario viaja por header `x-provider-key` en cada request, nunca se almacena server-side ni entra en el `task_id`. El contrato HTTP vive en `packages/core` (snake_case) y lo comparten API y web; el dominio TS sigue en camelCase.

**Tech Stack:** Hono 4 + Wrangler (Workers) · Zod 4 · React 19 + Vite 8 · Vitest 4 + Testing Library · TypeScript strict.

## Contratos externos verificados (2026-07-29)

Verificado con `curl` real contra los endpoints en vivo. **No cambiar estos detalles sin volver a verificar.**

- **Pollinations (sin key)**: `GET https://image.pollinations.ai/prompt/{prompt-url-encoded}?width=W&height=H&seed=S&model=M&nologo=true` → **200 con bytes binarios** (`content-type: image/jpeg`), `access-control-allow-origin: *`. Modelos `flux` y `turbo` verificados respondiendo 200. **Aviso**: `GET /models` de ese dominio devuelve hoy solo `["sana"]`, inconsistente con los modelos que sí acepta `/prompt` → el catálogo se declara en el registry, **no** se lee de `/models`. Como la URL es pública y con CORS `*`, el conector **valida** que responde 200 con `content-type: image/*` y devuelve esa misma URL al cliente (no proxea bytes: ahorra CPU del Worker).
- **Google Gemini (key del usuario)**: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` con header `x-goog-api-key`, body `{"contents":[{"parts":[{"text":"..."}]}],"generationConfig":{"responseModalities":["IMAGE"]}}`. Respuesta: bytes base64 en `candidates[0].content.parts[N].inlineData.data` con `inlineData.mimeType` → el conector construye un `data:` URL. Errores: `400 INVALID_ARGUMENT` con `details[].reason === 'API_KEY_INVALID'` (key inválida, verificado con curl), `403 PERMISSION_DENIED`, `429 RESOURCE_EXHAUSTED`, `5xx` transitorios; el bloqueo por seguridad **no es error HTTP**: responde 200 sin `inlineData` y con `finishReason` `SAFETY`/`IMAGE_SAFETY` o `promptFeedback.blockReason`.
- **Google NO tiene free tier de imagen** (pricing oficial: "Not available", ~$0.039/imagen). Esto **enmienda la spec**, que asumía ~500 img/día gratis. Consecuencia de diseño: el aviso de coste explícito que la spec reservaba para Veo se aplica **a todo el proveedor google** (Task 7).
- **Aspect ratio en Gemini**: el body mínimo verificado no incluye control de aspect ratio, y el campo `generationConfig.imageConfig` no está verificado para `gemini-2.5-flash-image`. Se transmite como sugerencia en el texto del prompt y las dimensiones reales quedan **desconocidas** → el contrato hace `width`/`height` opcionales y la UI no miente con atributos inventados (lección del bug de `tall-2.webp` en fase A).

## Global Constraints

- TypeScript `strict: true` en los 3 workspaces; `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test && pnpm run build` verde antes de cada commit.
- TDD estricto: test en rojo verificado → implementación mínima → verde.
- `packages/core` NO depende de React, del DOM ni de APIs de Node: solo `zod` y globales estándar (`fetch`, `btoa`/`atob`, `TextEncoder`, `AbortSignal`) disponibles en Workers, Node 22 y jsdom. `apps/web` y `apps/api` dependen de core, nunca al revés.
- **Clean-room**: cero referencias a empleadores, clientes o productos internos de terceros en código, docs o commits. Solo OSS público o código propio.
- **Secretos**: la key del usuario solo viaja en el header `x-provider-key` y vive en `sessionStorage`. Jamás en el repo, el bundle, el `task_id`, la query string, un log ni el cuerpo de una respuesta.
- Colores solo vía tokens semánticos (`bg-bg`, `bg-surface`, `text-fg`, `text-muted`, `border-border`, `bg-accent`, `text-accent-fg`, `text-danger`); nunca hex en componentes.
- i18n es/en: todo texto visible y todo `aria-label` pasa por `t()`; las claves nuevas se añaden a **ambos** idiomas (el test de paridad lo verifica).
- Contrato HTTP en `snake_case` (`task_id`, `elapsed_ms`); dominio TS en `camelCase`. No mezclar.
- Commits convencionales (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), uno por task salvo indicación distinta.
- Todo adaptador y conector DEBE honrar el `AbortSignal` que recibe (rechazar con `AbortError`): de ello dependen el timeout y el fallback.

## Estructura de archivos

```
packages/core/src/
├── api-contract.ts        # NUEVO: tipos snake_case del contrato HTTP + schemas Zod + codec de task_id
├── errors.ts              # NUEVO: PlatformError (code + fatal) e isFatalPlatformError
├── adapters/platform.ts   # NUEVO: adaptador client-side que consume la API propia con polling + traza real
├── types.ts               # MOD: width/height opcionales en el resultado image
├── registry.ts            # MOD: providers pollinations/google + schema con enums
├── factory.ts             # MOD: resuelve platform + withMockFallback para proveedores live
└── with-mock-fallback.ts  # MOD: no degrada ante errores fatales (auth, validación, bloqueo)

apps/api/src/
├── connectors/types.ts    # NUEVO: Connector, ConnectorContext
├── connectors/pollinations.ts  # NUEVO
├── connectors/google.ts        # NUEVO
├── connectors/index.ts         # NUEVO: registro provider → conector
├── openapi.ts             # NUEVO: documento OpenAPI 3.1 servido en /openapi.json
└── index.ts               # MOD: CORS + POST /v1/services/:service + GET /v1/tasks/:id + /openapi.json

apps/web/src/
├── ui/use-api-keys.ts     # NUEVO: keys por proveedor en sessionStorage
├── ui/api-key-panel.tsx   # NUEVO: panel inline (password, guardar/borrar, aviso de coste)
├── ui/provider-selector.tsx # NUEVO: selector con badge de auth
├── app.tsx                # MOD: estado de proveedor, wiring del panel, servicio por proveedor
├── ui/result-panel.tsx    # MOD: atributos width/height solo si se conocen; badge live
└── i18n/messages.ts       # MOD: claves nuevas es/en
```

---

### Task 1: Contrato de la API compartido en core (TDD)

**Files:**

- Create: `packages/core/src/api-contract.ts`, `packages/core/src/errors.ts`
- Test: `packages/core/src/api-contract.test.ts`
- Modify: `packages/core/src/types.ts`, `packages/core/src/index.ts`

**Interfaces:**

- Produces (lo usan Tasks 3–8): `encodeTaskId(request): string`, `decodeTaskId(id): GenerationRequest` (lanza `PlatformError` con code `invalid_request` si no es válido), tipos `ApiErrorCode`, `ApiErrorBody`, `TaskOutput`, `TaskResponse`, schema `taskResponseSchema`, constante `API_KEY_HEADER = 'x-provider-key'`, clase `PlatformError` y `isFatalPlatformError`.
- Modifica: `GenerationResult` variante `image` pasa a `{ kind: 'image'; url: string; width?: number; height?: number }`.

- [ ] **Step 1: Escribir el test que falla**

`packages/core/src/api-contract.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { API_KEY_HEADER, decodeTaskId, encodeTaskId, taskResponseSchema } from './api-contract';
import { PlatformError, isFatalPlatformError } from './errors';
import type { GenerationRequest } from './types';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'un zorro rojo en la nieve',
  model: 'flux',
  aspectRatio: 'widescreen_16_9',
  seed: 42,
};

describe('task id codec', () => {
  it('es determinista: misma request → mismo id', () => {
    expect(encodeTaskId(request)).toBe(encodeTaskId({ ...request }));
  });

  it('round-trip: decode(encode(r)) === r', () => {
    expect(decodeTaskId(encodeTaskId(request))).toEqual(request);
  });

  it('sobrevive a prompts con acentos y emoji', () => {
    const unicode = { ...request, prompt: 'ñandú 🦊 en la nieve' };
    expect(decodeTaskId(encodeTaskId(unicode))).toEqual(unicode);
  });

  it('genera un id url-safe con prefijo de versión', () => {
    const id = encodeTaskId(request);
    expect(id.startsWith('v1.')).toBe(true);
    expect(id).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(id)).toBe(id);
  });

  it('nunca contiene la api key (no forma parte de la request)', () => {
    expect(decodeTaskId(encodeTaskId(request))).not.toHaveProperty('apiKey');
  });

  it.each([
    ['prefijo desconocido', 'v9.abc'],
    ['sin prefijo', 'abc'],
    ['payload no base64url', 'v1.$$$'],
    ['payload que no es una request válida', `v1.${btoa('{"nope":1}')}`],
  ])('rechaza %s con PlatformError fatal invalid_request', (_name, id) => {
    let thrown: unknown;
    try {
      decodeTaskId(id);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PlatformError);
    expect((thrown as PlatformError).code).toBe('invalid_request');
    expect(isFatalPlatformError(thrown)).toBe(true);
  });
});

describe('taskResponseSchema', () => {
  it('acepta COMPLETED con output', () => {
    const parsed = taskResponseSchema.parse({
      task_id: 'v1.abc',
      status: 'COMPLETED',
      provider: 'pollinations',
      elapsed_ms: 1200,
      output: { kind: 'image', url: 'https://example.test/a.jpg' },
    });
    expect(parsed.status).toBe('COMPLETED');
  });

  it('acepta IN_PROGRESS y FAILED', () => {
    expect(taskResponseSchema.parse({ task_id: 'v1.a', status: 'IN_PROGRESS' }).status).toBe(
      'IN_PROGRESS',
    );
    expect(
      taskResponseSchema.parse({
        task_id: 'v1.a',
        status: 'FAILED',
        error: { code: 'provider_error', message: 'boom' },
      }).status,
    ).toBe('FAILED');
  });

  it('rechaza COMPLETED sin output y estados desconocidos', () => {
    expect(
      taskResponseSchema.safeParse({
        task_id: 'v1.a',
        status: 'COMPLETED',
        provider: 'mock',
        elapsed_ms: 1,
      }).success,
    ).toBe(false);
    expect(taskResponseSchema.safeParse({ task_id: 'v1.a', status: 'PENDING' }).success).toBe(
      false,
    );
  });
});

describe('errores de plataforma', () => {
  it('marca fatales los errores de cliente y no fatales los transitorios', () => {
    expect(isFatalPlatformError(new PlatformError('invalid_api_key', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('missing_api_key', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('content_blocked', 'x'))).toBe(true);
    expect(isFatalPlatformError(new PlatformError('rate_limited', 'x'))).toBe(false);
    expect(isFatalPlatformError(new PlatformError('provider_error', 'x'))).toBe(false);
    expect(isFatalPlatformError(new Error('cualquier otra cosa'))).toBe(false);
  });

  it('expone el nombre del header de key', () => {
    expect(API_KEY_HEADER).toBe('x-provider-key');
  });
});
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pnpm --filter @ai-playground/core run test -- api-contract`
Expected: FAIL — `Cannot find module './api-contract'`.

- [ ] **Step 3: Implementar errores**

`packages/core/src/errors.ts`:

```ts
export const API_ERROR_CODES = [
  'invalid_request',
  'missing_api_key',
  'invalid_api_key',
  'content_blocked',
  'unsupported_provider',
  'rate_limited',
  'provider_error',
  'task_not_found',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Códigos que NO deben degradar a mock: son culpa del cliente y hay que mostrárselos. */
const FATAL_CODES: readonly ApiErrorCode[] = [
  'invalid_request',
  'missing_api_key',
  'invalid_api_key',
  'content_blocked',
  'unsupported_provider',
];

export class PlatformError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
  }
}

export function isFatalPlatformError(error: unknown): boolean {
  return error instanceof PlatformError && FATAL_CODES.includes(error.code);
}
```

- [ ] **Step 4: Implementar el contrato**

`packages/core/src/api-contract.ts`:

```ts
import { z } from 'zod';
import { PlatformError } from './errors';
import { generationRequestSchema } from './registry';
import type { GenerationRequest } from './types';

/** Header por el que viaja la key del usuario en pass-through. Nunca se almacena server-side. */
export const API_KEY_HEADER = 'x-provider-key';

const TASK_ID_PREFIX = 'v1.';

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): string {
  const binary = atob(input.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/** Serialización canónica: orden de claves fijo → el mismo request produce siempre el mismo id. */
function canonical(request: GenerationRequest): string {
  return JSON.stringify({
    service: request.service,
    provider: request.provider,
    prompt: request.prompt,
    model: request.model,
    aspectRatio: request.aspectRatio,
    seed: request.seed,
  });
}

export function encodeTaskId(request: GenerationRequest): string {
  return `${TASK_ID_PREFIX}${toBase64Url(canonical(request))}`;
}

export function decodeTaskId(taskId: string): GenerationRequest {
  if (!taskId.startsWith(TASK_ID_PREFIX)) {
    throw new PlatformError('invalid_request', 'Unsupported task id version');
  }
  const payload = taskId.slice(TASK_ID_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch {
    throw new PlatformError('invalid_request', 'Malformed task id');
  }
  const result = generationRequestSchema.safeParse(parsed);
  if (!result.success) throw new PlatformError('invalid_request', 'Malformed task id');
  return result.data;
}

export const taskOutputSchema = z.object({
  kind: z.literal('image'),
  url: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export type TaskOutput = z.infer<typeof taskOutputSchema>;

const apiErrorSchema = z.object({
  code: z.enum([
    'invalid_request',
    'missing_api_key',
    'invalid_api_key',
    'content_blocked',
    'unsupported_provider',
    'rate_limited',
    'provider_error',
    'task_not_found',
  ]),
  message: z.string(),
});

export const taskResponseSchema = z.discriminatedUnion('status', [
  z.object({ task_id: z.string(), status: z.literal('IN_PROGRESS') }),
  z.object({
    task_id: z.string(),
    status: z.literal('COMPLETED'),
    provider: z.string(),
    elapsed_ms: z.number(),
    output: taskOutputSchema,
  }),
  z.object({ task_id: z.string(), status: z.literal('FAILED'), error: apiErrorSchema }),
]);

export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type ApiErrorBody = { error: z.infer<typeof apiErrorSchema> };
```

- [ ] **Step 5: Hacer opcionales las dimensiones del resultado image**

En `packages/core/src/types.ts`, sustituir la variante `image` de `GenerationResult`:

```ts
    | { kind: 'image'; url: string; width?: number; height?: number }
```

(las otras variantes y `GenerationMeta` no cambian; el adaptador mock sigue rellenando ambas).

Añadir a `packages/core/src/index.ts`:

```ts
export * from './api-contract';
export * from './errors';
```

- [ ] **Step 6: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/core run test -- api-contract` → Expected: PASS (14 tests).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test` → verde.

```bash
git add -A && git commit -m "feat(core): contrato de la API task-based, codec de task_id y errores de plataforma"
```

---

### Task 2: Registry con proveedores live (TDD)

**Files:**

- Modify: `packages/core/src/registry.ts`
- Test: `packages/core/src/registry.test.ts`

**Interfaces:**

- Consumes: `PlaygroundMode`, `ProviderId` de `types.ts`.
- Produces: `PROVIDERS` con `mock` (2 modelos), `pollinations` (`flux`, `turbo`) y `google` (`gemini-2.5-flash-image`, `gemini-3.1-flash-image`), cada uno con `auth` y `costWarning: boolean`; `generationRequestSchema` con `provider: z.enum([...])` y `service: z.enum([...])` derivados del registry; `modelsFor(provider, service): readonly string[]`; `providerById(id): ProviderDefinition`.

- [ ] **Step 1: Añadir los tests que fallan**

Añadir al final de `packages/core/src/registry.test.ts` (dejando intactos los tests existentes) y actualizar el import de la primera línea a `import { generationRequestSchema, PROVIDERS, SERVICES, modelsFor, providerById } from './registry';`:

```ts
describe('registry live', () => {
  it('declara los tres proveedores con su auth', () => {
    expect(PROVIDERS.map((p) => [p.id, p.auth])).toEqual([
      ['mock', 'none'],
      ['pollinations', 'none'],
      ['google', 'api-key'],
    ]);
  });

  it('solo google avisa de coste', () => {
    expect(PROVIDERS.filter((p) => p.costWarning).map((p) => p.id)).toEqual(['google']);
  });

  it('todo proveedor declara al menos un modelo de generate-image', () => {
    for (const p of PROVIDERS) expect(modelsFor(p.id, 'generate-image').length).toBeGreaterThan(0);
  });

  it('acepta requests de proveedores live', () => {
    const base = {
      service: 'generate-image',
      prompt: 'a red fox',
      aspectRatio: 'square_1_1',
      seed: 7,
    };
    expect(
      generationRequestSchema.safeParse({ ...base, provider: 'pollinations', model: 'flux' })
        .success,
    ).toBe(true);
    expect(
      generationRequestSchema.safeParse({
        ...base,
        provider: 'google',
        model: 'gemini-2.5-flash-image',
      }).success,
    ).toBe(true);
  });

  it('providerById lanza para un proveedor desconocido', () => {
    expect(() => providerById('nope' as never)).toThrow(/unknown provider/i);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/core run test -- registry`
Expected: FAIL — `modelsFor is not a function` / solo hay un proveedor.

- [ ] **Step 3: Implementar el registry**

Sustituir el contenido de `packages/core/src/registry.ts`:

```ts
import { z } from 'zod';
import type { PlaygroundMode, ProviderId } from './types';

export type ServiceDefinition = { id: PlaygroundMode; labelKey: string };

export type ProviderDefinition = {
  id: ProviderId;
  auth: 'none' | 'api-key';
  /** true → la UI exige confirmación explícita de coste antes de generar. */
  costWarning: boolean;
  models: Partial<Record<PlaygroundMode, readonly string[]>>;
};

export const SERVICES: readonly ServiceDefinition[] = [
  { id: 'generate-image', labelKey: 'service.generate-image' },
];

/**
 * Catálogos verificados el 2026-07-29 contra los endpoints en vivo.
 * pollinations: /models del dominio legacy es inconsistente (devuelve solo "sana"),
 * pero /prompt acepta flux y turbo — por eso el catálogo se declara aquí, no se descubre.
 */
export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'mock',
    auth: 'none',
    costWarning: false,
    models: { 'generate-image': ['flux', 'turbo'] },
  },
  {
    id: 'pollinations',
    auth: 'none',
    costWarning: false,
    models: { 'generate-image': ['flux', 'turbo'] },
  },
  {
    id: 'google',
    auth: 'api-key',
    costWarning: true,
    models: { 'generate-image': ['gemini-2.5-flash-image', 'gemini-3.1-flash-image'] },
  },
];

export function providerById(id: ProviderId): ProviderDefinition {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown provider "${id}"`);
  return provider;
}

export function modelsFor(provider: ProviderId, service: PlaygroundMode): readonly string[] {
  return providerById(provider).models[service] ?? [];
}

export const generationRequestSchema = z.object({
  service: z.enum(['generate-image']),
  provider: z.enum(['mock', 'pollinations', 'google']),
  prompt: z.string().trim().min(1).max(1000),
  model: z.string().min(1),
  aspectRatio: z.enum(['square_1_1', 'widescreen_16_9', 'vertical_9_16']),
  seed: z.number().int().min(0).max(999_999),
});
```

- [ ] **Step 4: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/core run test` → Expected: PASS (los tests previos del registry siguen verdes: el fixture `provider: 'unknown'` sigue siendo rechazado por el enum).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test` → verde.

```bash
git add -A && git commit -m "feat(core): registry con proveedores pollinations y google"
```

---

### Task 3: Conector server-side de pollinations (TDD)

**Files:**

- Create: `apps/api/src/connectors/types.ts`, `apps/api/src/connectors/pollinations.ts`
- Test: `apps/api/src/connectors/pollinations.test.ts`

**Interfaces:**

- Consumes: `GenerationRequest`, `ASPECT_RATIOS`, `PlatformError` de `@ai-playground/core`.
- Produces: tipo `Connector = (request: GenerationRequest, ctx: ConnectorContext) => Promise<TaskOutput>` y `ConnectorContext = { fetchImpl: typeof fetch; apiKey?: string; signal?: AbortSignal }`; función `pollinationsConnector`.

**Prerequisito:** `apps/api` debe poder importar core. Añadir la dependencia si no existe:

```bash
pnpm --filter @ai-playground/api add @ai-playground/core@workspace:*
```

- [ ] **Step 1: Escribir el test que falla**

`apps/api/src/connectors/pollinations.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '@ai-playground/core';
import { PlatformError } from '@ai-playground/core';
import { pollinationsConnector } from './pollinations';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'un ñandú en la nieve',
  model: 'flux',
  aspectRatio: 'widescreen_16_9',
  seed: 42,
};

const okResponse = () =>
  new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });

describe('conector pollinations', () => {
  it('construye la URL verificada con prompt codificado y parámetros', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    await pollinationsConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch });

    const called = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(called.origin).toBe('https://image.pollinations.ai');
    expect(called.pathname).toBe(`/prompt/${encodeURIComponent(request.prompt)}`);
    expect(called.searchParams.get('width')).toBe('1280');
    expect(called.searchParams.get('height')).toBe('720');
    expect(called.searchParams.get('seed')).toBe('42');
    expect(called.searchParams.get('model')).toBe('flux');
    expect(called.searchParams.get('nologo')).toBe('true');
  });

  it('devuelve la URL pública como output con las dimensiones pedidas', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const output = await pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(output).toEqual({
      kind: 'image',
      url: expect.stringContaining('image.pollinations.ai/prompt/'),
      width: 1280,
      height: 720,
    });
  });

  it('propaga el AbortSignal al fetch', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      return okResponse();
    });
    await pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      signal: controller.signal,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [429, 'rate_limited'],
    [500, 'provider_error'],
    [404, 'provider_error'],
  ])('mapea el status %i a %s', async (status, code) => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status }));
    await expect(
      pollinationsConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code });
  });

  it('rechaza una respuesta 200 que no sea una imagen', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>error</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const promise = pollinationsConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(promise).rejects.toBeInstanceOf(PlatformError);
    await expect(promise).rejects.toMatchObject({ code: 'provider_error' });
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/api run test -- pollinations`
Expected: FAIL — `Cannot find module './pollinations'`.

- [ ] **Step 3: Implementar tipos y conector**

`apps/api/src/connectors/types.ts`:

```ts
import type { GenerationRequest, TaskOutput } from '@ai-playground/core';

export type ConnectorContext = {
  fetchImpl: typeof fetch;
  apiKey?: string;
  signal?: AbortSignal;
};

export type Connector = (request: GenerationRequest, ctx: ConnectorContext) => Promise<TaskOutput>;
```

`apps/api/src/connectors/pollinations.ts`:

```ts
import { ASPECT_RATIOS, PlatformError, type TaskOutput } from '@ai-playground/core';
import type { Connector } from './types';

const BASE_URL = 'https://image.pollinations.ai/prompt';

/**
 * Verificado 2026-07-29: GET con el prompt en el path devuelve los bytes de la imagen
 * (content-type image/*) y sirve la URL con CORS *. El Worker solo valida la respuesta y
 * devuelve la URL pública: no proxea bytes, así el CPU del Worker se mantiene mínimo.
 */
export const pollinationsConnector: Connector = async (request, ctx) => {
  const { width, height } = ASPECT_RATIOS[request.aspectRatio];
  const url = new URL(`${BASE_URL}/${encodeURIComponent(request.prompt)}`);
  url.searchParams.set('width', String(width));
  url.searchParams.set('height', String(height));
  url.searchParams.set('seed', String(request.seed));
  url.searchParams.set('model', request.model);
  url.searchParams.set('nologo', 'true');

  const response = await ctx.fetchImpl(url.toString(), {
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  if (!response.ok) {
    throw new PlatformError(
      response.status === 429 ? 'rate_limited' : 'provider_error',
      `Pollinations responded with ${response.status}`,
    );
  }
  if (!response.headers.get('content-type')?.startsWith('image/')) {
    throw new PlatformError('provider_error', 'Pollinations did not return an image');
  }

  const output: TaskOutput = { kind: 'image', url: url.toString(), width, height };
  return output;
};
```

- [ ] **Step 4: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/api run test -- pollinations` → Expected: PASS (7 tests).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test` → verde.

```bash
git add -A && git commit -m "feat(api): conector server-side de pollinations con mapeo de errores"
```

---

### Task 4: Conector server-side de google (TDD)

**Files:**

- Create: `apps/api/src/connectors/google.ts`, `apps/api/src/connectors/index.ts`
- Test: `apps/api/src/connectors/google.test.ts`

**Interfaces:**

- Consumes: `Connector`, `ConnectorContext` de Task 3.
- Produces: `googleConnector`; `CONNECTORS: Partial<Record<ProviderId, Connector>>` y `connectorFor(provider): Connector` (lanza `PlatformError('unsupported_provider')`).

- [ ] **Step 1: Escribir el test que falla**

`apps/api/src/connectors/google.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { GenerationRequest } from '@ai-playground/core';
import { googleConnector } from './google';
import { connectorFor } from './index';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'google',
  prompt: 'a red fox',
  model: 'gemini-2.5-flash-image',
  aspectRatio: 'square_1_1',
  seed: 7,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const imageBody = {
  candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }],
};

describe('conector google', () => {
  it('llama al endpoint verificado con el modelo y la key en header', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'secret-key',
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    const body = JSON.parse(String(init.body));
    expect(body.contents[0].parts[0].text).toContain('a red fox');
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
  });

  it('no manda la key en la URL', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'secret-key',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('secret-key');
  });

  it('convierte inlineData en un data URL', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    const output = await googleConnector(request, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKey: 'k',
    });
    expect(output).toEqual({ kind: 'image', url: 'data:image/png;base64,QUJD' });
  });

  it('exige api key', async () => {
    const fetchImpl = vi.fn(async () => json(imageBody));
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'missing_api_key' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mapea key inválida a invalid_api_key', async () => {
    const fetchImpl = vi.fn(async () =>
      json(
        {
          error: {
            code: 400,
            message: 'API key not valid. Please pass a valid API key.',
            status: 'INVALID_ARGUMENT',
            details: [{ reason: 'API_KEY_INVALID' }],
          },
        },
        400,
      ),
    );
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'bad' }),
    ).rejects.toMatchObject({ code: 'invalid_api_key' });
  });

  it.each([
    [403, {}, 'invalid_api_key'],
    [429, {}, 'rate_limited'],
    [400, { error: { message: 'bad body', status: 'INVALID_ARGUMENT' } }, 'invalid_request'],
    [503, {}, 'provider_error'],
  ])('mapea %i a %s', async (status, body, code) => {
    const fetchImpl = vi.fn(async () => json(body, status));
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'k' }),
    ).rejects.toMatchObject({ code });
  });

  it('detecta bloqueo de seguridad (200 sin imagen) como content_blocked', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ candidates: [{ content: { parts: [] }, finishReason: 'IMAGE_SAFETY' }] }),
    );
    await expect(
      googleConnector(request, { fetchImpl: fetchImpl as unknown as typeof fetch, apiKey: 'k' }),
    ).rejects.toMatchObject({ code: 'content_blocked' });
  });
});

describe('registro de conectores', () => {
  it('resuelve los proveedores live', () => {
    expect(typeof connectorFor('pollinations')).toBe('function');
    expect(typeof connectorFor('google')).toBe('function');
  });

  it('rechaza mock (es client-side) y desconocidos', () => {
    expect(() => connectorFor('mock')).toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/api run test -- google`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Implementar el conector**

`apps/api/src/connectors/google.ts`:

```ts
import { PlatformError, type TaskOutput } from '@ai-playground/core';
import type { Connector } from './types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const ASPECT_HINT: Record<string, string> = {
  square_1_1: 'square 1:1 framing',
  widescreen_16_9: 'widescreen 16:9 framing',
  vertical_9_16: 'vertical 9:16 framing',
};

type GooglePart = { inlineData?: { mimeType?: string; data?: string } };

/**
 * Verificado 2026-07-29: :generateContent sigue vivo para los modelos de imagen y la auth va
 * por header x-goog-api-key. El control de aspect ratio por campo NO está verificado para
 * estos modelos, así que se transmite como sugerencia en el prompt y las dimensiones reales
 * quedan desconocidas (el contrato las hace opcionales en vez de declarar valores falsos).
 */
export const googleConnector: Connector = async (request, ctx) => {
  if (!ctx.apiKey) throw new PlatformError('missing_api_key', 'Google requires an API key');

  const response = await ctx.fetchImpl(`${BASE_URL}/${request.model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': ctx.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${request.prompt} — ${ASPECT_HINT[request.aspectRatio]}` }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; details?: { reason?: string }[] };
    candidates?: { content?: { parts?: GooglePart[] } }[];
  };

  if (!response.ok) throw mapGoogleError(response.status, payload);

  const inline = payload.candidates?.[0]?.content?.parts?.find(
    (part) => part.inlineData?.data,
  )?.inlineData;
  if (!inline?.data) {
    throw new PlatformError('content_blocked', 'Google returned no image for this prompt');
  }

  const output: TaskOutput = {
    kind: 'image',
    url: `data:${inline.mimeType ?? 'image/png'};base64,${inline.data}`,
  };
  return output;
};

function mapGoogleError(
  status: number,
  payload: { error?: { message?: string; details?: { reason?: string }[] } },
): PlatformError {
  const message = payload.error?.message ?? `Google responded with ${status}`;
  if (status === 429) return new PlatformError('rate_limited', message);
  if (status === 403) return new PlatformError('invalid_api_key', message);
  if (status === 400) {
    const invalidKey = payload.error?.details?.some((d) => d.reason === 'API_KEY_INVALID');
    return new PlatformError(invalidKey ? 'invalid_api_key' : 'invalid_request', message);
  }
  return new PlatformError('provider_error', message);
}
```

`apps/api/src/connectors/index.ts`:

```ts
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
    throw new PlatformError('unsupported_provider', `Provider "${provider}" is not available`);
  }
  return connector;
}

export type { Connector, ConnectorContext } from './types';
```

- [ ] **Step 4: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/api run test` → Expected: PASS.
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test && pnpm run build` → verde.

```bash
git add -A && git commit -m "feat(api): conector server-side de google con key pass-through"
```

---

### Task 5: Endpoints task-based, CORS y OpenAPI (TDD)

**Files:**

- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/openapi.ts`
- Test: `apps/api/src/index.test.ts` (ampliar)

**Interfaces:**

- Consumes: `connectorFor` (Task 4), `decodeTaskId`/`encodeTaskId`/`generationRequestSchema`/`API_KEY_HEADER` (Tasks 1–2).
- Produces: `POST /v1/services/:service` → `202 { task_id, status: 'IN_PROGRESS' }`; `GET /v1/tasks/:taskId` → `200 { task_id, status: 'COMPLETED'|'FAILED', … }`; `GET /openapi.json`; CORS con `x-provider-key` permitido.

- [ ] **Step 1: Añadir los tests que fallan**

Sustituir el contenido de `apps/api/src/index.test.ts` (conservando los dos tests de `/health`):

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { API_KEY_HEADER, decodeTaskId, encodeTaskId } from '@ai-playground/core';
import { app } from './index';

const request = {
  service: 'generate-image' as const,
  provider: 'pollinations' as const,
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1' as const,
  seed: 3,
};

const body = (over: Record<string, unknown> = {}) => ({
  provider: request.provider,
  prompt: request.prompt,
  model: request.model,
  aspect_ratio: request.aspectRatio,
  seed: request.seed,
  ...over,
});

const post = (payload: unknown, headers: Record<string, string> = {}) =>
  app.request('/v1/services/generate-image', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });

afterEach(() => vi.unstubAllGlobals());

describe('api', () => {
  it('GET /health responde ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', service: 'ai-playground-api' });
  });

  it('ruta desconocida → 404', async () => {
    expect((await app.request('/nope')).status).toBe(404);
  });
});

describe('POST /v1/services/:service', () => {
  it('devuelve 202 con un task_id que decodifica a la request', async () => {
    const res = await post(body());
    expect(res.status).toBe(202);
    const json = (await res.json()) as { task_id: string; status: string };
    expect(json.status).toBe('IN_PROGRESS');
    expect(decodeTaskId(json.task_id)).toEqual(request);
  });

  it('es determinista: la misma request produce el mismo task_id', async () => {
    const first = (await (await post(body())).json()) as { task_id: string };
    const second = (await (await post(body())).json()) as { task_id: string };
    expect(first.task_id).toBe(second.task_id);
  });

  it('rechaza un body inválido con 400 invalid_request', async () => {
    const res = await post(body({ prompt: '   ' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('rechaza un servicio desconocido con 400', async () => {
    const res = await app.request('/v1/services/make-coffee', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body()),
    });
    expect(res.status).toBe(400);
  });

  it('exige la key con 428 cuando el proveedor la requiere', async () => {
    const res = await post(body({ provider: 'google', model: 'gemini-2.5-flash-image' }));
    expect(res.status).toBe(428);
    expect(await res.json()).toMatchObject({ error: { code: 'missing_api_key' } });
  });

  it('acepta el proveedor con key cuando viene el header', async () => {
    const res = await post(body({ provider: 'google', model: 'gemini-2.5-flash-image' }), {
      [API_KEY_HEADER]: 'k',
    });
    expect(res.status).toBe(202);
  });
});

describe('GET /v1/tasks/:taskId', () => {
  it('ejecuta el conector y devuelve COMPLETED con output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Uint8Array([1]), {
            status: 200,
            headers: { 'content-type': 'image/jpeg' },
          }),
      ),
    );
    const res = await app.request(`/v1/tasks/${encodeTaskId(request)}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toMatchObject({
      status: 'COMPLETED',
      provider: 'pollinations',
      output: { kind: 'image' },
    });
    expect(typeof json.elapsed_ms).toBe('number');
  });

  it('devuelve FAILED con el código mapeado cuando el proveedor falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 })),
    );
    const res = await app.request(`/v1/tasks/${encodeTaskId(request)}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: 'FAILED',
      error: { code: 'provider_error' },
    });
  });

  it('rechaza un task id corrupto con 400', async () => {
    const res = await app.request('/v1/tasks/v9.zzz');
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'invalid_request' } });
  });

  it('pasa la key del header al conector y nunca la devuelve en la respuesta', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              { content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });
    const res = await app.request(`/v1/tasks/${googleId}`, {
      headers: { [API_KEY_HEADER]: 'secret-key' },
    });
    const raw = await res.text();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret-key');
    expect(raw).not.toContain('secret-key');
  });

  it('devuelve 428 si falta la key del proveedor que la requiere', async () => {
    const googleId = encodeTaskId({
      ...request,
      provider: 'google',
      model: 'gemini-2.5-flash-image',
    });
    const res = await app.request(`/v1/tasks/${googleId}`);
    expect(res.status).toBe(428);
  });
});

describe('CORS y OpenAPI', () => {
  it('responde al preflight permitiendo el header de key', async () => {
    const res = await app.request('/v1/services/generate-image', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': API_KEY_HEADER,
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      API_KEY_HEADER,
    );
  });

  it('publica la spec OpenAPI con las dos rutas', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi.startsWith('3.')).toBe(true);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/v1/services/{service}', '/v1/tasks/{task_id}']),
    );
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/api run test`
Expected: FAIL — las rutas `/v1/...` responden 404.

- [ ] **Step 3: Implementar la spec OpenAPI**

`apps/api/src/openapi.ts`:

```ts
import { API_KEY_HEADER, SERVICES } from '@ai-playground/core';

const taskOutput = {
  type: 'object',
  required: ['kind', 'url'],
  properties: {
    kind: { type: 'string', enum: ['image'] },
    url: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
  },
} as const;

const errorBody = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;

const keyHeader = {
  name: API_KEY_HEADER,
  in: 'header',
  required: false,
  schema: { type: 'string' },
  description: 'Provider API key, passed through per request. Never stored server-side.',
} as const;

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'ai-playground API',
    version: '1.0.0',
    description:
      'Task-based generation API. Create a task, then poll it. Stateless: the task id encodes the request.',
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        responses: { '200': { description: 'Service is up' } },
      },
    },
    '/v1/services/{service}': {
      post: {
        summary: 'Create a generation task',
        parameters: [
          {
            name: 'service',
            in: 'path',
            required: true,
            schema: { type: 'string', enum: SERVICES.map((s) => s.id) },
          },
          keyHeader,
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['provider', 'prompt', 'model', 'aspect_ratio', 'seed'],
                properties: {
                  provider: { type: 'string', enum: ['mock', 'pollinations', 'google'] },
                  prompt: { type: 'string', minLength: 1, maxLength: 1000 },
                  model: { type: 'string' },
                  aspect_ratio: {
                    type: 'string',
                    enum: ['square_1_1', 'widescreen_16_9', 'vertical_9_16'],
                  },
                  seed: { type: 'integer', minimum: 0, maximum: 999999 },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Task accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['task_id', 'status'],
                  properties: {
                    task_id: { type: 'string' },
                    status: { type: 'string', enum: ['IN_PROGRESS'] },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request',
            content: { 'application/json': { schema: errorBody } },
          },
          '428': {
            description: 'Provider API key required',
            content: { 'application/json': { schema: errorBody } },
          },
        },
      },
    },
    '/v1/tasks/{task_id}': {
      get: {
        summary: 'Get task status and result',
        parameters: [
          { name: 'task_id', in: 'path', required: true, schema: { type: 'string' } },
          keyHeader,
        ],
        responses: {
          '200': {
            description: 'Task state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['task_id', 'status'],
                  properties: {
                    task_id: { type: 'string' },
                    status: { type: 'string', enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'] },
                    provider: { type: 'string' },
                    elapsed_ms: { type: 'integer' },
                    output: taskOutput,
                    error: errorBody.properties.error,
                  },
                },
              },
            },
          },
          '400': {
            description: 'Malformed task id',
            content: { 'application/json': { schema: errorBody } },
          },
          '428': {
            description: 'Provider API key required',
            content: { 'application/json': { schema: errorBody } },
          },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 4: Implementar las rutas**

Sustituir el contenido de `apps/api/src/index.ts`:

```ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  API_KEY_HEADER,
  PlatformError,
  decodeTaskId,
  encodeTaskId,
  generationRequestSchema,
  providerById,
  type ApiErrorCode,
  type GenerationRequest,
} from '@ai-playground/core';
import { connectorFor } from './connectors';
import { openApiDocument } from './openapi';

export const app = new Hono();

app.use('/v1/*', cors({ origin: '*', allowHeaders: ['content-type', API_KEY_HEADER] }));

app.get('/health', (c) => c.json({ status: 'ok', service: 'ai-playground-api' }));
app.get('/openapi.json', (c) => c.json(openApiDocument));

const STATUS_BY_CODE: Partial<Record<ApiErrorCode, 400 | 401 | 428>> = {
  invalid_request: 400,
  unsupported_provider: 400,
  missing_api_key: 428,
  invalid_api_key: 401,
};

function errorResponse(error: PlatformError) {
  return {
    body: { error: { code: error.code, message: error.message } },
    status: STATUS_BY_CODE[error.code] ?? 400,
  } as const;
}

/** El proveedor exige key y no vino en el header → 428, antes de tocar al proveedor. */
function assertKeyIfRequired(request: GenerationRequest, apiKey: string | undefined): void {
  if (providerById(request.provider).auth === 'api-key' && !apiKey) {
    throw new PlatformError(
      'missing_api_key',
      `Provider "${request.provider}" requires an API key`,
    );
  }
}

app.post('/v1/services/:service', async (c) => {
  let request: GenerationRequest;
  try {
    const raw = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const parsed = generationRequestSchema.safeParse({
      service: c.req.param('service'),
      provider: raw.provider,
      prompt: raw.prompt,
      model: raw.model,
      aspectRatio: raw.aspect_ratio,
      seed: raw.seed,
    });
    if (!parsed.success) throw new PlatformError('invalid_request', 'Invalid generation request');
    request = parsed.data;
    assertKeyIfRequired(request, c.req.header(API_KEY_HEADER));
  } catch (error) {
    const platform =
      error instanceof PlatformError
        ? error
        : new PlatformError('invalid_request', 'Invalid request');
    const { body, status } = errorResponse(platform);
    return c.json(body, status);
  }

  return c.json({ task_id: encodeTaskId(request), status: 'IN_PROGRESS' }, 202);
});

app.get('/v1/tasks/:taskId', async (c) => {
  const taskId = c.req.param('taskId');
  const apiKey = c.req.header(API_KEY_HEADER);

  let request: GenerationRequest;
  try {
    request = decodeTaskId(taskId);
    assertKeyIfRequired(request, apiKey);
  } catch (error) {
    const platform =
      error instanceof PlatformError
        ? error
        : new PlatformError('invalid_request', 'Malformed task id');
    const { body, status } = errorResponse(platform);
    return c.json(body, status);
  }

  const started = Date.now();
  try {
    const connector = connectorFor(request.provider);
    const output = await connector(request, {
      fetchImpl: fetch,
      ...(apiKey ? { apiKey } : {}),
    });
    return c.json({
      task_id: taskId,
      status: 'COMPLETED',
      provider: request.provider,
      elapsed_ms: Date.now() - started,
      output,
    });
  } catch (error) {
    if (error instanceof PlatformError && STATUS_BY_CODE[error.code]) {
      const { body, status } = errorResponse(error);
      return c.json(body, status);
    }
    const code: ApiErrorCode = error instanceof PlatformError ? error.code : 'provider_error';
    const message = error instanceof Error ? error.message : 'Generation failed';
    return c.json({ task_id: taskId, status: 'FAILED', error: { code, message } });
  }
});

export default app;
```

- [ ] **Step 5: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/api run test` → Expected: PASS (todos).
Run: `pnpm --filter @ai-playground/api run build` → Expected: dry-run de wrangler OK.
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test && pnpm run build` → verde.

```bash
git add -A && git commit -m "feat(api): endpoints task-based, CORS y spec OpenAPI publicada"
```

---

### Task 6: Adaptador `platform` en core (TDD)

**Files:**

- Create: `packages/core/src/adapters/platform.ts`
- Test: `packages/core/src/adapters/platform.test.ts`
- Modify: `packages/core/src/factory.ts`, `packages/core/src/with-mock-fallback.ts`, `packages/core/src/index.ts`
- Test (modify): `packages/core/src/factory.test.ts`

**Interfaces:**

- Consumes: contrato de Task 1, endpoints de Task 5.
- Produces: `createPlatformAdapter(options: PlatformAdapterOptions): GenerationService` con
  `PlatformAdapterOptions = { apiBaseUrl: string; getApiKey?: () => string | undefined; fetchImpl?: typeof fetch; pollIntervalMs?: number; maxPollMs?: number }`;
  `createGenerationService(provider, options?: { apiBaseUrl?: string; getApiKey?: () => string | undefined })`.

- [ ] **Step 1: Escribir el test que falla**

`packages/core/src/adapters/platform.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPlatformAdapter } from './platform';
import { encodeTaskId } from '../api-contract';
import { PlatformError } from '../errors';
import type { GenerationRequest } from '../types';

const request: GenerationRequest = {
  service: 'generate-image',
  provider: 'pollinations',
  prompt: 'a red fox',
  model: 'flux',
  aspectRatio: 'square_1_1',
  seed: 5,
};

const taskId = encodeTaskId(request);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const completed = {
  task_id: taskId,
  status: 'COMPLETED',
  provider: 'pollinations',
  elapsed_ms: 800,
  output: { kind: 'image', url: 'https://example.test/fox.jpg', width: 1024, height: 1024 },
};

const adapter = (fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) =>
  createPlatformAdapter({
    apiBaseUrl: 'https://api.test',
    fetchImpl,
    pollIntervalMs: 0,
    ...extra,
  });

describe('adaptador platform', () => {
  it('hace POST al servicio y luego GET a la tarea', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(String(calls[0]?.[0])).toBe('https://api.test/v1/services/generate-image');
    expect((calls[0]?.[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((calls[0]?.[1] as RequestInit).body))).toEqual({
      provider: 'pollinations',
      prompt: 'a red fox',
      model: 'flux',
      aspect_ratio: 'square_1_1',
      seed: 5,
    });
    expect(String(calls[1]?.[0])).toBe(`https://api.test/v1/tasks/${taskId}`);
    expect(result).toMatchObject({
      kind: 'image',
      url: 'https://example.test/fox.jpg',
      degraded: false,
    });
  });

  it('emite la traza real del ciclo task-based', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    expect(result.apiTrace.map((step) => step.kind)).toEqual([
      'request',
      'status',
      'poll',
      'completed',
    ]);
    const poll = result.apiTrace.find((step) => step.kind === 'poll');
    expect(poll && 'url' in poll ? poll.url : '').toContain(`/v1/tasks/${taskId}`);
  });

  it('sigue haciendo polling mientras la tarea está IN_PROGRESS', async () => {
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes('/v1/services/'))
        return json({ task_id: taskId, status: 'IN_PROGRESS' }, 202);
      polls += 1;
      return polls < 3 ? json({ task_id: taskId, status: 'IN_PROGRESS' }) : json(completed);
    }) as unknown as typeof fetch;

    const result = await adapter(fetchImpl).generate(request);

    expect(polls).toBe(3);
    expect(result.apiTrace.filter((step) => step.kind === 'poll')).toHaveLength(3);
  });

  it('manda la key en el header y nunca en la URL', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json(completed),
    ) as unknown as typeof fetch;

    await adapter(fetchImpl, { getApiKey: () => 'secret-key' }).generate(request);

    for (const call of (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls) {
      expect(String(call[0])).not.toContain('secret-key');
      expect((call[1] as RequestInit).headers).toMatchObject({ 'x-provider-key': 'secret-key' });
    }
  });

  it('convierte un error 4xx de la API en PlatformError con su código', async () => {
    const fetchImpl = vi.fn(async () =>
      json({ error: { code: 'invalid_api_key', message: 'bad key' } }, 401),
    ) as unknown as typeof fetch;

    const promise = adapter(fetchImpl).generate(request);
    await expect(promise).rejects.toBeInstanceOf(PlatformError);
    await expect(promise).rejects.toMatchObject({ code: 'invalid_api_key' });
  });

  it('convierte una tarea FAILED en PlatformError con su código', async () => {
    const fetchImpl = vi.fn(async (url: unknown) =>
      String(url).includes('/v1/services/')
        ? json({ task_id: taskId, status: 'IN_PROGRESS' }, 202)
        : json({
            task_id: taskId,
            status: 'FAILED',
            error: { code: 'rate_limited', message: 'slow down' },
          }),
    ) as unknown as typeof fetch;

    await expect(adapter(fetchImpl).generate(request)).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('aborta con AbortSignal', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    const promise = adapter(fetchImpl).generate(request, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(/abort/i);
  });
});
```

Y añadir a `packages/core/src/factory.test.ts`:

```ts
describe('createGenerationService con proveedores live', () => {
  it('crea un servicio para pollinations y google con base url', () => {
    const options = { apiBaseUrl: 'https://api.test' };
    expect(createGenerationService('pollinations', options)).toHaveProperty('generate');
    expect(createGenerationService('google', options)).toHaveProperty('generate');
  });

  it('exige apiBaseUrl para los proveedores live', () => {
    expect(() => createGenerationService('pollinations')).toThrow(/apiBaseUrl/i);
  });
});
```

(el test existente `rechaza proveedores aún no implementados` deja de aplicar a pollinations/google: sustituirlo por uno que verifique que `createGenerationService('mock')` sigue devolviendo el adaptador mock.)

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/core run test -- platform`
Expected: FAIL — `Cannot find module './platform'`.

- [ ] **Step 3: Implementar el adaptador**

`packages/core/src/adapters/platform.ts`:

```ts
import { API_KEY_HEADER, taskResponseSchema } from '../api-contract';
import { PlatformError } from '../errors';
import type {
  ApiTraceStep,
  GenerationRequest,
  GenerationResult,
  GenerationService,
} from '../types';

export type PlatformAdapterOptions = {
  apiBaseUrl: string;
  getApiKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  maxPollMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_MS = 60_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readError(response: Response): Promise<PlatformError> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  };
  return new PlatformError(
    (body.error?.code as PlatformError['code']) ?? 'provider_error',
    body.error?.message ?? `API responded with ${response.status}`,
  );
}

export function createPlatformAdapter(options: PlatformAdapterOptions): GenerationService {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxPollMs = options.maxPollMs ?? DEFAULT_MAX_POLL_MS;

  function headers(): Record<string, string> {
    const key = options.getApiKey?.();
    return { 'content-type': 'application/json', ...(key ? { [API_KEY_HEADER]: key } : {}) };
  }

  return {
    async generate(request: GenerationRequest, signal?: AbortSignal): Promise<GenerationResult> {
      const started = Date.now();
      const apiTrace: ApiTraceStep[] = [];

      const createUrl = `${options.apiBaseUrl}/v1/services/${request.service}`;
      const body = {
        provider: request.provider,
        prompt: request.prompt,
        model: request.model,
        aspect_ratio: request.aspectRatio,
        seed: request.seed,
      };
      apiTrace.push({ kind: 'request', method: 'POST', url: createUrl, body });

      const created = await fetchImpl(createUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      if (!created.ok) throw await readError(created);

      const createdBody = taskResponseSchema.parse(await created.json());
      apiTrace.push({ kind: 'status', state: 'IN_PROGRESS', taskId: createdBody.task_id });

      const pollUrl = `${options.apiBaseUrl}/v1/tasks/${createdBody.task_id}`;
      const deadline = Date.now() + maxPollMs;

      for (;;) {
        apiTrace.push({ kind: 'poll', method: 'GET', url: pollUrl });
        const polled = await fetchImpl(pollUrl, {
          headers: headers(),
          ...(signal ? { signal } : {}),
        });
        if (!polled.ok) throw await readError(polled);

        const task = taskResponseSchema.parse(await polled.json());
        if (task.status === 'FAILED') throw new PlatformError(task.error.code, task.error.message);
        if (task.status === 'COMPLETED') {
          apiTrace.push({ kind: 'completed', response: task });
          return {
            kind: 'image',
            url: task.output.url,
            ...(task.output.width === undefined ? {} : { width: task.output.width }),
            ...(task.output.height === undefined ? {} : { height: task.output.height }),
            provider: request.provider,
            degraded: false,
            elapsedMs: Date.now() - started,
            apiTrace,
          };
        }
        if (Date.now() >= deadline) {
          throw new PlatformError('provider_error', 'Timed out while polling the task');
        }
        await sleep(pollIntervalMs, signal);
      }
    },
  };
}
```

- [ ] **Step 4: No degradar ante errores fatales**

En `packages/core/src/with-mock-fallback.ts`, dentro del `catch`, antes de llamar al mock, añadir la guarda (y su import):

```ts
import { isFatalPlatformError } from './errors';
```

```ts
      } catch (error) {
        if (signal?.aborted) throw error;
        if (isFatalPlatformError(error)) throw error;
        const fallback = await mock.generate(request, signal);
        return { ...fallback, degraded: true };
      } finally {
```

- [ ] **Step 5: Actualizar la factory**

Sustituir `packages/core/src/factory.ts`:

```ts
import { createMockAdapter } from './adapters/mock';
import { createPlatformAdapter } from './adapters/platform';
import { withMockFallback } from './with-mock-fallback';
import type { GenerationService, ProviderId } from './types';

export type GenerationServiceOptions = {
  apiBaseUrl?: string;
  getApiKey?: () => string | undefined;
};

export function createGenerationService(
  provider: ProviderId,
  options: GenerationServiceOptions = {},
): GenerationService {
  if (provider === 'mock') return createMockAdapter();

  if (!options.apiBaseUrl) {
    throw new Error(`Provider "${provider}" requires apiBaseUrl to reach the platform API`);
  }

  const live = createPlatformAdapter({
    apiBaseUrl: options.apiBaseUrl,
    ...(options.getApiKey ? { getApiKey: options.getApiKey } : {}),
  });
  return withMockFallback(live, createMockAdapter());
}
```

Añadir a `packages/core/src/index.ts`:

```ts
export { createPlatformAdapter, type PlatformAdapterOptions } from './adapters/platform';
export type { GenerationServiceOptions } from './factory';
```

- [ ] **Step 6: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/core run test` → Expected: PASS (los 4 tests previos de `withMockFallback` siguen verdes: sus errores son `Error` plano, no fatales).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test` → verde.

```bash
git add -A && git commit -m "feat(core): adaptador platform con polling, traza real y fallback no fatal"
```

---

### Task 7: Panel de API keys en web (TDD)

**Files:**

- Create: `apps/web/src/ui/use-api-keys.ts`, `apps/web/src/ui/api-key-panel.tsx`
- Test: `apps/web/src/ui/use-api-keys.test.ts`, `apps/web/src/ui/api-key-panel.test.tsx`
- Modify: `apps/web/src/i18n/messages.ts`

**Interfaces:**

- Produces: `useApiKeys(): { keyFor(provider: ProviderId): string | undefined; setKey(provider: ProviderId, key: string): void; clearKey(provider: ProviderId): void }` (persistencia en `sessionStorage`, clave `ai-playground:key:<provider>`); `<ApiKeyPanel provider onSave onClear currentKey />`.
- Claves i18n nuevas (ambos idiomas): `key.title`, `key.description`, `key.input`, `key.save`, `key.clear`, `key.saved`, `key.cost.warning`, `provider.label`, `provider.auth.none`, `provider.auth.key`, `result.origin.live`.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/web/src/ui/use-api-keys.test.ts`:

```ts
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
```

`apps/web/src/ui/api-key-panel.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROVIDERS } from '@ai-playground/core';
import { ApiKeyPanel } from './api-key-panel';
import { I18nProvider } from '@/i18n/i18n';

const google = PROVIDERS.find((p) => p.id === 'google')!;

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('ApiKeyPanel', () => {
  it('pide la key con un input de tipo password', () => {
    wrap(<ApiKeyPanel provider={google} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('avisa del coste cuando el proveedor lo requiere', () => {
    wrap(<ApiKeyPanel provider={google} onSave={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByRole('note')).toHaveTextContent(/cost/i);
  });

  it('guarda la key escrita', async () => {
    const onSave = vi.fn();
    wrap(<ApiKeyPanel provider={google} onSave={onSave} onClear={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('API key'), 'my-key');
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSave).toHaveBeenCalledWith('my-key');
  });

  it('no guarda un valor vacío', async () => {
    const onSave = vi.fn();
    wrap(<ApiKeyPanel provider={google} onSave={onSave} onClear={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('con key guardada muestra el estado y permite borrarla', async () => {
    const onClear = vi.fn();
    wrap(<ApiKeyPanel provider={google} currentKey="abc" onSave={vi.fn()} onClear={onClear} />);
    expect(screen.getByText(/key saved/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear key' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('nunca muestra la key guardada en claro', () => {
    wrap(
      <ApiKeyPanel
        provider={google}
        currentKey="super-secret"
        onSave={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByText(/super-secret/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/web run test -- api-key`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 3: Añadir las claves i18n**

En `apps/web/src/i18n/messages.ts`, añadir a `en`:

```ts
    'provider.label': 'Provider',
    'provider.auth.none': 'no key needed',
    'provider.auth.key': 'API key',
    'key.title': 'API key required',
    'key.description': 'Stored only in this tab (sessionStorage) and sent per request. Never saved on any server.',
    'key.input': 'API key',
    'key.save': 'Save key',
    'key.clear': 'Clear key',
    'key.saved': 'Key saved for this session',
    'key.cost.warning': 'This provider has no free tier: every generation has a cost billed to your key.',
    'result.origin.live': 'live',
```

y a `es`:

```ts
    'provider.label': 'Proveedor',
    'provider.auth.none': 'sin key',
    'provider.auth.key': 'API key',
    'key.title': 'API key requerida',
    'key.description': 'Se guarda solo en esta pestaña (sessionStorage) y se envía en cada petición. Nunca se almacena en ningún servidor.',
    'key.input': 'API key',
    'key.save': 'Guardar key',
    'key.clear': 'Borrar key',
    'key.saved': 'Key guardada para esta sesión',
    'key.cost.warning': 'Este proveedor no tiene tier gratuito: cada generación tiene coste con cargo a tu key.',
    'result.origin.live': 'live',
```

- [ ] **Step 4: Implementar el hook**

`apps/web/src/ui/use-api-keys.ts`:

```ts
import { useCallback, useState } from 'react';
import type { ProviderId } from '@ai-playground/core';

const PREFIX = 'ai-playground:key:';

const storageKey = (provider: ProviderId): string => `${PREFIX}${provider}`;

function readAll(): Partial<Record<ProviderId, string>> {
  const entries: Partial<Record<ProviderId, string>> = {};
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
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
```

- [ ] **Step 5: Implementar el panel**

`apps/web/src/ui/api-key-panel.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import type { ProviderDefinition } from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';

type Props = {
  provider: ProviderDefinition;
  currentKey?: string;
  onSave: (key: string) => void;
  onClear: () => void;
};

export function ApiKeyPanel({ provider, currentKey, onSave, onClear }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSave(draft.trim());
    setDraft('');
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-fg">{t('key.title')}</h2>
      <p className="text-xs text-muted">{t('key.description')}</p>
      {provider.costWarning && (
        <p role="note" className="text-xs text-danger">
          {t('key.cost.warning')}
        </p>
      )}
      {currentKey ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{t('key.saved')}</span>
          <button
            type="button"
            onClick={onClear}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-fg"
          >
            {t('key.clear')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor="api-key" className="text-sm text-muted">
            {t('key.input')}
          </label>
          <input
            id="api-key"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="rounded-md border border-border bg-bg p-2 text-fg"
          />
          <button
            type="submit"
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            {t('key.save')}
          </button>
        </form>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Verificar verde y commitear**

Run: `pnpm --filter @ai-playground/web run test -- api-key` → Expected: PASS (12 tests).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test` → verde.

```bash
git add -A && git commit -m "feat(web): panel de API keys pass-through en sessionStorage"
```

---

### Task 8: Selector de proveedor e integración en la App (TDD)

**Files:**

- Create: `apps/web/src/ui/provider-selector.tsx`
- Test: `apps/web/src/ui/provider-selector.test.tsx`, `apps/web/src/app.test.tsx` (ampliar)
- Modify: `apps/web/src/app.tsx`, `apps/web/src/ui/result-panel.tsx`, `apps/web/src/ui/generation-form.tsx`, `apps/web/.env.example` (crear)

**Interfaces:**

- Consumes: `useApiKeys`, `ApiKeyPanel` (Task 7), `createGenerationService` con opciones (Task 6), `modelsFor`/`providerById` (Task 2).
- Produces: `<ProviderSelector value onChange />`; App con estado de proveedor, panel de key condicional y badge de origen `mock | live | live → mock`.

- [ ] **Step 1: Escribir los tests que fallan**

`apps/web/src/ui/provider-selector.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderSelector } from './provider-selector';
import { I18nProvider } from '@/i18n/i18n';

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe('ProviderSelector', () => {
  it('lista los tres proveedores del registry', () => {
    wrap(<ProviderSelector value="mock" onChange={vi.fn()} />);
    const select = screen.getByLabelText('Provider') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['mock', 'pollinations', 'google']);
  });

  it('marca cuáles requieren key', () => {
    wrap(<ProviderSelector value="google" onChange={vi.fn()} />);
    expect(screen.getByTestId('provider-auth')).toHaveTextContent('API key');
  });

  it('notifica el cambio de proveedor', async () => {
    const onChange = vi.fn();
    wrap(<ProviderSelector value="mock" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'pollinations');
    expect(onChange).toHaveBeenCalledWith('pollinations');
  });
});
```

Añadir a `apps/web/src/app.test.tsx`:

```tsx
describe('App con proveedores live', () => {
  it('muestra el panel de key al elegir un proveedor que la requiere', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    expect(screen.getByRole('heading', { name: 'API key required' })).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/no free tier/i);
  });

  it('no pide key para un proveedor sin auth', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'pollinations');
    expect(screen.queryByRole('heading', { name: 'API key required' })).not.toBeInTheDocument();
  });

  it('el formulario ofrece los modelos del proveedor elegido', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    const models = screen.getByLabelText('Model') as HTMLSelectElement;
    expect([...models.options].map((o) => o.value)).toContain('gemini-2.5-flash-image');
  });

  it('bloquea generar si falta la key del proveedor', async () => {
    render(<App service={createMockAdapter({ latencyMs: 0 })} />);
    await userEvent.selectOptions(screen.getByLabelText('Provider'), 'google');
    await userEvent.type(screen.getByLabelText('Prompt'), 'a red fox');
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Ejecutar y verificar rojo**

Run: `pnpm --filter @ai-playground/web run test -- "provider-selector|app"`
Expected: FAIL — no existe el selector.

- [ ] **Step 3: Implementar el selector**

`apps/web/src/ui/provider-selector.tsx`:

```tsx
import { PROVIDERS, providerById, type ProviderId } from '@ai-playground/core';
import { useI18n } from '@/i18n/i18n';

type Props = { value: ProviderId; onChange: (provider: ProviderId) => void };

export function ProviderSelector({ value, onChange }: Props) {
  const { t } = useI18n();
  const auth = providerById(value).auth;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="provider" className="text-sm text-muted">
        {t('provider.label')}
      </label>
      <select
        id="provider"
        value={value}
        onChange={(event) => onChange(event.target.value as ProviderId)}
        className="rounded-md border border-border bg-surface p-2 text-fg"
      >
        {PROVIDERS.map((provider) => (
          <option key={provider.id} value={provider.id}>
            {provider.id}
          </option>
        ))}
      </select>
      <span data-testid="provider-auth" className="text-xs text-muted">
        {auth === 'api-key' ? t('provider.auth.key') : t('provider.auth.none')}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Aceptar modelos y bloqueo en el formulario**

En `apps/web/src/ui/generation-form.tsx`: añadir `disabled?: boolean` a `Props`, resetear el modelo cuando cambian los del proveedor y deshabilitar el submit:

```tsx
type Props = {
  service: ServiceDefinition;
  provider: ProviderDefinition;
  busy: boolean;
  disabled?: boolean;
  onGenerate: (request: GenerationRequest) => void;
};
```

Dentro del componente, sustituir el estado del modelo por uno sincronizado con el proveedor:

```tsx
const models = provider.models[service.id] ?? [];
const [model, setModel] = useState(models[0] ?? '');
const validModel = models.includes(model) ? model : (models[0] ?? '');
```

usar `validModel` en el `value` del `<select id="model">` y en el payload de `onGenerate`, y en el botón de submit:

```tsx
      <button
        type="submit"
        disabled={busy || disabled}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
```

- [ ] **Step 5: Mostrar el origen live y dimensiones honestas**

En `apps/web/src/ui/result-panel.tsx`, sustituir el `<img>` y el badge del `figcaption`:

```tsx
<img
  src={result.url}
  alt={t('result.alt')}
  {...(result.width ? { width: result.width } : {})}
  {...(result.height ? { height: result.height } : {})}
  className="max-w-full rounded-md border border-border"
/>
```

```tsx
                <span className="rounded-sm border border-border px-1.5 py-0.5">
                  {result.degraded
                    ? t('result.origin.degraded')
                    : result.provider === 'mock'
                      ? t('result.origin.mock')
                      : t('result.origin.live')}
                </span>{' '}
```

- [ ] **Step 6: Integrar en la App**

En `apps/web/src/app.tsx`, sustituir el componente `Playground` y el default export:

```tsx
function Playground({ service }: { service?: GenerationService }) {
  const { t, locale, setLocale } = useI18n();
  const [activeService, setActiveService] = useState<PlaygroundMode>('generate-image');
  const [providerId, setProviderId] = useState<ProviderId>('mock');
  const { keyFor, setKey, clearKey } = useApiKeys();
  const lastRequest = useRef<GenerationRequest | null>(null);

  const provider = providerById(providerId);
  const apiKey = keyFor(providerId);
  const needsKey = provider.auth === 'api-key' && !apiKey;

  const activeGenerationService = useMemo(
    () =>
      service ??
      createGenerationService(providerId, {
        apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787',
        getApiKey: () => keyFor(providerId),
      }),
    [service, providerId, keyFor],
  );

  const { state, generate } = useGeneration(activeGenerationService);
  const serviceDef = SERVICES.find((s) => s.id === activeService) ?? SERVICES[0]!;

  function handleGenerate(request: GenerationRequest) {
    lastRequest.current = request;
    generate(request);
  }

  function toggleTheme() {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="font-semibold">{t('app.title')}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted"
            aria-label={t('toggle.locale')}
          >
            {locale.toUpperCase()}
          </button>
          <button
            onClick={toggleTheme}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted"
            aria-label={t('toggle.theme')}
          >
            ◐
          </button>
        </div>
      </header>
      <main className="grid gap-6 p-6 lg:grid-cols-[12rem_minmax(20rem,24rem)_1fr]">
        <nav aria-label="Services" className="flex flex-col gap-1">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveService(s.id)}
              aria-current={s.id === activeService ? 'true' : undefined}
              className="rounded-md px-3 py-2 text-left text-sm text-muted aria-[current]:bg-surface aria-[current]:text-fg"
            >
              {t(s.labelKey as MessageKey)}
            </button>
          ))}
        </nav>
        <div className="flex flex-col gap-4">
          <ProviderSelector value={providerId} onChange={setProviderId} />
          {provider.auth === 'api-key' && (
            <ApiKeyPanel
              provider={provider}
              {...(apiKey ? { currentKey: apiKey } : {})}
              onSave={(key) => setKey(providerId, key)}
              onClear={() => clearKey(providerId)}
            />
          )}
          <GenerationForm
            service={serviceDef}
            provider={provider}
            busy={state.status === 'loading'}
            disabled={needsKey}
            onGenerate={handleGenerate}
          />
        </div>
        <ResultPanel
          state={state}
          onRetry={() => lastRequest.current && handleGenerate(lastRequest.current)}
        />
      </main>
    </div>
  );
}

export default function App({ service }: { service?: GenerationService }) {
  return (
    <I18nProvider>
      <Playground {...(service ? { service } : {})} />
    </I18nProvider>
  );
}
```

Actualizar los imports del archivo:

```tsx
import { useMemo, useRef, useState } from 'react';
import { I18nProvider, useI18n } from './i18n/i18n';
import {
  SERVICES,
  createGenerationService,
  providerById,
  type GenerationRequest,
  type GenerationService,
  type PlaygroundMode,
  type ProviderId,
} from '@ai-playground/core';
import type { MessageKey } from './i18n/messages';
import { ApiKeyPanel } from './ui/api-key-panel';
import { GenerationForm } from './ui/generation-form';
import { ProviderSelector } from './ui/provider-selector';
import { ResultPanel } from './ui/result-panel';
import { useGeneration } from './ui/use-generation';
```

Crear `apps/web/.env.example`:

```
# URL de la API propia. En local: wrangler dev (apps/api) escucha en 8787.
VITE_API_BASE_URL=http://localhost:8787
```

- [ ] **Step 7: Verificar verde**

Run: `pnpm --filter @ai-playground/web run test` → Expected: PASS (todos, incluidos los de fase A).
Run: `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test && pnpm run build` → verde.

- [ ] **Step 8: Verificación end-to-end real contra la API**

En dos terminales (o en background):

```bash
pnpm --filter @ai-playground/api run dev     # wrangler dev → http://localhost:8787
pnpm --filter @ai-playground/web run dev --port 5199
```

Comprobar con `curl` que la API responde de verdad:

```bash
curl -s -X POST http://localhost:8787/v1/services/generate-image \
  -H 'content-type: application/json' \
  -d '{"provider":"pollinations","prompt":"a red fox in the snow","model":"flux","aspect_ratio":"widescreen_16_9","seed":42}'
# → {"task_id":"v1....","status":"IN_PROGRESS"}

curl -s "http://localhost:8787/v1/tasks/<task_id_de_arriba>"
# → {"task_id":"v1....","status":"COMPLETED","provider":"pollinations","elapsed_ms":...,"output":{...}}
```

En el navegador (`http://localhost:5199`): elegir proveedor `pollinations`, escribir un prompt, Generate → debe aparecer una imagen REAL generada, badge `live`, y la pestaña API debe mostrar la traza con las URLs reales de la API propia. Elegir `google` sin key → botón Generate deshabilitado y panel de key con aviso de coste. Cerrar ambos servidores al terminar.

- [ ] **Step 9: Commitear**

```bash
git add -A && git commit -m "feat(web): selector de proveedor, panel de key integrado y badge de origen live"
```

---

### Task 9: Documentación, spec enmendada y cierre de fase B

**Files:**

- Modify: `README.md`, `STATUS.md`, `docs/specs/2026-07-24-ai-playground-design.md`, `docs/plans/2026-07-24-product-roadmap.md`, `skills/adding-a-provider/SKILL.md`

**Interfaces:** ninguna (documentación).

- [ ] **Step 1: Enmendar la spec con lo verificado**

En `docs/specs/2026-07-24-ai-playground-design.md`, añadir al final una sección:

```markdown
## 5. Enmiendas verificadas (fase B, 2026-07-29)

- **Google no tiene free tier de imagen** (pricing oficial: "Not available", ~$0.039/imagen).
  La fila «Proveedores v1» de §0 asumía ~500 img/día gratis: queda corregida. Consecuencia:
  el aviso de coste explícito que la spec reservaba para vídeo se aplica a **todo** el
  proveedor google, mostrado en el panel de API key antes de poder generar.
- **Catálogo de pollinations declarado, no descubierto**: su endpoint `/models` es
  inconsistente con los modelos que acepta `/prompt`; el registry declara `flux` y `turbo`,
  ambos verificados respondiendo 200.
- **Aspect ratio en google**: el body verificado no expone control de aspect ratio para
  estos modelos; se transmite como sugerencia en el prompt y las dimensiones reales quedan
  desconocidas. Por eso `width`/`height` son opcionales en el contrato y la UI no declara
  atributos que no conoce.
- **API stateless**: el `task_id` es la request canónica codificada (base64url, prefijo
  `v1.`), así que no hay almacenamiento de tareas. Efecto colateral deseado: todo `task_id`
  es determinista y reproducible.
```

- [ ] **Step 2: Actualizar el roadmap**

En `docs/plans/2026-07-24-product-roadmap.md`, marcar B como `hecha` y sustituir las filas C y D por:

```markdown
| C | Paridad de features: `edit-image` y `generate-video`, ejemplos precargados por modelo, share-by-URL, snippets de código multi-lenguaje (cURL/JS/Python) en la pestaña API, historial de generaciones de la sesión y descarga del resultado | pendiente | B |
| D | Polish: a11y (axe), QA, presupuesto de bundle, deploy (Pages + Workers) e integración como caso de estudio | pendiente | C |
```

- [ ] **Step 3: Actualizar el README**

En `README.md`, sustituir la sección de features actuales por el estado real e incluir la API:

````markdown
## Features

- **Task-based API of its own** (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`)
  with a published OpenAPI document at `/openapi.json`. Stateless: the task id encodes the
  request, so every task id is deterministic and reproducible.
- **Providers**: `mock` (client-side, deterministic, works offline), `pollinations` (no key),
  `google` (Gemini image models, bring your own key — no free tier, cost warning shown).
- **Bring your own key**: kept in `sessionStorage` for the tab only, sent per request through a
  header, never stored server-side, never in the bundle or the URL.
- **Honest API trace**: the API tab shows the real request/poll/response cycle, not a mock-up.
- **Graceful degradation**: transient provider failures fall back to the mock adapter with a
  `live → mock` badge; auth and validation errors surface instead of being hidden.
- Semantic design tokens (dark/light, WCAG AA), i18n (en/es), explicit empty/loading/error states.

## Running the API locally

```bash
pnpm --filter @ai-playground/api run dev   # http://localhost:8787
pnpm --filter @ai-playground/web run dev   # set VITE_API_BASE_URL if the API is elsewhere
```
````

````

- [ ] **Step 4: Actualizar la skill adding-a-provider**

En `skills/adding-a-provider/SKILL.md`, actualizar el checklist para reflejar la realidad de fase B: (1) añadir la `ProviderDefinition` al registry con `auth` y `costWarning` y su catálogo de modelos **verificado con curl** (documentar fecha y comando); (2) crear el conector en `apps/api/src/connectors/<provider>.ts` implementando `Connector`, honrando el `AbortSignal` y mapeando errores a `ApiErrorCode`; (3) registrarlo en `apps/api/src/connectors/index.ts`; (4) tests del conector contra `fetch` mockeado (URL/payload, cada código de error, caso de bloqueo); (5) si `auth: 'api-key'`, verificar que la key llega por `API_KEY_HEADER` y **no** aparece en URL ni en la respuesta; (6) actualizar la spec OpenAPI (`apps/api/src/openapi.ts`) con el nuevo valor del enum de `provider`; (7) añadir las claves i18n en ambos idiomas.

- [ ] **Step 5: Actualizar STATUS y commitear**

En `STATUS.md`: «Ahora» = fase B completada (API task-based + 2 proveedores live + panel de keys), «Hecho» con el resumen, «Siguiente acción» = plan de fase C just-in-time.

Run: `pnpm run format` → verde.

```bash
git add -A && git commit -m "docs: cierra fase B — spec enmendada, roadmap, README y skill actualizados"
git push
````

---

## Self-review

**Cobertura de la spec (§0–§4 + enmiendas):**

- Proveedores v1 (mock/pollinations/google) → Tasks 2, 3, 4. Veo/vídeo queda fuera: la spec lo sitúa en el servicio `generate-video`, que es fase C.
- API keys por proveedor en `sessionStorage`, panel inline, pass-through → Tasks 5, 7, 8.
- Arquitectura híbrida con API propia task-based + OpenAPI + conectores server-side → Tasks 1, 5, 6.
- Adaptador `platform` + `withMockFallback` → Task 6.
- Traza task-based real en la pestaña API → Task 6 (traza) sobre el `ApiTraceView` de fase A.
- Badge de origen honesto `mock | live | live → mock` → Task 8.
- Estados explícitos, cancelación con `AbortSignal`, i18n, tokens, WCAG AA → heredados de fase A y respetados en Tasks 7–8.
- Riesgo «listas de modelos cambian» → catálogo declarado en el registry con fecha de verificación (Task 2) y checklist actualizado en la skill (Task 9).
- Riesgo «coste» → aviso explícito y bloqueo del botón sin key (Tasks 7, 8).
- Share-by-URL y ejemplos precargados → **fuera de alcance**, fase C (el `task_id` determinista de Task 1 los habilita).

**Consistencia de tipos:** `TaskOutput`/`TaskResponse`/`ApiErrorCode` se definen en Task 1 y se consumen con los mismos nombres en Tasks 3–6; `Connector`/`ConnectorContext` en Task 3 y se usan igual en Tasks 4–5; `modelsFor`/`providerById` en Task 2 y se usan en Tasks 5, 8; `createPlatformAdapter`/`GenerationServiceOptions` en Task 6 y se usan en Task 8. `width`/`height` pasan a opcionales en Task 1 y la UI lo respeta en Task 8.
