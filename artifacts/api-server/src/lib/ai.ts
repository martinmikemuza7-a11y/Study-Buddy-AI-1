import { and, eq } from "drizzle-orm";
import { hasUnreadableCharacters, lexicalOverlap, normalizeStudyText } from "./textQuality";
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
  const terms = normalizeStudyText(prompt).toLowerCase().split(/\W+/).filter((term) => term.length > 2);
  return chunks
    .map((chunk) => ({
      ...chunk,
      content: normalizeStudyText(chunk.content),
      score: terms.reduce((score, term) => score + (chunk.content.toLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .filter((chunk) => !hasUnreadableCharacters(chunk.content))
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, 8);
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
  context: Array<{ id: number; materialId: number; name: string; content: string; page: number | null; slide: number | null }>,
) {
  if (!context.length) throw new Error("No course material is available for question generation");
  const contextText = context.map((item) => [
    "CHUNK_ID: " + item.id,
    "SOURCE_FILE: " + item.name,
    "PAGE: " + (item.page ?? ""),
    "SLIDE: " + (item.slide ?? ""),
    "CONTENT:\n" + normalizeStudyText(item.content),
  ].join("\n")).join("\n\n---\n\n");
  const content = await generateGeminiText(
    "Generate exactly one study question using ONLY the supplied course material. Never use filenames, binary data, hidden metadata, prior knowledge, or web knowledge as facts. Return JSON with prompt, options, correctAnswer, explanation, topic, sourceFile, and sourceExcerpt. sourceExcerpt MUST be an exact readable excerpt copied from one supplied CONTENT block. For true_false, options must be [\"True\",\"False\"] and correctAnswer must be exactly \"True\" or \"False\". For short_answer, options must be []. The explanation must be supported by sourceExcerpt. Never output replacement characters.",
    [{ text: "Question focus: " + prompt + "\nQuestion type: " + questionType + "\nDifficulty: " + difficulty + "\n\nSUPPLIED COURSE MATERIAL:\n" + contextText }],
    "application/json",
  );
  const question = parseJson<{ prompt: string; options: string[]; correctAnswer: string; explanation: string; topic?: string; sourceFile: string; sourceExcerpt: string }>(content);
  const clean = {
    prompt: normalizeStudyText(question.prompt ?? ""),
    options: Array.isArray(question.options) ? question.options.map(normalizeStudyText) : [],
    correctAnswer: normalizeStudyText(question.correctAnswer ?? ""),
    explanation: normalizeStudyText(question.explanation ?? ""),
    topic: normalizeStudyText(question.topic ?? ""),
    sourceFile: normalizeStudyText(question.sourceFile ?? ""),
    sourceExcerpt: normalizeStudyText(question.sourceExcerpt ?? ""),
  };
  if (!clean.prompt || !clean.correctAnswer || !clean.explanation || !clean.sourceFile || !clean.sourceExcerpt || hasUnreadableCharacters(JSON.stringify(clean))) {
    throw new Error("Gemini generated unreadable or incomplete question data");
  }
  const source = context.find((item) => item.name === clean.sourceFile && normalizeStudyText(item.content).includes(clean.sourceExcerpt));
  if (!source) throw new Error("Gemini cited an excerpt that is not present in the selected course material");
  if (questionType === "multiple_choice" && (clean.options.length < 3 || clean.options.length > 5 || !clean.options.includes(clean.correctAnswer))) {
    throw new Error("Gemini returned invalid multiple-choice options");
  }
  if (questionType === "true_false" && (clean.options.length !== 2 || !["True", "False"].includes(clean.correctAnswer))) {
    throw new Error("Gemini returned invalid true/false data");
  }
  if (questionType === "short_answer" && clean.options.length !== 0) throw new Error("Gemini returned options for a short-answer question");
  if (questionType === "short_answer" && lexicalOverlap(clean.correctAnswer, clean.sourceExcerpt) < 0.2) {
    throw new Error("Generated short-answer key is not sufficiently supported by the cited source excerpt");
  }
  if (lexicalOverlap(clean.explanation, clean.sourceExcerpt) < 0.15) {
    throw new Error("Generated explanation is not sufficiently grounded in the cited source excerpt");
  }
  return { ...clean, sourceMaterialId: source.materialId };
}
export async function generateAnswerFeedback(
  question: string,
  answer: string,
  correctAnswer: string,
  explanation: string,
) {
  const content = await generateGeminiText(
    "Evaluate the student's answer against the supplied verified answer. Return JSON with result (correct or incorrect), feedback, explanation, and correctAnswer. For short answers judge conceptual meaning, not exact wording. Do not expose hidden reasoning.",
    [{ text: `Question: ${question}\nStudent answer: ${answer}\nExpected answer: ${correctAnswer}\nReference explanation: ${explanation}` }],
    "application/json",
  );
  const feedback = parseJson<{ result: "correct" | "incorrect"; feedback: string; explanation: string; correctAnswer?: string }>(content);
  if (!["correct", "incorrect"].includes(feedback.result) || !feedback.feedback || !feedback.explanation) {
    throw new Error("Gemini returned incomplete answer feedback");
  }
  return {
    ...feedback,
    correctAnswer: normalizeStudyText(feedback.correctAnswer || correctAnswer) || correctAnswer,
    feedback: normalizeStudyText(feedback.feedback),
    explanation: normalizeStudyText(feedback.explanation),
  };
}

export async function extractBinaryDocumentWithGemini(buffer: Buffer, contentType: string): Promise<string> {
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("This document is too large for safe fallback extraction");
  const text = await generateGeminiText(
    "Extract only readable text from this educational document. Do not return binary bytes, file headers, encoded data, summaries, or invented content.",
    [{ inlineData: { mimeType: contentType, data: buffer.toString("base64") } }],
  );
  const normalized = normalizeStudyText(text);
  if (hasUnreadableCharacters(normalized)) throw new Error("Fallback document extraction produced unreadable characters");
  return normalized;
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