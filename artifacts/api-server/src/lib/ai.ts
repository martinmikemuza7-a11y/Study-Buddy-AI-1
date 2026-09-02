import OpenAI from "openai";
import { and, eq } from "drizzle-orm";
import { db, materialChunksTable, materialsTable } from "@workspace/db";

export class AIUnavailableError extends Error {
  constructor() {
    super("AI provider is not configured");
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

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIUnavailableError();
  return new OpenAI({ apiKey });
}

export async function retrieveCourseContext(ownerId: string, courseId: number, prompt: string) {
  const chunks = await db.select({
    id: materialChunksTable.id,
    materialId: materialChunksTable.materialId,
    content: materialChunksTable.content,
    page: materialChunksTable.page,
    slide: materialChunksTable.slide,
    name: materialsTable.name,
  }).from(materialChunksTable)
    .innerJoin(materialsTable, eq(materialChunksTable.materialId, materialsTable.id))
    .where(and(
      eq(materialChunksTable.ownerId, ownerId),
      eq(materialChunksTable.courseId, courseId),
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

export async function generateTutorAnswer(prompt: string, context: Array<{ name: string; content: string }>, mode?: string) {
  const contextText = context.length
    ? context.map((item) => `SOURCE: ${item.name}\n${item.content}`).join("\n\n")
    : "No ready course materials were found. Say so clearly and do not invent course-specific citations.";
  const response = await getClient().chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: "You are a concise, encouraging study tutor. Use the provided course material first. Never claim a source was uploaded unless it appears in the context. Do not expose internal reasoning. If the context is insufficient, say that plainly and answer only from general knowledge when appropriate. Ask one useful follow-up question when it helps.",
      },
      {
        role: "user",
        content: `Mode: ${mode ?? "explain"}\nStudent request: ${prompt}\n\nCourse material:\n${contextText}`,
      },
    ],
  });
  return response.choices[0]?.message?.content?.trim() ?? "I could not generate an answer.";
}

export async function generateLearningQuestion(
  prompt: string,
  questionType: string,
  difficulty: string,
  context: string,
) {
  const response = await getClient().chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 8192,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "Create one study question from the supplied course material. Return JSON with prompt, options (array of strings), correctAnswer, explanation, and topic. Do not use knowledge outside the material. For short_answer, options must be an empty array.",
      },
      {
        role: "user",
        content: `Type: ${questionType}; difficulty: ${difficulty}; focus: ${prompt}\n\nMaterial:\n${context}`,
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned no question");
  return JSON.parse(content) as {
    prompt: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    topic?: string;
  };
}

export async function generateAnswerFeedback(
  question: string,
  answer: string,
  correctAnswer: string,
  explanation: string,
) {
  const response = await getClient().chat.completions.create({
    model: "gpt-5.6-luna",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: "Evaluate a student's answer. Return only JSON with result (correct or incorrect), feedback, and explanation. Be concise, supportive, and do not reveal hidden reasoning.",
      },
      {
        role: "user",
        content: `Question: ${question}\nStudent answer: ${answer}\nExpected answer: ${correctAnswer}\nReference explanation: ${explanation}`,
      },
    ],
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned no feedback");
  return JSON.parse(content) as { result: "correct" | "incorrect"; feedback: string; explanation: string };
}