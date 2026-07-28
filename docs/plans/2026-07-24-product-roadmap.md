# ai-playground — roadmap de producto

Fuente de entrada de cada fase: `docs/specs/2026-07-24-ai-playground-design.md`. Cada fase
escribe su plan just-in-time con `superpowers:writing-plans` usando la spec como entrada.

| #   | Fase                                                                                                                                                                                                            | Estado    | Depende de |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- |
| A   | Bootstrap monorepo + walking skeleton mock + API `/health`                                                                                                                                                      | en curso  | —          |
| B   | API task-based propia (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) con OpenAPI + conectores server-side (pollinations, google imagen) + adaptador `platform` + panel de keys pass-through | pendiente | A          |
| C   | Servicios `edit-image` y `generate-video` + ejemplos precargados + share-by-URL                                                                                                                                 | pendiente | B          |
| D   | Polish (a11y, QA, deploy Pages + Workers)                                                                                                                                                                       | pendiente | C          |
