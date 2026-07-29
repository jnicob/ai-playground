# ai-playground — roadmap de producto

Fuente de entrada de cada fase: `docs/specs/2026-07-24-ai-playground-design.md`. Cada fase
escribe su plan just-in-time con `superpowers:writing-plans` usando la spec como entrada.

| #   | Fase                                                                                                                                                                                                                                       | Estado    | Depende de |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------- |
| A   | Bootstrap monorepo + walking skeleton mock + API `/health`                                                                                                                                                                                 | hecha     | —          |
| B   | API task-based propia (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) con OpenAPI + conectores server-side (pollinations, google imagen) + adaptador `platform` + panel de keys pass-through                            | hecha     | A          |
| C   | Paridad de features: `edit-image` y `generate-video`, ejemplos precargados por modelo, share-by-URL, snippets de código multi-lenguaje (cURL/JS/Python) en la pestaña API, historial de generaciones de la sesión y descarga del resultado | pendiente | B          |
| D   | Polish: a11y (axe), QA, presupuesto de bundle, deploy (Pages + Workers) e integración como caso de estudio                                                                                                                                 | pendiente | C          |
