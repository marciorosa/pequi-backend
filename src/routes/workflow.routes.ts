import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkFeatureLimit } from '../middleware/subscription.middleware';
import {
    getWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    runWorkflow,
} from '../controllers/workflow.controller';

const upload = multer();
const router = Router();

router.use(authMiddleware as any);

// Global interceptor for non-pro users accessing workflows
router.use(checkFeatureLimit('workflowCount', false));

router.get('/', getWorkflows as any);
router.post('/', checkFeatureLimit('workflowCount', true), createWorkflow as any);
router.put('/:id', updateWorkflow as any);
router.delete('/:id', deleteWorkflow as any);
router.post('/:id/run', upload.single('file'), runWorkflow as any);

export default router;
