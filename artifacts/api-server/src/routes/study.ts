import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  AskTutorBody,
  AskTutorResponse,
  CreateCourseBody,
  CreateCourseResponse,
  CreateMaterialBody,
  CreateMaterialResponse,
  CreateStudySessionBody,
  CreateStudySessionResponse,
  DeleteCourseParams,
  DeleteMaterialParams,
  DeleteStudySessionParams,
  GetCourseParams,
  GetCourseProgressParams,
  GetCourseProgressResponse,
  GetCourseResponse,
  GetDashboardSummaryResponse,
  GetNextLearningQuestionBody,
  GetNextLearningQuestionParams,
  GetNextLearningQuestionResponse,
  ListCoursesResponse,
  ListMaterialsParams,
  ListMaterialsResponse,
  ListStudySessionsParams,
  ListStudySessionsResponse,
  SubmitLearningAnswerBody,
  SubmitLearningAnswerParams,
  SubmitLearningAnswerResponse,
  UpdateCourseBody,
  UpdateCourseParams,
  UpdateCourseResponse,
  UpdateStudySessionBody,
  UpdateStudySessionParams,
  UpdateStudySessionResponse,
} from "@workspace/api-zod";
import {
  coursesTable,
  db,
  learningQuestionsTable,
  learningResultsTable,
  materialChunksTable,
  materialsTable,
  studySessionsTable,
  tutorHistoryTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { defaultActiveLearning, findOwnedCourse, getCourseView, listOwnedSessions, sessionView } from "../lib/courseData";
import { AIUnavailableError, generateAnswerFeedback, generateLearningQuestion, generateTutorAnswer, retrieveCourseContext, searchWeb } from "../lib/ai";
import { processMaterial } from "../lib/materialProcessing";

const router: IRouter = Router();
router.use(requireAuth);

function courseIdFrom(params: Record<string, unknown>): number {
  return Number(Array.isArray(params.courseId) ? params.courseId[0] : params.courseId);
}

function sessionIdFrom(params: Record<string, unknown>): number {
  return Number(Array.isArray(params.sessionId) ? params.sessionId[0] : params.sessionId);
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const ownerId = req.userId!;
  const courses = await db.select().from(coursesTable).where(eq(coursesTable.ownerId, ownerId)).orderBy(desc(coursesTable.updatedAt));
  const views = (await Promise.all(courses.map((course) => getCourseView(ownerId, course.id)))).filter(Boolean);
  const sessions = await db.select().from(studySessionsTable).where(and(
    eq(studySessionsTable.ownerId, ownerId),
    eq(studySessionsTable.status, "upcoming"),
  )).orderBy(asc(studySessionsTable.scheduledStart)).limit(4);
  const sessionViews = await Promise.all(sessions.map(async (session) => {
    const [course] = await db.select({ name: coursesTable.name }).from(coursesTable).where(eq(coursesTable.id, session.courseId));
    return sessionView(session, course?.name ?? "Course");
  }));
  const materialCount = views.reduce((total, course) => total + (course?.materialCount ?? 0), 0);
  const readyMaterialCount = views.reduce((total, course) => total + (course?.readyMaterialCount ?? 0), 0);
  const overallProgress = views.length ? Math.round(views.reduce((total, course) => total + (course?.progress ?? 0), 0) / views.length) : 0;
  res.json(GetDashboardSummaryResponse.parse({
    courseCount: courses.length,
    materialCount,
    readyMaterialCount,
    overallProgress,
    upcomingSessions: sessionViews,
    recentCourse: views[0] ?? null,
  }));
});

router.get("/courses", async (req, res): Promise<void> => {
  const views = (await Promise.all(
    (await db.select().from(coursesTable).where(eq(coursesTable.ownerId, req.userId!)).orderBy(desc(coursesTable.updatedAt)))
      .map((course) => getCourseView(req.userId!, course.id)),
  )).filter(Boolean);
  res.json(ListCoursesResponse.parse(views));
});

router.post("/courses", async (req, res): Promise<void> => {
  const parsed = CreateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [course] = await db.insert(coursesTable).values({
    ownerId: req.userId!,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    ...{
      activeLearningEnabled: defaultActiveLearning.enabled,
      activeLearningStartTime: defaultActiveLearning.startTime,
      activeLearningEndTime: defaultActiveLearning.endTime,
      activeLearningFrequencyMinutes: defaultActiveLearning.frequencyMinutes,
      activeLearningQuestionCount: defaultActiveLearning.questionCount,
      activeLearningQuestionType: defaultActiveLearning.questionType,
    },
  }).returning();
  res.status(201).json(CreateCourseResponse.parse(await getCourseView(req.userId!, course.id)));
});

router.get("/courses/:courseId", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const view = await getCourseView(req.userId!, params.data.courseId);
  if (!view) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(GetCourseResponse.parse(view));
});

router.patch("/courses/:courseId", async (req, res): Promise<void> => {
  const params = UpdateCourseParams.safeParse(req.params);
  const body = UpdateCourseBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid course update" }); return; }
  const changes: Record<string, unknown> = {};
  if (body.data.name !== undefined) changes.name = body.data.name;
  if (body.data.description !== undefined) changes.description = body.data.description;
  if (body.data.activeLearning) {
    changes.activeLearningEnabled = body.data.activeLearning.enabled;
    changes.activeLearningStartTime = body.data.activeLearning.startTime;
    changes.activeLearningEndTime = body.data.activeLearning.endTime;
    changes.activeLearningFrequencyMinutes = body.data.activeLearning.frequencyMinutes;
    changes.activeLearningQuestionCount = body.data.activeLearning.questionCount;
    changes.activeLearningQuestionType = body.data.activeLearning.questionType;
  }
  const [updated] = await db.update(coursesTable).set(changes).where(and(
    eq(coursesTable.id, params.data.courseId),
    eq(coursesTable.ownerId, req.userId!),
  )).returning();
  if (!updated) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(UpdateCourseResponse.parse(await getCourseView(req.userId!, updated.id)));
});

router.delete("/courses/:courseId", async (req, res): Promise<void> => {
  const params = DeleteCourseParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const course = await findOwnedCourse(req.userId!, params.data.courseId);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  await db.delete(materialChunksTable).where(and(eq(materialChunksTable.courseId, course.id), eq(materialChunksTable.ownerId, req.userId!)));
  await db.delete(materialsTable).where(and(eq(materialsTable.courseId, course.id), eq(materialsTable.ownerId, req.userId!)));
  await db.delete(studySessionsTable).where(and(eq(studySessionsTable.courseId, course.id), eq(studySessionsTable.ownerId, req.userId!)));
  await db.delete(tutorHistoryTable).where(and(eq(tutorHistoryTable.courseId, course.id), eq(tutorHistoryTable.ownerId, req.userId!)));
  await db.delete(learningResultsTable).where(and(eq(learningResultsTable.courseId, course.id), eq(learningResultsTable.ownerId, req.userId!)));
  await db.delete(learningQuestionsTable).where(and(eq(learningQuestionsTable.courseId, course.id), eq(learningQuestionsTable.ownerId, req.userId!)));
  await db.delete(coursesTable).where(and(eq(coursesTable.id, course.id), eq(coursesTable.ownerId, req.userId!)));
  res.sendStatus(204);
});

router.get("/courses/:courseId/materials", async (req, res): Promise<void> => {
  const params = ListMaterialsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const course = await findOwnedCourse(req.userId!, params.data.courseId);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const materials = await db.select().from(materialsTable).where(and(
    eq(materialsTable.courseId, course.id),
    eq(materialsTable.ownerId, req.userId!),
  )).orderBy(desc(materialsTable.uploadedAt));
  res.json(ListMaterialsResponse.parse(materials));
});

router.post("/courses/:courseId/materials", async (req, res): Promise<void> => {
  const params = ListMaterialsParams.safeParse(req.params);
  const body = CreateMaterialBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid material metadata" }); return; }
  const course = await findOwnedCourse(req.userId!, params.data.courseId);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const [material] = await db.insert(materialsTable).values({
    ownerId: req.userId!,
    courseId: course.id,
    name: body.data.name,
    contentType: body.data.contentType,
    sizeBytes: body.data.sizeBytes,
    objectPath: body.data.objectPath,
    status: "processing",
    statusMessage: null,
    indexedChunkCount: 0,
  }).returning();
  void processMaterial(material);
  res.status(201).json(CreateMaterialResponse.parse(material));
});

router.get("/courses/:courseId/sessions", async (req, res): Promise<void> => {
  const params = ListStudySessionsParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const sessions = await listOwnedSessions(req.userId!, params.data.courseId);
  if (!sessions) { res.status(404).json({ error: "Course not found" }); return; }
  res.json(ListStudySessionsResponse.parse(sessions));
});

router.post("/courses/:courseId/sessions", async (req, res): Promise<void> => {
  const params = ListStudySessionsParams.safeParse(req.params);
  const body = CreateStudySessionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid study session" }); return; }
  const course = await findOwnedCourse(req.userId!, params.data.courseId);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const [session] = await db.insert(studySessionsTable).values({
    ownerId: req.userId!,
    courseId: course.id,
    title: body.data.title,
    scheduledStart: body.data.scheduledStart,
    durationMinutes: body.data.durationMinutes,
    status: "upcoming",
  }).returning();
  res.status(201).json(CreateStudySessionResponse.parse(sessionView(session, course.name)));
});

router.patch("/study-sessions/:sessionId", async (req, res): Promise<void> => {
  const params = UpdateStudySessionParams.safeParse(req.params);
  const body = UpdateStudySessionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid study session update" }); return; }
  const changes: Record<string, unknown> = {};
  if (body.data.title !== undefined) changes.title = body.data.title;
  if (body.data.scheduledStart !== undefined) changes.scheduledStart = body.data.scheduledStart;
  if (body.data.durationMinutes !== undefined) changes.durationMinutes = body.data.durationMinutes;
  if (body.data.status !== undefined) changes.status = body.data.status;
  const [session] = await db.update(studySessionsTable).set(changes).where(and(
    eq(studySessionsTable.id, params.data.sessionId),
    eq(studySessionsTable.ownerId, req.userId!),
  )).returning();
  if (!session) { res.status(404).json({ error: "Study session not found" }); return; }
  const [course] = await db.select({ name: coursesTable.name }).from(coursesTable).where(eq(coursesTable.id, session.courseId));
  res.json(UpdateStudySessionResponse.parse(sessionView(session, course?.name ?? "Course")));
});

router.delete("/study-sessions/:sessionId", async (req, res): Promise<void> => {
  const params = DeleteStudySessionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [session] = await db.delete(studySessionsTable).where(and(
    eq(studySessionsTable.id, params.data.sessionId),
    eq(studySessionsTable.ownerId, req.userId!),
  )).returning();
  if (!session) { res.status(404).json({ error: "Study session not found" }); return; }
  res.sendStatus(204);
});

router.delete("/courses/:courseId/materials/:materialId", async (req, res): Promise<void> => {
  const params = DeleteMaterialParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await db.delete(materialChunksTable).where(and(
    eq(materialChunksTable.materialId, params.data.materialId),
    eq(materialChunksTable.courseId, params.data.courseId),
    eq(materialChunksTable.ownerId, req.userId!),
  ));
  const [material] = await db.delete(materialsTable).where(and(
    eq(materialsTable.id, params.data.materialId),
    eq(materialsTable.courseId, params.data.courseId),
    eq(materialsTable.ownerId, req.userId!),
  )).returning();
  if (!material) { res.status(404).json({ error: "Material not found" }); return; }
  res.sendStatus(204);
});

router.post("/courses/:courseId/tutor", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  const body = AskTutorBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid tutor request" }); return; }
  if (!(await findOwnedCourse(req.userId!, params.data.courseId))) { res.status(404).json({ error: "Course not found" }); return; }
  try {
    const context = await retrieveCourseContext(req.userId!, params.data.courseId, body.data.prompt);
    const webContext = body.data.useWeb ? await searchWeb(body.data.prompt) : [];
    const answer = await generateTutorAnswer(
      body.data.prompt,
      [...context, ...webContext.map((item) => ({ name: item.name, content: item.content }))],
      body.data.mode,
    );
    const sources = [
      ...context.map((item) => ({
      label: item.name,
      kind: "uploaded_material" as const,
      materialId: item.materialId,
      page: item.page,
      slide: item.slide,
      url: null,
      })),
      ...webContext.map((item) => ({
        label: item.name,
        kind: "web" as const,
        materialId: null,
        page: null,
        slide: null,
        url: item.url,
      })),
    ];
    const [history] = await db.insert(tutorHistoryTable).values({
      ownerId: req.userId!,
      courseId: params.data.courseId,
      prompt: body.data.prompt,
      answer,
      sources,
      webUsed: webContext.length > 0 ? "true" : "false",
    }).returning();
    res.json(AskTutorResponse.parse({ answer, sources, webUsed: webContext.length > 0, historyId: history.id }));
  } catch (error) {
    if (error instanceof AIUnavailableError) { res.status(503).json({ error: "AI is not configured. Add an OpenAI key to enable tutoring." }); return; }
    req.log.error({ err: error }, "Tutor generation failed");
    res.status(500).json({ error: "Tutor could not respond right now" });
  }
});

router.get("/courses/:courseId/progress", async (req, res): Promise<void> => {
  const params = GetCourseProgressParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  if (!(await findOwnedCourse(req.userId!, params.data.courseId))) { res.status(404).json({ error: "Course not found" }); return; }
  const results = await db.select().from(learningResultsTable).where(and(
    eq(learningResultsTable.courseId, params.data.courseId),
    eq(learningResultsTable.ownerId, req.userId!),
  )).orderBy(desc(learningResultsTable.answeredAt)).limit(20);
  const answered = results.filter((result) => result.result === "correct" || result.result === "incorrect");
  const correctCount = answered.filter((result) => result.result === "correct").length;
  const weakTopics = Array.from(new Set(results.filter((result) => result.result === "incorrect" && result.topic).map((result) => result.topic!))).slice(0, 5);
  const difficulty = correctCount >= 8 ? "advanced" : correctCount >= 4 ? "confident" : correctCount >= 1 ? "developing" : "beginner";
  res.json(GetCourseProgressResponse.parse({
    courseId: params.data.courseId,
    progress: answered.length ? Math.round((correctCount / answered.length) * 100) : 0,
    correctCount,
    incorrectCount: answered.filter((result) => result.result === "incorrect").length,
    totalAnswered: answered.length,
    currentDifficulty: difficulty,
    weakTopics,
    recentResults: results.map((result) => ({
      id: result.id,
      question: result.question,
      result: result.result,
      difficulty: result.difficulty,
      answeredAt: result.answeredAt,
    })),
  }));
});

router.post("/courses/:courseId/learning/next", async (req, res): Promise<void> => {
  const params = GetNextLearningQuestionParams.safeParse(req.params);
  const body = GetNextLearningQuestionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid learning session" }); return; }
  const course = await findOwnedCourse(req.userId!, params.data.courseId);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }
  const session = await db.select().from(studySessionsTable).where(and(
    eq(studySessionsTable.id, body.data.scheduledSessionId),
    eq(studySessionsTable.courseId, course.id),
    eq(studySessionsTable.ownerId, req.userId!),
  ));
  if (!session[0]) { res.status(404).json({ error: "Study session not found" }); return; }
  try {
    const progress = await db.select().from(learningResultsTable).where(and(eq(learningResultsTable.courseId, course.id), eq(learningResultsTable.ownerId, req.userId!)));
    const difficulty = progress.filter((item) => item.result === "correct").length > 4 ? "confident" : "beginner";
    const context = await retrieveCourseContext(req.userId!, course.id, "key concepts and important details");
    if (!context.length) { res.status(400).json({ error: "Add a ready course material before starting Active Learning." }); return; }
    const generated = await generateLearningQuestion("key concepts and important details", course.activeLearningQuestionType, difficulty, context.map((item) => item.content).join("\n\n"));
    const [question] = await db.insert(learningQuestionsTable).values({
      ownerId: req.userId!,
      courseId: course.id,
      scheduledSessionId: body.data.scheduledSessionId,
      type: course.activeLearningQuestionType,
      prompt: generated.prompt,
      options: generated.options,
      correctAnswer: generated.correctAnswer,
      explanation: generated.explanation,
      difficulty,
    }).returning();
    res.json(GetNextLearningQuestionResponse.parse({
      id: question.id,
      courseId: course.id,
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      difficulty: question.difficulty,
      due: true,
    }));
  } catch (error) {
    if (error instanceof AIUnavailableError) { res.status(503).json({ error: "AI is not configured. Add an OpenAI key to enable Active Learning." }); return; }
    req.log.error({ err: error }, "Active Learning generation failed");
    res.status(500).json({ error: "Could not generate a question right now" });
  }
});

router.post("/courses/:courseId/learning/answers", async (req, res): Promise<void> => {
  const params = SubmitLearningAnswerParams.safeParse(req.params);
  const body = SubmitLearningAnswerBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid learning answer" }); return; }
  const [question] = await db.select().from(learningQuestionsTable).where(and(
    eq(learningQuestionsTable.id, body.data.questionId),
    eq(learningQuestionsTable.courseId, params.data.courseId),
    eq(learningQuestionsTable.ownerId, req.userId!),
  ));
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }
  try {
    let result: "correct" | "incorrect" | "skipped" | "dismissed" | "postponed" = body.data.action === "answered" ? "incorrect" : body.data.action;
    let feedback = "This question was set aside.";
    let explanation = question.explanation;
    if (body.data.action === "answered") {
      const evaluated = await generateAnswerFeedback(question.prompt, body.data.answer, question.correctAnswer, question.explanation);
      result = evaluated.result;
      feedback = evaluated.feedback;
      explanation = evaluated.explanation;
    }
    const [saved] = await db.insert(learningResultsTable).values({
      ownerId: req.userId!,
      courseId: params.data.courseId,
      questionId: question.id,
      question: question.prompt,
      result,
      difficulty: question.difficulty,
      topic: null,
    }).returning();
    const progress = await db.select({ result: learningResultsTable.result }).from(learningResultsTable).where(and(eq(learningResultsTable.courseId, params.data.courseId), eq(learningResultsTable.ownerId, req.userId!)));
    const correctCount = progress.filter((item) => item.result === "correct").length;
    const nextDifficulty = correctCount >= 8 ? "advanced" : correctCount >= 4 ? "confident" : correctCount >= 1 ? "developing" : "beginner";
    res.json(SubmitLearningAnswerResponse.parse({ result, feedback, explanation, nextDifficulty, resultId: saved.id }));
  } catch (error) {
    if (error instanceof AIUnavailableError) { res.status(503).json({ error: "AI is not configured. Add an OpenAI key to evaluate answers." }); return; }
    req.log.error({ err: error }, "Active Learning evaluation failed");
    res.status(500).json({ error: "Could not evaluate that answer right now" });
  }
});

export default router;