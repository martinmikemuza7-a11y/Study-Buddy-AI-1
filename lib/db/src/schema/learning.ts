import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const tutorHistoryTable = pgTable("tutor_history", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  prompt: text("prompt").notNull(),
  answer: text("answer").notNull(),
  sources: jsonb("sources").notNull().default([]),
  webUsed: text("web_used").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningQuestionsTable = pgTable("learning_questions", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  scheduledSessionId: integer("scheduled_session_id").notNull(),
  type: text("type").notNull(),
  prompt: text("prompt").notNull(),
  options: jsonb("options").notNull().default([]),
  correctAnswer: text("correct_answer").notNull(),
  explanation: text("explanation").notNull(),
  difficulty: text("difficulty").notNull().default("beginner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const learningResultsTable = pgTable("learning_results", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  courseId: integer("course_id").notNull(),
  questionId: integer("question_id").notNull(),
  question: text("question").notNull(),
  result: text("result").notNull(),
  difficulty: text("difficulty").notNull(),
  topic: text("topic"),
  answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTutorHistorySchema = createInsertSchema(tutorHistoryTable).omit({ id: true, createdAt: true });
export const insertLearningQuestionSchema = createInsertSchema(learningQuestionsTable).omit({ id: true, createdAt: true });
export const insertLearningResultSchema = createInsertSchema(learningResultsTable).omit({ id: true, answeredAt: true });
export type TutorHistory = typeof tutorHistoryTable.$inferSelect;
export type LearningQuestion = typeof learningQuestionsTable.$inferSelect;
export type LearningResult = typeof learningResultsTable.$inferSelect;
export type InsertTutorHistory = z.infer<typeof insertTutorHistorySchema>;
export type InsertLearningQuestion = z.infer<typeof insertLearningQuestionSchema>;
export type InsertLearningResult = z.infer<typeof insertLearningResultSchema>;