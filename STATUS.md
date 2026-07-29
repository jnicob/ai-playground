# STATUS — 2026-07-29

## Ahora

Fase C en curso en `feat/phase-c`. C1–C4 completadas: contratos, registry, snippets y
edición de imagen Google síncrona con upload validado.

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

## Siguiente acción

Ejecutar C5: Veo long-running, `task_id` v2, polling y descarga autenticada segura.

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
