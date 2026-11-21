import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { getOverview, listUsers, getUser, userAction, listSubscriptions, getBilling, listLogs } from '../controllers/admin.controller';
import {
  listTenants, createTenant, loadTenantParam, getTenant, updateTenant, rotateWidgetKey, applyCommission,
  listPlans, createPlan, updatePlan, listLeads, listClients, getFinance, createPayout,
} from '../controllers/tenant.controller';

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

// Escritórios (white-label)
router.get('/tenants', listTenants as any);
router.post('/tenants', createTenant as any);
router.use('/tenants/:id', loadTenantParam as any);
router.get('/tenants/:id', getTenant as any);
router.put('/tenants/:id', updateTenant as any);
router.post('/tenants/:id/rotate-key', rotateWidgetKey as any);
router.post('/tenants/:id/apply-commission', applyCommission as any);
router.get('/tenants/:id/plans', listPlans as any);
router.post('/tenants/:id/plans', createPlan as any);
router.put('/tenants/:id/plans/:planId', updatePlan as any);
router.get('/tenants/:id/leads', listLeads as any);
router.get('/tenants/:id/clients', listClients as any);
router.get('/tenants/:id/finance', getFinance as any);
router.post('/tenants/:id/payouts', createPayout as any);

export default router;
