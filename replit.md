# Study Buddy AI

Study Buddy AI is a private, mobile-first learning workspace for organizing course materials, planning study time, and asking a course-aware tutor for help.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, managed Clerk keys, and private object-storage variables
- Optional env: `OPENAI_API_KEY` enables tutor and Active Learning generation; without it those features return an explicit unavailable response

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/study-buddy-ai/src/App.tsx` — authenticated routes, responsive shell, course workspace, study plan, tutor, and branded Clerk screens
- `artifacts/study-buddy-ai/src/index.css` — Study Buddy visual system and responsive layout
- `artifacts/api-server/src/routes/study.ts` — protected course, material, session, tutor, progress, and Active Learning API routes
- `artifacts/api-server/src/lib/materialProcessing.ts` — private object download, document extraction, chunking, and processing lifecycle
- `lib/api-spec/openapi.yaml` — source of truth for generated client hooks and Zod response schemas
- `lib/db/src/schema/` — Drizzle tables for courses, materials/chunks, sessions, tutor history, and adaptive learning results

## Architecture decisions

- Clerk browser auth uses same-origin session cookies; API ownership checks are applied to every course-scoped route.
- Materials are uploaded directly to private object storage with a short-lived presigned URL; PostgreSQL stores metadata and object paths.
- Material processing is explicit: files remain `processing` until extraction and chunk indexing succeed, otherwise they become `failed` with a user-visible reason.
- Retrieval is always filtered by both authenticated owner and selected course before tutor context is built.
- Active Learning is generated only when the learner starts an existing scheduled session; it is not a permanent dashboard prompt.

## Product

Authenticated learners can create unlimited courses, upload course-specific PDFs, Word files, slide decks, and text, see real processing states, manage study sessions, review adaptive progress, ask a tutor with uploaded-material sources, optionally add real Wikipedia context, and start scheduled Active Learning questions.

## User preferences

- Keep the learning experience mobile-first, calm, direct, and free of fake AI answers, fake processing states, or invented citations.

## Gotchas

- Generated Zod schemas use `zod/v4`; keep the workspace Zod catalog on v4 before rerunning API codegen.
- The public API health check is `/api/healthz`; all study data routes require Clerk authentication.
- The AI provider is intentionally optional in development because the workspace may not have a configured provider.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
