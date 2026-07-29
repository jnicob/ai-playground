# STATUS — 2026-07-29

## Ahora

Fase B en curso: B1–B6 completas en `main`. La API task-based, los conectores
`pollinations`/`google` y el adaptador `platform` están implementados; falta integrar
la selección y las keys en la web (B7–B8) y cerrar documentación (B9).

## Hecho

- B1–B2 (`3feb605`–`00e9387`): contrato HTTP compartido, `task_id` estable y registry
  de proveedores live.
- B3–B5 (`331860f`–`07ffecf`): conectores server-side, saneado de errores de Google,
  endpoints, CORS y OpenAPI; `mock` queda fuera del contrato público.
- B6 (`a459925`, fix `a902c71`): adaptador `platform` con polling/traza, key por header
  y fallback no fatal. El timeout live es 120 s para no degradar generaciones
  síncronas válidas a mock a los 20 s.
- Verificación fresca: lint, format, typecheck, 121 tests y build completos en verde.

## Siguiente acción

1. Implementar B7 con TDD: `apps/web/src/ui/use-api-keys.ts`,
   `apps/web/src/ui/api-key-panel.tsx` y claves en `apps/web/src/i18n/messages.ts`.
2. Continuar B8 (selector e integración end-to-end) y B9 (spec/roadmap/README/skill).
3. Antes de cada commit: `pnpm run lint && pnpm run format`.
4. Después: `pnpm run typecheck && pnpm run test && pnpm run build`.

## Pendientes del usuario (no bloqueantes)

- Ninguno. Google no tiene free tier de imagen; el aviso de coste se aplica a todo el
  proveedor y generar queda bloqueado sin key.

## Fuentes de verdad

- Plan ejecutable: `docs/plans/2026-07-29-phase-b-live-api.md`
- Spec: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap: `docs/plans/2026-07-24-product-roadmap.md`
- Convenciones: `AGENTS.md`
