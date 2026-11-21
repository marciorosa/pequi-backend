/**
 * Rotas do modo white-label fora do admin:
 *   /tenants/public/...   marca do escritório (sem login)
 *   /office/...           equipe do escritório (clientes e contatos do widget)
 * Os clientes do escritório não assinam nada: o uso deles é coberto pelo plano do escritório no Pequi.
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { resolveTenant, loadOwnTenant, officeSummary, listLeads, listClients } from '../controllers/tenant.controller';

export const tenantPublicRouter = express.Router();
tenantPublicRouter.get('/public/resolve', resolveTenant);

export const officeRouter = express.Router();
officeRouter.use(authMiddleware as any, loadOwnTenant as any);
officeRouter.get('/summary', officeSummary as any);
officeRouter.get('/leads', listLeads as any);
officeRouter.get('/clients', listClients as any);
