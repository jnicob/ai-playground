# STATUS

## Ahora

Fase A completada: walking skeleton end-to-end verde (43 tests). Pendiente publicar
el repo en GitHub.

## Hecho

- Scaffold del monorepo pnpm: `packages/core`, `apps/api` (Hono/Cloudflare Workers),
  `apps/web` (Vite + React), tooling (eslint, prettier, tsconfig base, vitest) y CI.
- Spec de producto, roadmap de fases, `AGENTS.md` y skill `adding-a-provider`.
- Walking skeleton mock end-to-end: `packages/core` (tipos, registry, Zod, adaptador
  mock, `withMockFallback`), `apps/web` (tokens semánticos, i18n es/en, hook
  `useGeneration`, form + panel de resultado con traza API) y endpoint `/health` en
  `apps/api`. 43 tests en verde (`pnpm run test`).
- Fixes pre-publicación: licencia MIT (repo + 4 package.json), `.gitignore` raíz
  ignora `.superpowers/`, fixture de provider neutral en `registry.test.ts`, README
  público, aria-labels de los toggles por i18n.

## Siguiente acción

Publicar el repo en `github.com:jnicob/ai-playground` con CI verde (Task 11).
Plan de fase B (API task-based propia + conectores server-side) se escribe
just-in-time cuando arranque, usando la spec de producto como entrada.

## Fuentes de verdad

- Spec de producto: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap de fases: `docs/plans/2026-07-24-product-roadmap.md`
- Convenciones de agentes: `AGENTS.md`
