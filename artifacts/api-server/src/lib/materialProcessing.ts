import { extname } from "node:path";
import JSZip from "jszip";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { and, eq } from "drizzle-orm";
import { db, materialChunksTable, materialsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { extractImageText } from "./ai";

const storage = new ObjectStorageService();

function cleanText(text: string): string {
  return text.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
}

function chunkText(text: string, size = 1200): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const chunks: string[] = [];
  for (let start = 0; start < cleaned.length; start += size) {
    chunks.push(cleaned.slice(start, start + size));
  }
  return chunks;
}

async function extractText(buffer: Buffer, contentType: string, name: string): Promise<string> {
  const extension = extname(name).toLowerCase();
  if (contentType === "application/pdf" || extension === ".pdf") {
    const result = await pdfParse(buffer);
    return result.text;
  }
  if (
    contentType.includes("word") ||
    contentType.includes("officedocument.wordprocessingml") ||
    extension === ".docx" ||
    extension === ".doc"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (
    contentType.includes("presentation") ||
    contentType.includes("powerpoint") ||
    extension === ".pptx" ||
    extension === ".ppt"
  ) {
    const zip = await JSZip.loadAsync(buffer);
    const slideNames = Object.keys(zip.files).filter((file) => /^ppt\/slides\/slide\d+\.xml$/i.test(file));
    const slides = await Promise.all(
      slideNames.sort().map(async (file) => {
        const xml = await zip.files[file].async("text");
        return xml.replace(/<[^>]+>/g, " ");
      }),
    );
    return slides.join("\n");
  }
  if (contentType.startsWith("image/")) {
    return extractImageText(buffer, contentType);
  }
  return buffer.toString("utf8");
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
    const text = await extractText(buffer, material.contentType, material.name);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No readable text was found in this file");

    await db.delete(materialChunksTable).where(and(
      eq(materialChunksTable.materialId, material.id),
      eq(materialChunksTable.ownerId, material.ownerId),
    ));
    await db.insert(materialChunksTable).values(chunks.map((content, index) => ({
      ownerId: material.ownerId,
      courseId: material.courseId,
      materialId: material.id,
      chunkIndex: index,
      content,
      page: null,
      slide: null,
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