# STATUS — 2026-07-29

## Ahora

Fase B completada en `main`: API task-based propia, Pollinations y Google server-side,
adaptador `platform`, panel de keys pass-through y selector de proveedor integrados.

## Hecho

- B1–B6 (`3feb605`–`a902c71`): contrato/codec/registry, conectores, API + OpenAPI,
  adaptador live y fallback con timeout de 120 s.
- B7 (`f3faf2a`): keys por proveedor en `sessionStorage`, panel accesible y aviso de
  coste para Google.
- B8 (`3ee240f`, fix Workers `9c7d435`): selector, modelos dinámicos, bloqueo sin key,
  badge de origen y traza real.
- E2E real: Worker local → Pollinations `COMPLETED`; Chromium mostró imagen 1024×1024,
  badge `live` y POST/poll/`COMPLETED` en la pestaña API.
- Verificación fresca: lint, format, typecheck, 143 tests y build completos en verde.

## Siguiente acción

Escribir el plan just-in-time de fase C desde el roadmap: `edit-image`,
`generate-video`, ejemplos por modelo, share-by-URL, snippets, historial y descarga.

## Pendientes del usuario (no bloqueantes)

- Ninguno. Para probar Google live hace falta una key propia con billing; nunca se guarda
  server-side.

## Fuentes de verdad

- Spec: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap: `docs/plans/2026-07-24-product-roadmap.md`
- Plan cerrado de fase B: `docs/plans/2026-07-29-phase-b-live-api.md`
- Convenciones: `AGENTS.md`
