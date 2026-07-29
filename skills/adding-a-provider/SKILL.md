---
name: adding-a-provider
description: Use when añadiendo un proveedor o servicio de generación nuevo al playground
---

# Adding a provider

Checklist para dar de alta un proveedor (o un servicio nuevo) en el registry declarativo.

1. **Definición**: añadir un `ProviderDefinition` a `packages/core/src/registry.ts`
   (`id`, `label`, `auth: 'none' | 'api-key'`, catálogo de `models` por servicio).
2. **Adaptador**:
   - Conector server-side en `apps/api` (fase B+) que implemente el contrato task-based
     (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) y construya su
     propia `ApiTrace`, si el proveedor requiere secretos o tiene restricciones de CORS.
   - Adaptador client-side en `packages/core/src/adapters/` si no requiere secretos ni
     CORS (puede llamarse directo desde el navegador).
   - **Contrato de `AbortSignal` (obligatorio en ambos casos)**: el `generate()` de todo
     adaptador DEBE honrar el `AbortSignal` que recibe — rechazar con `AbortError` en
     cuanto el signal se aborta. `withMockFallback` (`packages/core/src/with-mock-fallback.ts`)
     depende de esto para su timeout y su fallback al mock: si el adaptador ignora el
     signal, el timeout queda como no-op y la llamada nunca degrada.
3. **Registro**: añadir el proveedor a `packages/core/src/factory.ts` para que la factory
   pueda resolverlo por id.
4. **API keys**: si `auth: 'api-key'`, integrar con el panel de keys pass-through
   (input tipo password, guardado en `sessionStorage` por proveedor, nunca en bundle,
   repo o servidor).
5. **Tests** (TDD): payload/URL construidos contra `fetch` mockeado, fallback a mock
   cuando falla o hace timeout, catálogo de modelos exhaustivo.
6. **i18n**: labels del proveedor y sus modelos en ambos idiomas (es/en).
7. **Verificación de catálogo**: confirmar la lista viva de modelos del proveedor
   (cambian con frecuencia) y documentarla en `docs/specs/2026-07-24-ai-playground-design.md`.
