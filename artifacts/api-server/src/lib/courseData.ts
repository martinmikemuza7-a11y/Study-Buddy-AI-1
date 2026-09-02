import { and, asc, desc, eq } from "drizzle-orm";
import {
  coursesTable,
  db,
  learningResultsTable,
  materialsTable,
  studySessionsTable,
} from "@workspace/db";

export const defaultActiveLearning = {
  enabled: false,
  startTime: "09:00",
  endTime: "20:00",
  frequencyMinutes: 30,
  questionCount: 5,
  questionType: "multiple_choice" as const,
};

export async function findOwnedCourse(ownerId: string, courseId: number) {
  const [course] = await db.select().from(coursesTable).where(and(
    eq(coursesTable.id, courseId),
    eq(coursesTable.ownerId, ownerId),
  ));
  return course;
}

export async function getCourseView(ownerId: string, courseId: number) {
  const course = await findOwnedCourse(ownerId, courseId);
  if (!course) return null;
  const materials = await db.select().from(materialsTable).where(and(
    eq(materialsTable.courseId, courseId),
    eq(materialsTable.ownerId, ownerId),
  ));
  const sessions = await db.select().from(studySessionsTable).where(and(
    eq(studySessionsTable.courseId, courseId),
    eq(studySessionsTable.ownerId, ownerId),
    eq(studySessionsTable.status, "upcoming"),
  )).orderBy(asc(studySessionsTable.scheduledStart)).limit(1);
  const results = await db.select({ result: learningResultsTable.result })
    .from(learningResultsTable)
    .where(and(
      eq(learningResultsTable.courseId, courseId),
      eq(learningResultsTable.ownerId, ownerId),
    ));
  const answered = results.filter((result) => result.result === "correct" || result.result === "incorrect");
  const correct = answered.filter((result) => result.result === "correct").length;
  return {
    id: course.id,
    name: course.name,
    description: course.description,
    materialCount: materials.length,
    readyMaterialCount: materials.filter((material) => material.status === "ready").length,
    progress: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    nextSession: sessions[0] ? sessionView(sessions[0], course.name) : null,
    activeLearning: {
      enabled: course.activeLearningEnabled,
      startTime: course.activeLearningStartTime,
      endTime: course.activeLearningEndTime,
      frequencyMinutes: course.activeLearningFrequencyMinutes,
      questionCount: course.activeLearningQuestionCount,
      questionType: course.activeLearningQuestionType,
    },
    createdAt: course.createdAt,
    updatedAt: course.updatedAt,
  };
}

export function sessionView(session: typeof studySessionsTable.$inferSelect, courseName: string) {
  return {
    id: session.id,
    courseId: session.courseId,
    courseName,
    title: session.title,
    scheduledStart: session.scheduledStart,
    durationMinutes: session.durationMinutes,
    status: session.status,
  };
}

export async function listOwnedSessions(ownerId: string, courseId: number) {
  const course = await findOwnedCourse(ownerId, courseId);
  if (!course) return null;
  const sessions = await db.select().from(studySessionsTable).where(and(
    eq(studySessionsTable.courseId, courseId),
    eq(studySessionsTable.ownerId, ownerId),
  )).orderBy(desc(studySessionsTable.scheduledStart));
  return sessions.map((session) => sessionView(session, course.name));
}