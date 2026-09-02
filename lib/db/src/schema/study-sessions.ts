import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studySessionsTable = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  scheduledStart: timestamp("scheduled_start", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull().default("upcoming"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudySessionSchema = createInsertSchema(studySessionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertStudySession = z.infer<typeof insertStudySessionSchema>;
export type StudySession = typeof studySessionsTable.$inferSelect;