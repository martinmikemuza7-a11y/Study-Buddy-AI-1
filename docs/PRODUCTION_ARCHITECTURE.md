# Study Buddy AI — Production Architecture

## Current audit
- Monorepo/workspaces using pnpm and TypeScript.
- Web client is Vite/React; API is Express 5; DB uses Drizzle ORM with PostgreSQL.
- Authentication is already wired through Clerk middleware.
- Existing AI service calls Gemini only from the API server and reads `GEMINI_API_KEY` from the server environment.
- Existing course/material/tutor/study-session/learning routes already enforce owner/course scoping in the API.
- Existing material chunks are stored in PostgreSQL, but retrieval is currently lexical keyword matching rather than embeddings/vector search.
- Existing material schema lacks the requested first-class Subject/Folder/DocumentChunk embedding metadata model.

## Target architecture
`UI -> Local Repository -> Sync Queue -> Secure API -> RAG -> AIEngine`

AIEngine providers:
- OnlineAIProvider: Gemini through the backend only.
- OfflineAIProvider: optional local model runtime; if no supported runtime/model is installed, expose the explicit `Offline — AI unavailable` state rather than pretending local AI exists.

Offline-first storage:
- Native Android/Windows: local SQLite repository with FTS/BM25 retrieval; optional local embeddings/vector index when device capability permits.
- Web/PWA: IndexedDB + FTS-compatible local retrieval where browser APIs allow; native-only features are capability-gated.

RAG invariants:
1. Every retrieval request contains an explicit courseId and optional subject/folder/document filters.
2. All returned chunks must match the authenticated owner and selected course.
3. Prompt context contains only top-ranked chunks, never complete documents.
4. Source metadata is copied from stored chunk metadata; page/slide values are never inferred.
5. If no qualifying chunk is found, the response must state that it could not verify the answer from selected study materials.
6. Web research is a separate context/source class and is never presented as uploaded material.

## Packaging
Tauri 2 is the desktop/mobile shell so the existing React UI can be reused without shipping a shortcut. Windows produces NSIS/MSI installers. Android produces an APK. The same web client remains deployable as a PWA.

## Important implementation note
A production offline AI model cannot be honestly enabled by configuration alone. The app must ship/download a compatible quantized model and runtime, with device capability checks. Until that runtime is available, offline RAG, stored questions, scheduling and local answer checks remain available and the status indicator must show `Offline — AI unavailable`.
