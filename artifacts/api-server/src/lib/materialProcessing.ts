import { extname } from "node:path";
import JSZip from "jszip";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { and, eq } from "drizzle-orm";
import { db, materialChunksTable, materialsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { extractBinaryDocumentWithGemini, extractImageText, extractPdfWithGemini } from "./ai";
import { hasUnreadableCharacters, normalizeStudyText } from "./textQuality";

const storage = new ObjectStorageService();
const PAGE_BREAK = "\n\n[[[PAGE_BREAK]]]\n\n";
const SLIDE_BREAK = "\n\n[[[SLIDE_BREAK]]]\n\n";

type ExtractedSection = {
  content: string;
  page?: number | null;
  slide?: number | null;
};

function chunkText(text: string, metadata: { page?: number | null; slide?: number | null }, size = 1400): ExtractedSection[] {
  const cleaned = normalizeStudyText(text);
  if (!cleaned) return [];
  const chunks: ExtractedSection[] = [];
  for (let start = 0; start < cleaned.length; start += size) {
    chunks.push({ content: cleaned.slice(start, start + size), page: metadata.page ?? null, slide: metadata.slide ?? null });
  }
  return chunks;
}

function extractPptxSlides(buffer: Buffer): Promise<ExtractedSection[]> {
  return JSZip.loadAsync(buffer).then(async (zip) => {
    const slideNames = Object.keys(zip.files)
      .filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file))
      .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0));

    const sections: ExtractedSection[] = [];
    for (const file of slideNames) {
      const xml = await zip.files[file].async("text");
      const textParts: string[] = [];
      const textRegex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi;
      let match: RegExpExecArray | null;
      while ((match = textRegex.exec(xml))) textParts.push(match[1]);
      const slideText = normalizeStudyText(textParts.join(" "));
      if (slideText) {
        const slide = Number(file.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
        sections.push({ content: slideText, page: null, slide });
      }
    }
    return sections;
  });
}

async function extractPdfSections(buffer: Buffer): Promise<ExtractedSection[]> {
  const result = await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      const content = await pageData.getTextContent();
      return content.items.map((item: any) => item.str ?? "").join(" ") + PAGE_BREAK;
    },
  });
  const raw = String(result.text ?? "");
  const pageParts = raw.split(/\[\[\[PAGE_BREAK\]\]\]/);
  if (pageParts.length > 1) {
    return pageParts.flatMap((part, index) => chunkText(part, { page: index + 1 }));
  }
  return chunkText(raw, {});
}

async function extractTextSections(buffer: Buffer, contentType: string, name: string): Promise<ExtractedSection[]> {
  const extension = extname(name).toLowerCase();

  if (contentType === "application/pdf" || extension === ".pdf") {
    try {
      const sections = await extractPdfSections(buffer);
      const combined = sections.map((section) => section.content).join(" ");
      if (combined && !hasUnreadableCharacters(combined)) return sections;
      const fallback = await extractPdfWithGemini(buffer);
      return [{ content: normalizeStudyText(fallback), page: null, slide: null }];
    } catch (error) {
      const fallback = await extractPdfWithGemini(buffer);
      return [{ content: normalizeStudyText(fallback), page: null, slide: null }];
    }
  }

  if (extension === ".pptx" || contentType.includes("presentationml.presentation")) {
    const slides = await extractPptxSlides(buffer);
    if (!slides.length) throw new Error("No readable slide text was found in this PowerPoint file");
    return slides.flatMap((slide) => chunkText(slide.content, slide));
  }

  if (extension === ".ppt") {
    return [{ content: await extractBinaryDocumentWithGemini(buffer, "application/vnd.ms-powerpoint"), page: null, slide: null }];
  }

  if (extension === ".docx" || contentType.includes("wordprocessingml.document")) {
    const result = await mammoth.extractRawText({ buffer });
    return chunkText(result.value, {});
  }

  if (extension === ".doc" || contentType === "application/msword") {
    const extractor = new WordExtractor();
    const document = await extractor.extract(buffer);
    return chunkText(document.getBody(), {});
  }

  if (contentType.startsWith("image/")) {
    return chunkText(await extractImageText(buffer, contentType), {});
  }

  if (contentType.startsWith("text/") || extension === ".txt" || extension === ".md" || extension === ".csv") {
    return chunkText(buffer.toString("utf8"), {});
  }

  throw new Error("Unsupported study file type. Upload PDF, PPTX, DOC/DOCX, TXT, JPG, JPEG, or PNG.");
}

export async function processMaterial(material: {
  id: number;
  ownerId: string;
  courseId: number;
  name: string;
  contentType: string;
  objectPath: string;
}): Promise<void> {
  try {
    const file = await storage.getObjectEntityFile(material.objectPath);
    const [buffer] = await file.download();
    const sections = await extractTextSections(buffer, material.contentType, material.name);
    const chunks = sections;

    if (!chunks.length) throw new Error("No readable text was found in this file");

    const normalized = chunks.map((chunk) => normalizeStudyText(chunk.content));
    if (normalized.some((text) => hasUnreadableCharacters(text))) {
      throw new Error("The document parser produced unreadable characters. The file was not indexed to prevent corrupted study questions.");
    }

    await db.delete(materialChunksTable).where(and(
      eq(materialChunksTable.materialId, material.id),
      eq(materialChunksTable.ownerId, material.ownerId),
    ));

    await db.insert(materialChunksTable).values(chunks.map((chunk, index) => ({
      ownerId: material.ownerId,
      courseId: material.courseId,
      materialId: material.id,
      chunkIndex: index,
      content: normalizeStudyText(chunk.content),
      page: chunk.page ?? null,
      slide: chunk.slide ?? null,
    })));

    await db.update(materialsTable).set({
      status: "ready",
      statusMessage: null,
      indexedChunkCount: chunks.length,
      processedAt: new Date(),
    }).where(and(
      eq(materialsTable.id, material.id),
      eq(materialsTable.ownerId, material.ownerId),
      eq(materialsTable.courseId, material.courseId),
    ));
  } catch (error) {
    await db.update(materialsTable).set({
      status: "failed",
      statusMessage: error instanceof Error ? error.message : "Processing failed",
      indexedChunkCount: 0,
      processedAt: new Date(),
    }).where(and(
      eq(materialsTable.id, material.id),
      eq(materialsTable.ownerId, material.ownerId),
      eq(materialsTable.courseId, material.courseId),
    ));
  }
}
