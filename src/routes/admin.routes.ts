import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { getOverview, listUsers, getUser, userAction, listSubscriptions, getBilling, listLogs } from '../controllers/admin.controller';

// Área administrativa: toda rota exige login e permissão de administrador
const router = express.Router();
router.use(authMiddleware as any, requireAdmin as any);

router.get('/overview', getOverview as any);
router.get('/users', listUsers as any);
router.get('/users/:id', getUser as any);
router.post('/users/:id/actions', userAction as any);
router.get('/subscriptions', listSubscriptions as any);
router.get('/billing', getBilling as any);
router.get('/logs', listLogs as any);

export default router;
