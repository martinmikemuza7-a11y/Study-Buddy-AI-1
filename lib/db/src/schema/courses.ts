import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  activeLearningEnabled: boolean("active_learning_enabled").notNull().default(false),
  activeLearningStartTime: text("active_learning_start_time").notNull().default("09:00"),
  activeLearningEndTime: text("active_learning_end_time").notNull().default("20:00"),
  activeLearningFrequencyMinutes: integer("active_learning_frequency_minutes").notNull().default(30),
  activeLearningQuestionCount: integer("active_learning_question_count").notNull().default(5),
  activeLearningQuestionType: text("active_learning_question_type").notNull().default("multiple_choice"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;