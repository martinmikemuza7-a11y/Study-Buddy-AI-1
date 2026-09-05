import type { LocalChunk } from './localStore';

type LanguageModelSession = { prompt(input: string): Promise<string>; destroy?: () => void };
type LanguageModelApi = {
  availability(options?: unknown): Promise<string>;
  create(options?: unknown): Promise<LanguageModelSession>;
};

declare global {
  interface Window {
    LanguageModel?: LanguageModelApi;
  }
}

export type AIProvider = 'chrome-on-device' | 'local-retrieval';

export type RetrievedChunk = LocalChunk & { score: number };

export function retrieveLocalContext(chunks: LocalChunk[], prompt: string, limit = 6): RetrievedChunk[] {
  const terms = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  if (!terms.length) return chunks.slice(0, limit).map((chunk) => ({ ...chunk, score: 0 }));
  return chunks
    .map((chunk) => {
      const text = chunk.content.toLowerCase();
      const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
      return { ...chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function getLocalProvider(): Promise<AIProvider> {
  if (!window.LanguageModel) return 'local-retrieval';
  try {
    const availability = await window.LanguageModel.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    if (availability !== 'unavailable') return 'chrome-on-device';
  } catch {
    // The browser may expose the API but reject this capability on the device.
  }
  return 'local-retrieval';
}

async function promptWithChrome(system: string, user: string): Promise<string> {
  if (!window.LanguageModel) throw new Error('On-device generative AI is unavailable in this browser');
  const availability = await window.LanguageModel.availability({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
  if (availability === 'unavailable') throw new Error('On-device generative AI is unavailable on this device');
  const session = await window.LanguageModel.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  });
  try {
    return (await session.prompt(`${system}\n\n${user}`)).trim();
  } finally {
    session.destroy?.();
  }
}

function sourceBlock(context: RetrievedChunk[]): string {
  return context.map((chunk) => `SOURCE: ${chunk.name}${chunk.page ? `, page ${chunk.page}` : ''}${chunk.slide ? `, slide ${chunk.slide}` : ''}\n${chunk.content}`).join('\n\n');
}

function bestSentence(context: RetrievedChunk[], prompt: string): string {
  const terms = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2);
  const sentences = context.flatMap((chunk) => chunk.content.split(/(?<=[.!?])\s+/).map((sentence) => ({ sentence, chunk })));
  return sentences
    .map((item) => ({ ...item, score: terms.reduce((n, term) => n + (item.sentence.toLowerCase().includes(term) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score)[0]?.sentence ?? '';
}

export async function answerWithLocalAI(prompt: string, context: RetrievedChunk[], mode = 'explain'): Promise<{ answer: string; provider: AIProvider; sources: RetrievedChunk[] }> {
  const provider = await getLocalProvider();
  if (provider === 'chrome-on-device') {
    const answer = await promptWithChrome(
      'You are a concise study tutor. Use the supplied course material first. Never invent facts, sources, pages, or slides. If the material does not contain the answer, say that clearly. Do not expose hidden reasoning. Keep explanations educational and concise.',
      `Mode: ${mode}\nStudent question: ${prompt}\n\nCourse material:\n${sourceBlock(context) || 'No matching course material was found.'}`,
    );
    return { answer, provider, sources: context.filter((chunk) => chunk.score > 0) };
  }

  const sentence = bestSentence(context, prompt);
  if (!sentence) {
    return {
      answer: 'I could not find that in the course materials saved on this device. Connect while online to refresh the course knowledge, or ask about a topic that is already in your saved materials.',
      provider,
      sources: [],
    };
  }
  return {
    answer: `From your saved course material: ${sentence}\n\nI’m in local retrieval mode on this device, so I can point to relevant saved material but I cannot generate a new explanation without a local generative model.`,
    provider,
    sources: context.filter((chunk) => chunk.score > 0),
  };
}

export async function generateLocalQuestion(context: RetrievedChunk[], difficulty = 'beginner', type: 'multiple_choice' | 'true_false' | 'short_answer' = 'multiple_choice') {
  const provider = await getLocalProvider();
  const seed = context[0];
  if (!seed) throw new Error('No saved course material is available for a question');
  if (provider === 'chrome-on-device') {
    const raw = await promptWithChrome(
      'Create one study question only from the supplied course material. Return JSON only with prompt, options, correctAnswer, explanation, and topic. For true_false use exactly two options. For short_answer use an empty options array. Do not use knowledge outside the material.',
      `Type: ${type}\nDifficulty: ${difficulty}\nMaterial:\n${sourceBlock(context)}`,
    );
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')) as { prompt: string; options: string[]; correctAnswer: string; explanation: string; topic?: string };
    if (!parsed.prompt || !parsed.correctAnswer || !parsed.explanation || !Array.isArray(parsed.options)) throw new Error('Local model returned an incomplete question');
    return { ...parsed, provider, source: seed };
  }
  const text = seed.content.replace(/\s+/g, ' ').trim();
  const prompt = text.length > 180 ? `${text.slice(0, 177)}…` : text;
  return {
    prompt: `According to your saved material, what is the main idea of this passage?\n\n${prompt}`,
    options: [],
    correctAnswer: text,
    explanation: 'This question is generated by local retrieval because no on-device generative model is available.',
    topic: seed.name,
    provider,
    source: seed,
  };
}
