# AGENTS.md — ai-playground

Fuente de instrucciones para cualquier agente de IA (Claude Code, Codex, Gemini CLI, Cursor…)
en este repo. `CLAUDE.md` es un symlink a este archivo. Nunca edites la copia symlinked.

## Qué es este repo

Consola open-source de generación de IA multi-proveedor (imagen, edición de imagen, vídeo —
extensible). Monorepo pnpm: `apps/web` (SPA Vite + React), `apps/api` (Hono sobre Cloudflare
Workers, API propia task-based) y `packages/core` (dominio compartido: tipos, registry, Zod,
adaptador mock).

- Spec de producto: `docs/specs/2026-07-24-ai-playground-design.md`
- Roadmap de fases: `docs/plans/2026-07-24-product-roadmap.md`
- Estado operativo: `STATUS.md`

## Comandos

| Acción | Comando |
| --- | --- |
| Lint | `pnpm run lint` |
| Format (check) | `pnpm run format` |
| Format (fix) | `pnpm run format:fix` |
| Typecheck | `pnpm run typecheck` |
| Tests | `pnpm run test` |
| Build | `pnpm run build` |
| Dev (web) | `pnpm run dev` |

## Hard rules

- TypeScript strict en todos los workspaces (`web`, `api`, `core`).
- `packages/core` no depende de React ni de APIs de navegador; `apps/web` y `apps/api`
  dependen de `core`, nunca al revés.
- Colores solo por tokens semánticos: CSS vars + `data-theme`. Nunca colores hardcodeados.
- Cero dependencias privadas o de empresa; solo OSS público o código propio.
- Nunca secretos en el repo ni en el bundle. Las API keys de usuario viajan
  navegador → API del proveedor (o pass-through por header a `apps/api`); nunca se
  persisten server-side ni se commitean.
- i18n es/en en toda la UI.
- WCAG AA en componentes interactivos.
- TDD: test en rojo → implementación mínima → verde. Commits convencionales
  (`tipo: descripción`, feat/fix/docs/refactor/test/chore).

## Skills

- Al añadir un proveedor o servicio de generación nuevo: `skills/adding-a-provider/SKILL.md`.
