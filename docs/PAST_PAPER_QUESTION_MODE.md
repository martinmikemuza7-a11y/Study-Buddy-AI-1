# Past-paper question mode

This feature adds a separate workflow for extracting original examination questions and generating their answers independently.

## What changed

- Course materials now have a **Past-paper mode** action when processing is complete.
- **Extract original questions** asks Gemini to identify only questions present in the selected material. Each extracted question must include a source excerpt that can be found in the extracted paper text; invalid or unsupported items are discarded.
- Extracted questions are stored separately in `past_paper_questions`, including the source material ID, question number, options, marks when available, and source excerpt.
- **Generate answer separately** creates an answer and explanation using other uploaded course materials as the primary source. The past paper itself is excluded from the answer context. If the notes are insufficient, the answer should say so.
- The original active-learning workflow for generated practice questions remains separate and unchanged.

## Database setup

The new table is defined in `lib/db/src/schema/learning.ts`. Before using this feature in a deployed environment, apply the schema change to the same database used by the API server.

For a development database, from the repository root:

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/db push
```

Ensure `DATABASE_URL` points to the intended database before running the schema command. Review the target database first; do not run schema changes against production without a backup and an approved migration process. The equivalent SQL is in `lib/db/migrations/0003_past_paper_questions.sql`.

## How to use it

1. Open a course and upload both study notes and an examination paper.
2. Wait until the paper's status is **ready**.
3. On that paper's row, choose **Extract original questions**.
4. Review the extracted question list. Only questions verified against the extracted source text are saved.
5. Choose **Generate answer separately** on a question when you want an answer.
6. Upload useful notes separately if you want answers grounded in those notes.

If a paper is a scan with poor OCR, extraction may return no questions. Try a clearer PDF or image; the system deliberately does not invent missing paper questions.

## New API routes

All routes require the existing Clerk authentication and course ownership checks.

- `POST /api/courses/:courseId/materials/:materialId/past-paper/extract`
- `GET /api/courses/:courseId/materials/:materialId/past-paper/questions`
- `POST /api/courses/:courseId/materials/:materialId/past-paper/questions/:questionId/answer`

## Validation and deployment

Run from the repository root:

```bash
pnpm install --no-frozen-lockfile
pnpm test:study-pipeline
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/study-buddy-ai run build
```

This is still the existing monorepo application, not a self-contained Google AI Studio app. A ZIP can be uploaded as code context, but running the full application still requires its configured database, Clerk settings, object storage integration, and Gemini API key. Never put secrets in the ZIP or commit them to GitHub.
