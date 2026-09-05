import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyRouter from "./study";
import storageRouter from "./storage";
import knowledgeRouter from "./knowledge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyRouter);
router.use(storageRouter);
router.use(knowledgeRouter);

export default router;
