---
name: adding-a-provider
description: Use when añadiendo un proveedor o servicio de generación nuevo al playground
---

# Adding a provider

Checklist para dar de alta un proveedor (o un servicio nuevo) en el registry declarativo.

1. Añadir su `ProviderDefinition` a `packages/core/src/registry.ts`, incluidos `auth`,
   `costWarning` y catálogo de modelos. Verificar el catálogo con `curl` real y documentar
   fecha y comando.
2. Crear `apps/api/src/connectors/<provider>.ts` implementando `Connector`. Debe honrar el
   `AbortSignal` y mapear errores externos a `ApiErrorCode`.
3. Registrarlo en `apps/api/src/connectors/index.ts`.
4. Añadir tests TDD del conector con `fetch` mockeado: URL, payload, cada código de error,
   respuesta malformada y bloqueo de contenido si aplica.
5. Si `auth: 'api-key'`, comprobar que la key llega por `API_KEY_HEADER` y nunca aparece
   en la URL, el `task_id`, logs ni respuestas. La UI la guarda solo en `sessionStorage`.
6. Añadir el proveedor al enum de `apps/api/src/openapi.ts`.
7. Añadir todas las claves visibles a ambos idiomas en `apps/web/src/i18n/messages.ts`.
8. Ejecutar `pnpm run lint && pnpm run format`.
9. Ejecutar `pnpm run typecheck && pnpm run test && pnpm run build`, y comprobar una
   generación real end-to-end.
