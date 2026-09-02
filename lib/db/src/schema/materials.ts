import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const materialsTable = pgTable("materials", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  objectPath: text("object_path").notNull(),
  status: text("status").notNull().default("processing"),
  statusMessage: text("status_message"),
  pageCount: integer("page_count"),
  indexedChunkCount: integer("indexed_chunk_count").notNull().default(0),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const materialChunksTable = pgTable("material_chunks", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  materialId: integer("material_id").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  content: text("content").notNull(),
  page: integer("page"),
  slide: integer("slide"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMaterialSchema = createInsertSchema(materialsTable).omit({
  id: true,
  uploadedAt: true,
  processedAt: true,
});
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;
export type Material = typeof materialsTable.$inferSelect;
export type MaterialChunk = typeof materialChunksTable.$inferSelect;