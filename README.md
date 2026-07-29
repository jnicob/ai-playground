# ai-playground

[![CI](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml/badge.svg)](https://github.com/jnicob/ai-playground/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Open-source console for multi-provider AI generation (image, image editing, video —
extensible), built as a pnpm monorepo with a task-based API of its own.

## Features

- **Dual execution API**: image generation and Veo use
  `POST /v1/services/{service}` → `202 task_id` → `GET /v1/tasks/{id}`; image editing can
  complete synchronously with `200`. Veo task IDs contain only a validated operation
  reference. OpenAPI is published at `/openapi.json`.
- **Providers**: `mock` (client-side, deterministic, works offline), `pollinations` (no
  key), `google` (Gemini image/edit models and Veo, bring your own key — no free tier,
  estimate and confirmation shown before paid generation).
- **Bring your own key**: kept in `sessionStorage` for the tab only, sent per request
  through a header, never stored server-side, never in the bundle or the URL.
- **Honest API trace**: the API tab shows the real request/poll/response cycle, not a
  mock-up.
- **Three complete services**: controlled forms for image, image editing (PNG/JPEG/WebP,
  10 MiB) and video (4/6/8 s, 720p, 16:9 or 9:16), with local examples that never call a
  paid provider.
- **Safe sharing and ephemeral history**: the URL contains only validated form
  configuration; results, uploads, keys, blobs and operation IDs are omitted. History
  stays in memory, retains at most 20 entries and owns the lifecycle of video Blob URLs.
- **Result tools**: image, before/after and native video viewers; Blob downloads with
  MIME/size/filename validation; cURL, JavaScript and Python snippets without secrets.
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

## Personal Google key and billing

Google image and Veo models have no free tier in this project. Use only a personal Google
AI Studio key with your own billing. Select `google`, enter the key in the inline panel and
review the model/cost estimate before confirming. The key stays in `sessionStorage` for the
current tab, travels in `x-provider-key`, and is never stored by the API. Use **Clear key**
when finished.

Live smoke tests are opt-in and never run in CI. Current procedure and estimates:
[`docs/testing/phase-c-smoke.md`](docs/testing/phase-c-smoke.md).

## Privacy

- The provider receives the prompt, selected parameters and, for editing, the source image.
- The API passes the personal key through in a request header and does not persist it.
- Keys, uploads, provider URLs and paid operation IDs are excluded from share URLs,
  snippets and session history.
- Uploaded media and history exist only in browser memory. Closing the tab clears both;
  **Clear key** removes the provider key immediately.
- Completed Veo bytes are proxied through an authenticated, `private, no-store` download
  and represented in the browser by a revocable Blob URL.

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

| Phase | Scope                                                                                                                                                                                            | Status                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| A     | Monorepo bootstrap + mock walking skeleton + API `/health`                                                                                                                                       | done                                 |
| B     | Own task-based API (`POST /v1/services/{service}` → `task_id` → `GET /v1/tasks/{id}`) with OpenAPI + server-side connectors (pollinations, Google) + `platform` adapter + pass-through key panel | done                                 |
| C     | Feature parity: `edit-image` and `generate-video`, model examples, share-by-URL, multi-language code snippets, session history and result download                                               | implemented; paid live smoke pending |
| D     | Polish: a11y (axe), QA, bundle budget, deploy (Pages + Workers) and case-study integration                                                                                                       | planned                              |

## License

[MIT](LICENSE) © 2026 Nico Behm
