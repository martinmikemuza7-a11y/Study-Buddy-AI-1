import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, coursesTable, materialChunksTable, materialsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/courses/:courseId/knowledge", async (req, res): Promise<void> => {
  const ownerId = req.userId!;
  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    res.status(400).json({ error: "Invalid course" });
    return;
  }

  const [course] = await db.select({ id: coursesTable.id }).from(coursesTable).where(and(
    eq(coursesTable.id, courseId),
    eq(coursesTable.ownerId, ownerId),
  )).limit(1);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

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
    ))
    .orderBy(asc(materialChunksTable.materialId), asc(materialChunksTable.chunkIndex));

  res.json({ courseId, chunks });
});

export default router;
