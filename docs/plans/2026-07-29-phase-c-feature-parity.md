# Fase C — paridad funcional — Implementation Plan

**Goal:** Añadir edición de imagen y generación de vídeo con Google, ejemplos sin coste,
estado compartible por URL, snippets cURL/JavaScript/Python, historial de sesión y descarga,
sin almacenar keys ni medios del usuario.

**Status:** En curso en `feat/phase-c-continuation`; C1–C7 completadas. La rama está apilada
sobre `feat/phase-c` mientras la PR #1 siga abierta.

**Architecture:** La UI pasa a tener un borrador controlado como fuente única de verdad. La
API sigue siendo stateless, pero admite dos formas de ejecución: edición de imagen síncrona
(`200 COMPLETED`) y vídeo asíncrono (`202 IN_PROGRESS` + `task_id` v2 que contiene únicamente
el identificador validado de la operación de Google). La imagen de entrada, la API key y los
resultados binarios nunca entran en el `task_id`, la URL, los snippets ni el historial. El
cliente descarga los vídeos con `fetch` autenticado y crea un `blob:` URL local revocable.

**Tech Stack:** Hono 4 + Cloudflare Workers · Zod 4 · React 19 + Vite 8 · Vitest 4 +
Testing Library · TypeScript strict.

## Decisiones de producto

- `edit-image` acepta upload local PNG/JPEG/WebP de hasta 10 MB. No acepta una URL arbitraria.
- `generate-video` empieza con text-to-video de Veo: aspecto `16:9`/`9:16`, duración
  4/6/8 s y resolución 720p. 1080p/4K, image-to-video, extensión y múltiples referencias
  quedan fuera de C.
- Google exige key y billing para imagen y vídeo. La UI muestra un coste estimado antes de
  ejecutar, con Veo Lite 4 s/720p como opción inicial de menor coste.
- Los ejemplos cargan formulario y resultado pregenerado; pulsar “Usar ejemplo” no llama a
  ningún proveedor.
- El estado compartible se limita a primitives seguras. Deep-link válido gana a defaults y
  `popstate` restaura el formulario.
- El historial es local a la pestaña, con máximo 20 elementos. No se persiste en
  `localStorage` ni en servidor.
- Los snippets se generan desde el mismo payload canónico que usa el adaptador, con
  `${GOOGLE_API_KEY}` y `<BASE64_IMAGE>` como placeholders.
- La descarga de medios valida el tipo, sanea el nombre y revoca los `blob:` URLs al
  reemplazarlos o desmontar la vista.

## Contratos externos verificados (2026-07-29)

- Keys: Google AI Studio crea keys desde **API Keys**. Las keys nuevas son auth keys
  restringidas; Google anuncia el rechazo de standard keys no migradas desde septiembre de 2026. El runtime acepta `GEMINI_API_KEY` o `GOOGLE_API_KEY`, aunque este proyecto mantiene
  la key pass-through en `x-provider-key`.
- Imagen: Gemini acepta texto e imagen base64 como bloques de entrada. Modelos de referencia:
  `gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image` y
  `gemini-3-pro-image`.
- Vídeo: Veo inicia una long-running operation con
  `POST /v1beta/models/{model}:predictLongRunning`, consulta su estado con
  `GET /v1beta/{operation_name}` y exige la key también al descargar el vídeo final.
- Modelos iniciales: `veo-3.1-lite-generate-preview`,
  `veo-3.1-fast-generate-preview` y `veo-3.1-generate-preview`.
- No hay free tier para generación de imagen ni Veo. Los precios cambian: el registry debe
  declarar fecha y moneda, y la UI debe llamar al importe “estimación”, no promesa.

Fuentes oficiales:

- <https://ai.google.dev/gemini-api/docs/api-key>
- <https://ai.google.dev/gemini-api/docs/image-generation>
- <https://ai.google.dev/gemini-api/docs/veo>
- <https://ai.google.dev/gemini-api/docs/pricing>
- <https://ai.google.dev/gemini-api/docs/billing>

## Restricciones globales

- TDD por cada comportamiento: test rojo observado → mínima implementación → verde → commit.
- Antes de cada commit:
  `pnpm run lint && pnpm run format && pnpm run typecheck && pnpm run test && pnpm run build`.
- Commits pequeños con formato `tipo: descripción`; un commit por task salvo fixes de review.
- `packages/core` no depende de React, DOM ni Node.
- Contrato HTTP en `snake_case`; dominio TypeScript en `camelCase`.
- Todos los conectores y el polling honran `AbortSignal`.
- La key solo vive en `sessionStorage` y viaja en `x-provider-key`. Nunca se loguea ni se
  incluye en errores de proveedor, query strings, URLs compartidas o código generado.
- Toda URL remota y todo identificador de operación se valida con allowlist estricta. La API
  no se convierte en un proxy abierto.
- Todo texto visible y `aria-label` se añade en español e inglés.
- Componentes accesibles por teclado, con foco visible, labels explícitas, progreso anunciado
  sin spam y respeto a `prefers-reduced-motion`.
- Clean-room: solo documentación pública, assets propios y nombres públicos de proveedores.

## Orden de ejecución

```text
C1 contratos ─┬─> C2 registry ─> C3 payload/snippets
              ├─> C4 edición Google ───────┐
              └─> C5 vídeo Google ─────────┼─> C6 adaptador platform
                                           └─> C7 formulario
C3 + C7 ─> C8 ejemplos ─> C9 URL/share
C6 + C7 ─> C10 viewers/descarga/historial
C8 + C9 + C10 ─> C11 integración/E2E ─> C12 documentación/cierre
```

---

### C1. Contratos discriminados y `task_id` v2

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/api-contract.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/api-contract.test.ts`

**Entregables:**

- [x] Convertir `GenerationRequest` en unión discriminada por `service`:
      `generate-image`, `edit-image` y `generate-video`.
- [x] Añadir `sourceImage` solo al dominio efímero de edición; nunca al payload serializable.
- [x] Modelar resultados `image`, `image-pair` y `video` con schemas Zod estrictos.
- [x] Modelar respuesta POST como unión `200 COMPLETED | 202 IN_PROGRESS`.
- [x] Crear `task_id` v2 para `{ kind: "operation", service, provider, operation_name }`.
- [x] Mantener decode de v1 para las URLs/tareas existentes y rechazar versiones desconocidas.
- [x] Limitar longitud y patrón de `operation_name`; probar Unicode, corrupción, exceso de
      tamaño y ausencia de secretos.

**Commit:** `feat: amplía contratos para edición y vídeo`

### C2. Registry de servicios, modelos, capacidades y costes

**Files:**

- Modify: `packages/core/src/registry.ts`
- Test: `packages/core/src/registry.test.ts`
- Modify: `packages/core/src/adapters/mock-catalog.ts`

**Entregables:**

- [x] Declarar compatibilidad modelo × servicio × proveedor, sin combinaciones imposibles.
- [x] Añadir metadatos de aspecto, duración, resolución, auth y coste estimado.
- [x] Incluir `pricingVerifiedAt` y evitar descubrir modelos desde endpoints inconsistentes.
- [x] Hacer que la opción inicial de vídeo sea Lite, 4 s y 720p.
- [x] Añadir resultados mock propios para las dos capacidades nuevas.

**Commit:** `feat: registra modelos de edición y vídeo`

### C3. Payload canónico y snippets seguros

**Files:**

- Create: `packages/core/src/api-request.ts`
- Create: `packages/core/src/snippets.ts`
- Test: `packages/core/src/api-request.test.ts`
- Test: `packages/core/src/snippets.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/ui/api-trace-view.tsx`

**Entregables:**

- [x] Crear una única función que construya método, path, headers y body de cada servicio.
- [x] Reutilizarla desde adaptador y generador de snippets para impedir divergencias.
- [x] Generar cURL, `fetch` y Python `requests`, incluidos polling y descarga cuando proceda.
- [x] Usar placeholders para key e imagen; probar que una key y un base64 centinela jamás
      aparecen en el texto generado.
- [x] Añadir selector de lenguaje y botón copiar accesibles en la pestaña API.

**Commit:** `feat: genera snippets desde requests canónicas`

### C4. Edición de imagen Google síncrona

**Files:**

- Create: `apps/api/src/connectors/google-edit.ts`
- Test: `apps/api/src/connectors/google-edit.test.ts`
- Modify: `apps/api/src/connectors/index.ts`
- Modify: `apps/api/src/connectors/types.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/index.test.ts`
- Modify: `apps/api/src/openapi.ts`

**Entregables:**

- [x] Resolver conectores por `(provider, service)`, no solo por proveedor.
- [x] Validar MIME declarado, firma mágica y límite de 10 MB antes de llamar a Google.
- [x] Enviar texto + imagen inline y mapear la respuesta a `image-pair`.
- [x] Ejecutar edición en POST y devolver `200 COMPLETED`; no crear `task_id` con el upload.
- [x] Sanear/truncar errores externos, redactando key, base64 y URLs sensibles.
- [x] Documentar request multipart o JSON base64 — elegido JSON base64 por compartir
      contrato canónico entre Worker, adaptador y snippets sin un segundo serializer.

**Commit:** `feat: añade edición de imagen con google`

### C5. Veo: inicio, polling y descarga autenticada

**Files:**

- Create: `apps/api/src/connectors/google-video.ts`
- Test: `apps/api/src/connectors/google-video.test.ts`
- Modify: `apps/api/src/connectors/index.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/index.test.ts`
- Modify: `apps/api/src/openapi.ts`

**Entregables:**

- [x] Iniciar `predictLongRunning`, validar la operación y devolver `202` + `task_id` v2.
- [x] Consultar operaciones v2 sin reiniciar trabajos en cada GET.
- [x] Mapear progreso, error y resultado; redacción de secretos incluida.
- [x] Exponer descarga mediante endpoint propio con token opaco validado.
- [x] Permitir únicamente HTTPS y hosts/path de Google conocidos; bloquear redirects fuera de
      allowlist, IPs, hosts alternativos y paths manipulados.
- [x] Transmitir bytes con tipo/tamaño controlados y sin cache compartida.

**Commit:** `feat: integra generación de vídeo con veo`

### C6. Adaptador `platform` de doble flujo

**Files:**

- Modify: `packages/core/src/adapters/platform.ts`
- Test: `packages/core/src/adapters/platform.test.ts`
- Modify: `packages/core/src/factory.ts`
- Test: `packages/core/src/factory.test.ts`

**Entregables:**

- [x] Aceptar POST síncrono `200` y asíncrono `202`.
- [x] Polling de vídeo abortable: intervalo inicial recomendado por API, backoff ante 429,
      tope 30 s y timeout total 10 min.
- [x] No degradar a mock errores fatales ni una operación que ya pudo generar coste.
- [x] Descargar vídeo con header de key a Blob y entregar lifecycle explícito al consumidor.
- [x] Registrar traza real sin headers sensibles, base64 ni URLs firmadas.
- [x] Probar aborto durante POST, polling y descarga.

**Commit:** `feat: soporta ejecución síncrona y operaciones largas`

### C7. Formulario controlado y campos por servicio

**Files:**

- Create: `apps/web/src/ui/generation-draft.ts`
- Test: `apps/web/src/ui/generation-draft.test.ts`
- Modify: `apps/web/src/ui/generation-form.tsx`
- Modify: `apps/web/src/ui/generation-form.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/web/src/i18n/messages.ts`

**Entregables:**

- [x] Mover el formulario a un reducer controlado con defaults, URL y ejemplos como acciones
      explícitas.
- [x] Conservar prompt/campos compatibles al cambiar modelo; resetear solo estados inválidos.
- [x] Añadir upload con preview, sustitución, borrado, validación y mensajes accesibles.
- [x] Añadir duración/resolución/aspecto de vídeo y coste estimado recalculado.
- [x] Bloquear Google sin key y pedir confirmación informada antes de una operación de pago.
- [x] Avisar que abortar polling no garantiza cancelar ni reembolsar el trabajo del proveedor.

**Commit:** `feat: añade formulario de edición y vídeo`

### C8. Ejemplos por modelo sin llamadas live

**Files:**

- Create: `apps/web/src/examples.ts`
- Create: `apps/web/src/ui/example-gallery.tsx`
- Test: `apps/web/src/ui/example-gallery.test.tsx`
- Add: `apps/web/public/examples/*`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/i18n/messages.ts`

**Entregables:**

- [ ] Definir ejemplos tipados con id estable, modelo, patch de formulario y resultado local.
- [ ] Crear al menos un ejemplo propio por servicio y por familia inicial de modelo.
- [ ] “Usar ejemplo” hidrata draft y resultado sin invocar adaptador.
- [ ] Añadir alt text, dimensiones/aspect ratio y póster de vídeo para evitar layout shift.
- [ ] Optimizar assets y registrar licencia/procedencia propia en el documento.

**Commit:** `feat: incorpora ejemplos precargados sin coste`

### C9. Estado por URL y diálogo de compartir

**Files:**

- Create: `apps/web/src/ui/url-state.ts`
- Test: `apps/web/src/ui/url-state.test.ts`
- Create: `apps/web/src/ui/share-dialog.tsx`
- Test: `apps/web/src/ui/share-dialog.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/i18n/messages.ts`

**Entregables:**

- [ ] Serializar solo service/provider/model/prompt/aspect/seed/duration/resolution/example.
- [ ] Parsear con Zod, límites de longitud y enums del registry; ignorar campos desconocidos.
- [ ] Excluir key, upload, resultado, historial, blobs y task IDs de operaciones de pago.
- [ ] Hidratar antes del primer render útil y manejar `popstate`.
- [ ] Actualizar con `replaceState` y debounce; evitar bucles e historial del navegador ruidoso.
- [ ] Diálogo nativo con foco, Escape, copy feedback y explicación de lo omitido.

**Commit:** `feat: permite compartir configuración por url`

### C10. Viewers, descarga e historial efímero

**Files:**

- Create: `apps/web/src/ui/download-result.ts`
- Test: `apps/web/src/ui/download-result.test.ts`
- Create: `apps/web/src/ui/session-history.tsx`
- Test: `apps/web/src/ui/session-history.test.tsx`
- Modify: `apps/web/src/ui/result-panel.tsx`
- Modify: `apps/web/src/ui/result-panel.test.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/i18n/messages.ts`

**Entregables:**

- [ ] Renderizar imagen, antes/después y vídeo con controles nativos y poster.
- [ ] Descargar vía Blob, con MIME permitido y filename saneado.
- [ ] Mantener máximo 20 ejecuciones completadas/fallidas en memoria.
- [ ] Guardar resumen de parámetros y resultado, nunca key ni contenido del upload.
- [ ] Restaurar un resultado desde historial sin relanzar ni recuperar inputs secretos.
- [ ] Revocar todos los object URLs al sustituir, eliminar o desmontar.

**Commit:** `feat: añade descarga e historial de sesión`

### C11. Integración, accesibilidad y E2E

**Files:**

- Modify: `apps/web/src/app.test.tsx`
- Modify: `apps/api/src/index.test.ts`
- Modify: tests afectados en `packages/core/src/`
- Create: `apps/web/e2e/phase-c.spec.ts` si el harness E2E ya existe; si no, documentar el
  smoke test manual sin añadir framework en esta fase.

**Entregables:**

- [ ] Flujo mock completo de imagen, edición y vídeo.
- [ ] Ejemplo → edición → resultado → descarga → historial.
- [ ] URL → hidratación → cambio → back/forward → copy.
- [ ] Snippets fieles para los tres servicios y sin secretos.
- [ ] Estados 428/401/429/5xx, timeout, aborto y contenido bloqueado.
- [ ] Navegación solo teclado, lector de pantalla y reduced motion.
- [ ] Smoke live opt-in con key personal: una edición económica y un Veo Lite 4 s/720p,
      mostrando estimación antes de confirmar.

**Commit:** `test: cubre flujos completos de fase c`

### C12. Documentación y cierre

**Files:**

- Modify: `README.md`
- Modify: `docs/specs/2026-07-24-ai-playground-design.md`
- Modify: `docs/plans/2026-07-24-product-roadmap.md`
- Modify: `STATUS.md`
- Modify: `apps/api/src/openapi.ts`

**Entregables:**

- [ ] Enmendar la spec con ejecución dual, coste real y límites de vídeo.
- [ ] Documentar configuración de key/billing sin publicar ninguna key.
- [ ] Actualizar OpenAPI y verificarlo contra los schemas runtime.
- [ ] Documentar privacidad: qué sale del navegador, qué no se persiste y cómo borrar la key.
- [ ] Ejecutar suite completa y smoke de producción local; anotar comandos y resultados.
- [ ] Marcar C hecha y dejar D como siguiente acción en roadmap/STATUS.

**Commit:** `docs: cierra fase c`

## Fuera de alcance

- Audio, stock, iconos, prompt enhancers y nuevas familias de servicios.
- Formulario generado automáticamente desde OpenAPI o motor genérico de decenas de campos.
- Auth, cuentas, sincronización, historial persistente o almacenamiento server-side de medios.
- Fullscreen avanzado, zoom/pan, comparación con slider, multi-imagen e image-to-video.
- Cancelación garantizada de operaciones ya aceptadas por Google.
- Deploy público y presupuesto de bundle: pertenecen a Fase D.

## Definition of Done

- [ ] Los tres servicios funcionan con mock; edición y vídeo Google pasan tests contractuales.
- [ ] Al menos un smoke live opt-in de edición y uno de Veo Lite completan con key personal.
- [ ] Ninguna key, imagen subida o URL sensible aparece en Git, logs, task IDs, share URL,
      snippets o historial.
- [ ] Snippets y OpenAPI coinciden con requests reales.
- [ ] Descargas funcionan y no quedan object URLs vivos.
- [ ] URL compartida restaura únicamente estado seguro.
- [ ] Español/inglés en paridad y flujos críticos utilizables solo con teclado.
- [ ] Lint, format, typecheck, tests y build pasan desde checkout limpio.
- [ ] `README`, spec, roadmap y `STATUS.md` reflejan el producto real.
