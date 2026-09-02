import { Router, type IRouter } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { db, materialsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { Readable } from "node:stream";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.post("/storage/uploads/request-url", requireAuth, async (req, res): Promise<void> => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported file smaller than 50 MB" });
    return;
  }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Unable to create material upload URL");
    res.status(500).json({ error: "File storage is temporarily unavailable" });
  }
});

router.get("/storage/objects/*path", requireAuth, async (req, res): Promise<void> => {
  const rawPath = req.params.path;
  const objectPath = `/objects/${Array.isArray(rawPath) ? rawPath.join("/") : rawPath}`;
  const [ownedMaterial] = await db.select({ id: materialsTable.id })
    .from(materialsTable)
    .where(and(eq(materialsTable.ownerId, req.userId!), eq(materialsTable.objectPath, objectPath)))
    .limit(1);
  if (!ownedMaterial) {
    res.status(404).json({ error: "Object not found" });
    return;
  }
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(file);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Unable to serve material");
    res.status(500).json({ error: "Unable to serve material" });
  }
});

export default router;