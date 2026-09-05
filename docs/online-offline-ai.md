# Study Buddy: online + offline AI

## Architecture

`AI Engine -> local provider -> course-scoped retrieval -> response`

The frontend no longer calls a hosted LLM provider. The browser-local provider is capability detected. Where Chrome's on-device `LanguageModel` API is unavailable, Study Buddy uses a transparent local retrieval mode instead of pretending that a generative model is running.

## Offline persistence

IndexedDB stores a per-user snapshot containing course metadata, material metadata, processed local chunks, study sessions, progress snapshots and chat history. A service worker caches the application shell so a previously opened installation can start without the network.

## Course isolation

The server knowledge endpoint verifies both the authenticated user ID and selected course ID before returning chunks. Queries also constrain joined material rows to the same owner and course. Client-side local retrieval receives only the selected course's saved chunks.

## Material processing

Online processing preserves the existing PDF/Word/PowerPoint extraction pipeline. Failed processing is reported as `failed` and is never promoted to `ready`.

Offline additions currently support text-like files directly in the browser. Image OCR is only used if a browser-local OCR runtime is present. PDF/DOC/DOCX/PPT/PPTX added while offline are not silently marked ready; they require the existing online processing pipeline.

## Local generative AI limitation

Chrome's Prompt API is hardware/browser dependent and, as of September 2026, is supported on qualifying desktop Chrome platforms rather than Chrome for Android. The model also needs an initial download before subsequent offline use. Therefore Android users should expect offline storage, retrieval and study scheduling to work, but generative local tutor responses are not claimed to work unless another compatible local runtime is installed.

## Web search

Web search is explicitly opt-in and disabled while offline. Course material remains the primary source. Web results are labelled separately from uploaded material.
