# ai-playground

[![CI](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source console for multi-provider AI generation (image, image editing, video —
extensible), built as a pnpm monorepo with a task-based API of its own.

This is **phase A**: a walking skeleton, end-to-end, with a deterministic mock provider.
There is no live provider yet — see [Roadmap](#roadmap).

## Features (phase A)

- Deterministic **mock provider**: generate an image without any API key, offline, with
  reproducible results.
- Semantic design tokens (dark/light) driven by CSS variables and `data-theme`, WCAG AA
  contrast.
- **i18n** in Spanish and English across the whole UI.
- **API trace view**: the result panel's `API` tab renders the task-based request/response
  cycle (`POST` → `IN_PROGRESS` → polling `GET` → `COMPLETED`) as it will look once a real
  provider is wired in.

## Quickstart

```bash
pnpm install
pnpm run dev     # apps/web (Vite) on localhost
pnpm run test    # all workspaces
```

## Monorepo structure

- `packages/core` — shared domain: types, declarative service/provider registry, Zod
  schemas, mock adapter. No React, no browser APIs.
- `apps/api` — Hono API on Cloudflare Workers (currently just `/health`; the task-based
  endpoints land in phase B).
- `apps/web` — Vite + React SPA: service rail, generation form, result panel with
  Preview/API tabs.

## Docs

- Product spec: [`docs/specs/2026-07-24-ai-playground-design.md`](docs/specs/2026-07-24-ai-playground-design.md)
- Phase roadmap: [`docs/plans/2026-07-24-product-roadmap.md`](docs/plans/2026-07-24-product-roadmap.md)
- Agent/contributor conventions: [`AGENTS.md`](AGENTS.md)
- Operational status: [`STATUS.md`](STATUS.md)

## Roadmap

| Phase | Scope                                                                                                                                                                                                   | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A     | Monorepo bootstrap + mock walking skeleton + API `/health`                                                                                                                                              | done    |
| B     | Own task-based API (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) with OpenAPI + server-side connectors (pollinations, Google Imagen) + `platform` adapter + pass-through key panel | planned |
| C     | `edit-image` and `generate-video` services + preloaded examples + share-by-URL                                                                                                                          | planned |
| D     | Polish (a11y, QA, Pages + Workers deploy)                                                                                                                                                               | planned |

## License

[MIT](LICENSE) © 2026 Nico Behm
