import { and, eq } from "drizzle-orm";
import { db, materialChunksTable, materialsTable } from "@workspace/db";

export class AIUnavailableError extends Error {
  constructor() {
    super("AI provider is not configured");
  }
}

export type WebContext = { name: string; content: string; url: string };

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

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

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AIUnavailableError();
  return apiKey;
}

async function generateGeminiText(
  systemInstruction: string,
  parts: GeminiPart[],
  responseMimeType?: "application/json",
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(getApiKey())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: 8192,
          ...(responseMimeType ? { responseMimeType } : {}),
        },
      }),
    },
  );

  const body = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${body.error?.message ?? "Unknown provider error"}`);
  }

  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("Gemini returned no content");
  return text;
}

function parseJson<T>(content: string): T {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized) as T;
  } catch {
    const start = normalized.indexOf("{");
    const end = normalized.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(normalized.slice(start, end + 1)) as T;
      } catch {
        // Fall through to the explicit error below.
      }
    }
    throw new Error("Gemini returned invalid JSON");
  }
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
  return generateGeminiText(
    "You are a concise, encouraging study tutor. Use the provided course material first. Never claim a source was uploaded unless it appears in the context. Do not expose internal reasoning. If the context is insufficient, say that plainly and answer only from general knowledge when appropriate. Ask one useful follow-up question when it helps.",
    [{ text: `Mode: ${mode ?? "explain"}\nStudent request: ${prompt}\n\nCourse material:\n${contextText}` }],
  );
}

export async function generateLearningQuestion(
  prompt: string,
  questionType: string,
  difficulty: string,
  context: string,
) {
  const content = await generateGeminiText(
    "Create one study question from the supplied course material. Return JSON with prompt, options (array of strings), correctAnswer, explanation, and topic. Do not use knowledge outside the material. For short_answer, options must be an empty array.",
    [{ text: `Type: ${questionType}; difficulty: ${difficulty}; focus: ${prompt}\n\nMaterial:\n${context}` }],
    "application/json",
  );
  const question = parseJson<{
    prompt: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    topic?: string;
  }>(content);
  if (!question.prompt || !Array.isArray(question.options) || !question.correctAnswer || !question.explanation) {
    throw new Error("Gemini returned an incomplete question");
  }
  return question;
}

export async function generateAnswerFeedback(
  question: string,
  answer: string,
  correctAnswer: string,
  explanation: string,
) {
  const content = await generateGeminiText(
    "Evaluate a student's answer. Return only JSON with result (correct or incorrect), feedback, and explanation. Be concise, supportive, and do not reveal hidden reasoning.",
    [{ text: `Question: ${question}\nStudent answer: ${answer}\nExpected answer: ${correctAnswer}\nReference explanation: ${explanation}` }],
    "application/json",
  );
  const feedback = parseJson<{ result: "correct" | "incorrect"; feedback: string; explanation: string }>(content);
  if (!["correct", "incorrect"].includes(feedback.result) || !feedback.feedback || !feedback.explanation) {
    throw new Error("Gemini returned incomplete answer feedback");
  }
  return feedback;
}

export async function extractImageText(buffer: Buffer, contentType: string): Promise<string> {
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error("Images larger than 10 MB cannot be processed for text extraction");
  }
  return generateGeminiText(
    "Extract all legible text from this image. Preserve headings, lists, equations, and meaningful line breaks where possible. Return only the extracted text. Do not describe the image or invent text.",
    [
      { text: "Extract the text from this course material image." },
      { inlineData: { mimeType: contentType, data: buffer.toString("base64") } },
    ],
  );
}