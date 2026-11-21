/**
 * Rotas do modo white-label fora do admin:
 *   /tenants/public/...   marca e planos do escritório (sem login)
 *   /office/...           equipe do escritório (planos, contatos do widget, Stripe Connect)
 *   /tenant-billing/...   cliente do escritório assina um plano do escritório
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  resolveTenant,
  publicPlans,
  loadOwnTenant,
  requireOwner,
  officeSummary,
  listPlans,
  createPlan,
  updatePlan,
  listLeads,
  listClients,
  getFinance,
  clientCheckout,
  clientConfirm,
} from '../controllers/tenant.controller';

export const tenantPublicRouter = express.Router();
tenantPublicRouter.get('/public/resolve', resolveTenant);
tenantPublicRouter.get('/public/:slug/plans', publicPlans);

export const officeRouter = express.Router();
officeRouter.use(authMiddleware as any, loadOwnTenant as any);
officeRouter.get('/summary', officeSummary as any);
officeRouter.get('/plans', listPlans as any);
officeRouter.post('/plans', requireOwner as any, createPlan as any);
officeRouter.put('/plans/:planId', requireOwner as any, updatePlan as any);
officeRouter.get('/leads', listLeads as any);
officeRouter.get('/clients', listClients as any);
officeRouter.get('/finance', requireOwner as any, getFinance as any);

export const tenantBillingRouter = express.Router();
tenantBillingRouter.use(authMiddleware as any);
tenantBillingRouter.post('/checkout', clientCheckout as any);
tenantBillingRouter.post('/confirm', clientConfirm as any);
