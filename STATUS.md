# STATUS — 2026-07-29

## Ahora

Fase C en curso en `feat/phase-c-continuation`, apilada sobre `feat/phase-c` mientras la PR
#1 siga abierta. C1–C6 completadas: contratos, registry, snippets, edición de imagen, vídeo
Veo y adaptador dual.

## Hecho

- B1–B6 (`3feb605`–`a902c71`): contrato/codec/registry, conectores, API + OpenAPI,
  adaptador live y fallback con timeout de 120 s.
- B7 (`f3faf2a`): keys por proveedor en `sessionStorage`, panel accesible y aviso de
  coste para Google.
- B8 (`3ee240f`, fix Workers `9c7d435`): selector, modelos dinámicos, bloqueo sin key,
  badge de origen y traza real.
- E2E real: Worker local → Pollinations `COMPLETED`; Chromium mostró imagen 1024×1024,
  badge `live` y POST/poll/`COMPLETED` en la pestaña API.
- Verificación fresca: lint, format, typecheck, 208 tests y build completos en verde.
- C1: contratos discriminados y estrictos; el upload solo existe en dominio efímero y
  `task_id` v2 admite únicamente referencias Veo validadas, sin keys ni medios.
- C2: catálogo por proveedor/servicio, Google 3.1 Image y Veo Lite/Fast/Standard con
  restricciones 720p y pricing verificado; mock propio para edición y vídeo.
- C3: payload HTTP compartido por adaptador/snippets, redacción de uploads y código
  ejecutable con polling/descarga, selector accesible y copy feedback.
- C4: conector Google por servicio, PNG/JPEG/WebP base64 hasta 10 MiB con firma mágica,
  output externo validado y respuesta `200 COMPLETED` sin serializar el upload en task ID.
- C5: Veo inicia `predictLongRunning`, devuelve `task_id` v2 y consulta la operación sin
  reiniciarla. El vídeo final se sirve mediante descarga autenticada propia con token de
  `fileId` validado, allowlist HTTPS estricta, redirects bloqueados, MP4/tamaño controlados y
  `private, no-store`.
- C6: el adaptador `platform` acepta POST 200/202, hace polling desde 10 s con backoff 429
  hasta 30 s y timeout total de 10 min. Una operación aceptada nunca degrada a mock; el vídeo
  se descarga con key a Blob y expone `dispose()` idempotente, con traza redactada.

## Siguiente acción

Ejecutar C7: formulario controlado para edición y vídeo, validación y confirmación de coste.

## Pendientes del usuario

- Crear una API key personal en Google AI Studio y habilitar billing. No bloquea
  implementación ni tests mock, pero sí los smoke tests live de edición y Veo.
- Autorizar expresamente cada smoke de pago tras ver el coste estimado. La key nunca se
  guarda server-side ni se añade a Git.

## Fuentes de verdad

- Spec: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap: `docs/plans/2026-07-24-product-roadmap.md`
- Plan cerrado de fase B: `docs/plans/2026-07-29-phase-b-live-api.md`
- Plan de fase C: `docs/plans/2026-07-29-phase-c-feature-parity.md`
- Convenciones: `AGENTS.md`
