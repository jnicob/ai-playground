# STATUS

## Ahora

Fase A (bootstrap monorepo + walking skeleton mock + API `/health`) en curso.

## Hecho

- Scaffold del monorepo pnpm: `packages/core`, `apps/api` (Hono/Cloudflare Workers),
  `apps/web` (Vite + React), tooling (eslint, prettier, tsconfig base, vitest) y CI.
- Spec de producto, roadmap de fases, `AGENTS.md` y skill `adding-a-provider`.

## Siguiente acción

Walking skeleton: servicio mock end-to-end en `apps/web` consumiendo `packages/core`
(registry + adaptador mock) y endpoint `/health` en `apps/api`.

## Fuentes de verdad

- Spec de producto: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap de fases: `docs/plans/2026-07-24-product-roadmap.md`
- Convenciones de agentes: `AGENTS.md`
