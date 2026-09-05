import { and, eq } from "drizzle-orm";
import { db, materialChunksTable, materialsTable } from "@workspace/db";

/** Server-side AI is intentionally provider-neutral. Generative inference now runs in the browser. */
export class AIUnavailableError extends Error {
  constructor() {
    super("No server-side LLM is configured. Use the local browser AI engine.");
  }
}

export type WebContext = { name: string; content: string; url: string };

export async function searchWeb(prompt: string): Promise<WebContext[]> {
  const searchUrl = new URL("https://en.wikipedia.org/w/api.php");
  searchUrl.search = new URLSearchParams({
    action: "opensearch",
    search: prompt,
    limit: "3",
    namespace: "0",
    format: "json",
    origin: "*",
  }).toString();
  const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(8_000) });
  if (!searchResponse.ok) return [];
  const result = (await searchResponse.json()) as [string, string[], string[], string[]];
  const titles = result[1] ?? [];
  const pages = await Promise.all(titles.map(async (title) => {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const page = (await response.json()) as { extract?: string; content_urls?: { desktop?: { page?: string } } };
    if (!page.extract || !page.content_urls?.desktop?.page) return null;
    return { name: title, content: page.extract, url: page.content_urls.desktop.page };
  }));
  return pages.filter((page): page is WebContext => Boolean(page));
}

/** Course-scoped lexical retrieval used by server endpoints and as the canonical RAG source list. */
export async function retrieveCourseContext(ownerId: string, courseId: number, prompt: string) {
  const chunks = await db.select({
    id: materialChunksTable.id,
    materialId: materialChunksTable.materialId,
    courseId: materialChunksTable.courseId,
    content: materialChunksTable.content,
    page: materialChunksTable.page,
    slide: materialChunksTable.slide,
    name: materialsTable.name,
  }).from(materialChunksTable)
    .innerJoin(materialsTable, eq(materialChunksTable.materialId, materialsTable.id))
    .where(and(
      eq(materialChunksTable.ownerId, ownerId),
      eq(materialChunksTable.courseId, courseId),
      eq(materialsTable.ownerId, ownerId),
      eq(materialsTable.courseId, courseId),
      eq(materialsTable.status, "ready"),
    ));

  const terms = prompt.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: terms.reduce((score, term) => score + (chunk.content.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export async function generateTutorAnswer(): Promise<never> {
  throw new AIUnavailableError();
}

export async function generateLearningQuestion(): Promise<never> {
  throw new AIUnavailableError();
}

export async function generateAnswerFeedback(): Promise<never> {
  throw new AIUnavailableError();
}

export async function extractImageText(): Promise<never> {
  throw new Error("Server-side image OCR is disabled because Study Buddy no longer sends course images to an external LLM. Use browser-local OCR when available.");
}
