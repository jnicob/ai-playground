# ai-playground — spec de producto

> Estado: aprobada en brainstorm 2026-07-24 (2 rondas: diseño inicial + revisión de arquitectura).
> Este documento fija el diseño base del producto: consola genérica de generación de IA
> multi-proveedor, monorepo pnpm con API propia task-based.

## 0. Decisiones fundacionales

| Tema               | Decisión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Producto           | **Playground genérico multi-proveedor** de generación de IA, no ligado a ningún proveedor concreto. Sin links a docs por servicio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Proveedores v1     | `mock` (default, client-side, determinista) · `pollinations` (sin key, tier gratuito) · `google` (modelos Gemini de imagen con key del usuario, sin free tier y con aviso explícito de coste en cada generación; Veo queda en fase C)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| API keys           | Panel inline que pide la key al seleccionar un proveedor que la requiere; se guarda **por proveedor en `sessionStorage`** (dura la navegación); sin cuentas/login. La key solo viaja navegador → API propia → proveedor mediante headers; jamás entra en el bundle, la URL o el `task_id`, ni se persiste en el servidor propio                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Patrón declarativo | Un archivo declarativo por servicio con schema + ejemplos + metadatos, consumido por factories (patrón habitual en plataformas de API con muchos modelos/servicios) → registry `PlaygroundService`. Skill `adding-a-provider` (checklist para dar de alta un proveedor) + kit de skills de proceso propio del repo                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Arquitectura       | **Híbrido con API propia**: monorepo pnpm — `apps/web` (SPA Vite + React), `apps/api` (Hono sobre Cloudflare Workers) y `packages/core` (dominio compartido: tipos, registry, Zod, mock). API propia **task-based** (`POST /v1/services/{service}` → `{task_id}` → `GET /v1/tasks/{id}`) con spec OpenAPI publicada; los conectores a proveedores live viven server-side (elimina el techo de CORS y hace real la pestaña API); el **mock sigue client-side** (funciona offline sin API). Keys del usuario: pass-through por header por request, nunca almacenadas server-side (documentado en la UI). Razón: es una demostración end-to-end completa (spec → server → API task-based → frontend consumidor) y el free tier de Workers mantiene el coste ≈ 0 € |

Decisiones adicionales vigentes: assets mock híbridos (set dedicado propio del repo), modelos
con IDs reales del proveedor, factory + hook propio, rail de servicios, ejemplos precargados,
share-by-URL reproducible, traza task-based en pestaña API, estados explícitos, badge de
origen honesto.

## 1. Producto

Consola genérica de generación de IA: sidebar de servicios (generar imagen, editar imagen,
generar vídeo — extensible), form de parámetros renderizado desde definición declarativa,
panel de resultado con tabs **Preview | API** (traza task-based estilo API reference),
visor por tipo de salida (`MediaLightbox`, `CompareSlider` de `@nicobehm/media-kit`),
ejemplos precargados, share-by-URL reproducible, gestión de API keys por proveedor.

## 2. Dominio (puerto/adaptador)

- `GenerationRequest` `{ service, provider, prompt, model, aspectRatio, seed? }` (+ imagen
  base entre muestras en edición; sin upload de usuario en v1).
- `GenerationResult`: unión discriminada `image | image-pair | video` + metadatos
  (`provider`, `degraded`, `elapsedMs`, `apiTrace`).
- `ApiTrace`: secuencia tipada del ciclo task-based (POST → `IN_PROGRESS` → polling GET →
  `COMPLETED`). En Google/Veo es el ciclo long-running real; en mock, simulada pero fiel.
- **Registry declarativo**: `PlaygroundService = { id, label, icon, schema (Zod), parameters,
examples }` × `Provider = { id, label, auth: 'none' | 'api-key', models por servicio,
adapter }`. Añadir proveedor = definición + adaptador (skill `adding-a-provider`).
- **Puerto** `GenerationService.generate(request, signal?)`; factory que resuelve el
  adaptador por proveedor seleccionado; decorador `withMockFallback(live, mock)`
  (timeout 120 s para `platform` o error transitorio → mock con `degraded: true`).
- Adaptadores v1: `mock` client-side (determinista contra manifiesto de assets, no puede
  fallar) y `platform` client-side que consume la **API propia** (`apps/api`); los
  conectores reales a proveedores (`pollinations` — verificar lista viva de modelos del tier
  gratuito en el plan —, `google` Gemini/Veo con key del usuario en pass-through) viven
  server-side detrás de la API task-based. Los errores fatales de auth, validación o
  contenido se muestran al usuario; solo los fallos transitorios degradan a mock.

## 3. UI

- 3 zonas: rail de servicios · form dinámico (prompt, modelo por proveedor, aspect ratio
  1:1 | 16:9 | 9:16, grupo Avanzado con seed + aleatorio) · panel resultado Preview | API.
- Selector de proveedor visible (mock | pollinations | google) con badge de auth; panel
  «API key requerida» inline cuando falta (input tipo password, guardar/borrar,
  explicación de que solo vive en `sessionStorage`).
- Estados `empty | loading | error | success` explícitos; badge de origen
  `mock / live / live → mock`; cancelación con `AbortSignal`.
- Share-by-URL: parámetros en query string (nunca la API key); seed efectivo siempre
  incluido → toda URL compartida es reproducible en mock.
- WCAG AA, i18n es/en, theming con tokens semánticos propios (sistema de diseño propio de
  este repo, recreado desde cero).

## 4. Calidad

- TDD estricto: unit de dominio (factory, fallback, catálogo mock exhaustivo, URLs/payloads
  por proveedor contra fetch mockeado, schemas, query string) + Testing Library de UI
  (estados, keys, form dinámico, a11y).
- Riesgos: listas de modelos cambian (catálogo en un módulo; verificación en plan) ·
  coste Veo (opt-in con confirmación explícita) · CORS de proveedores (verificar en plan;
  Gemini API funciona browser-side, Pollinations tiene CORS `*`).

## 5. Enmiendas verificadas (fase B, 2026-07-29)

- **Google no tiene free tier de imagen** (pricing oficial: "Not available",
  ~$0.039/imagen). La fila «Proveedores v1» de §0 asumía ~500 img/día gratis: queda
  corregida. Consecuencia: el aviso de coste explícito que la spec reservaba para vídeo
  se aplica a **todo** el proveedor google, mostrado en el panel de API key antes de poder
  generar.
- **Catálogo de pollinations declarado, no descubierto**: su endpoint `/models` es
  inconsistente con los modelos que acepta `/prompt`; el registry declara `flux` y
  `turbo`, ambos verificados respondiendo 200.
- **Aspect ratio en google**: el body verificado no expone control de aspect ratio para
  estos modelos; se transmite como sugerencia en el prompt y las dimensiones reales
  quedan desconocidas. Por eso `width`/`height` son opcionales en el contrato y la UI no
  declara atributos que no conoce.
- **API stateless**: el `task_id` es la request canónica codificada (base64url, prefijo
  `v1.`), así que no hay almacenamiento de tareas. Efecto colateral deseado: todo
  `task_id` es determinista y reproducible.
- **Timeout del adaptador**: el endpoint de generación es síncrono y puede tardar más de
  20 s. El adaptador `platform` espera hasta 120 s antes de degradar a mock para no
  ocultar una generación real válida.

## 6. Enmiendas verificadas (fase C, 2026-07-29)

- **Ejecución dual**: `edit-image` puede responder `200 COMPLETED`; imagen y Veo pueden
  responder `202 IN_PROGRESS`. Veo usa una referencia de operación validada en `task_id`
  v2, polling desde 10 s con backoff hasta 30 s y timeout total de 10 min. Una operación
  de pago aceptada nunca degrada a mock ni se reinicia.
- **Edición con upload efímero**: la restricción «sin upload de usuario en v1» queda
  reemplazada. La UI acepta PNG/JPEG/WebP hasta 10 MiB, valida MIME y firma, mantiene el
  base64 solo en memoria y lo excluye de task IDs, URL, snippets e historial.
- **Veo y coste real**: Google Veo admite 16:9/9:16, 4/6/8 s y 720p. El catálogo declara
  Lite USD 0.05/s, Fast USD 0.10/s y Standard USD 0.40/s, con pricing verificado el
  2026-07-29. La UI recalcula la estimación y exige confirmación explícita.
- **Descarga de vídeo**: la API nunca expone la URI del proveedor. Devuelve un endpoint
  propio autenticado, con allowlist HTTPS, token acotado, MP4 máximo 100 MiB, redirects
  bloqueados y `Cache-Control: private, no-store`. El cliente crea y revoca el Blob URL.
- **UI implementada sin dependencia privada**: viewers nativos cubren imagen,
  antes/después y vídeo; no se usa `@nicobehm/media-kit`. Los ejemplos reutilizan assets
  propios locales y no invocan adapters.
- **URL e historial seguros**: share serializa exclusivamente
  `service/provider/model/prompt/aspect/seed/duration/resolution/example`, validado con
  Zod y registry. Keys, uploads, resultados, blobs y operaciones quedan fuera. El
  historial es solo memoria, máximo 20 entradas, sin trazas/task IDs ni URLs sensibles.
- **Accesibilidad**: tabs con semántica/teclado, diálogo nativo con foco/Escape, feedback
  `aria-live`, foco visible, contraste AA y `prefers-reduced-motion`.
