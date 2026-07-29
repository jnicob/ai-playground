# ai-playground

[![CI](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source console for multi-provider AI generation (image, image editing, video —
extensible), built as a pnpm monorepo with a task-based API of its own.

## Features

- **Task-based API of its own** (`POST /v1/services/{service}` → `task_id` →
  `GET /v1/tasks/{id}`) with a published OpenAPI document at `/openapi.json`. Stateless:
  the task id encodes the request, so every task id is deterministic and reproducible.
- **Providers**: `mock` (client-side, deterministic, works offline), `pollinations` (no
  key), `google` (Gemini image models, bring your own key — no free tier, cost warning
  shown).
- **Bring your own key**: kept in `sessionStorage` for the tab only, sent per request
  through a header, never stored server-side, never in the bundle or the URL.
- **Honest API trace**: the API tab shows the real request/poll/response cycle, not a
  mock-up.
- **Graceful degradation**: transient provider failures fall back to the mock adapter with
  a `live → mock` badge; auth and validation errors surface instead of being hidden.
- Semantic design tokens (dark/light, WCAG AA), i18n (en/es), explicit
  empty/loading/error states.

## Quickstart

```bash
pnpm install
pnpm run dev # apps/web (Vite) on localhost
pnpm run test # all workspaces
```

## Running the API locally

```bash
pnpm --filter @ai-playground/api run dev # http://localhost:8787
pnpm --filter @ai-playground/web run dev # set VITE_API_BASE_URL if the API is elsewhere
```

## Monorepo structure

- `packages/core` — shared domain: types, registry, Zod schemas, task contract and
  mock/platform adapters. No React or DOM dependencies.
- `apps/api` — Hono API on Cloudflare Workers: task endpoints, OpenAPI and server-side
  provider connectors.
- `apps/web` — Vite + React SPA: service rail, generation form, result panel with
  Preview/API tabs.

## Docs

- Product spec: [`docs/specs/2026-07-24-ai-playground-design.md`](docs/specs/2026-07-24-ai-playground-design.md)
- Phase roadmap: [`docs/plans/2026-07-24-product-roadmap.md`](docs/plans/2026-07-24-product-roadmap.md)
- Agent/contributor conventions: [`AGENTS.md`](AGENTS.md)
- Operational status: [`STATUS.md`](STATUS.md)

## Roadmap

| Phase | Scope                                                                                                                                                                                            | Status  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| A     | Monorepo bootstrap + mock walking skeleton + API `/health`                                                                                                                                       | done    |
| B     | Own task-based API (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) with OpenAPI + server-side connectors (pollinations, Google) + `platform` adapter + pass-through key panel | done    |
| C     | Feature parity: `edit-image` and `generate-video`, model examples, share-by-URL, multi-language code snippets, session history and result download                                               | planned |
| D     | Polish: a11y (axe), QA, bundle budget, deploy (Pages + Workers) and case-study integration                                                                                                       | planned |

## License

[MIT](LICENSE) © 2026 Nico Behm
