import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/user.model';
import Tenant from '../models/tenant.model';
import { runWithBrand, Brand } from '../utils/brandContext';
import { panelUrl } from '../services/tenant.service';

// Escritório de cada conta, em cache por 60 s (evita consultar o banco a cada pedido)
const cache = new Map<string, { brand: Brand | null; at: number }>();

/** Marca (escritório) de uma conta, ou null se for usuário do próprio Pequi */
export const brandForUser = async (userId: any): Promise<Brand | null> => {
  const key = String(userId || '');
  if (!key || mongoose.connection.readyState !== 1) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.brand;
  const user = await User.findById(key).select('tenantId').lean();
  let brand: Brand | null = null;
  if ((user as any)?.tenantId) {
    const t = await Tenant.findById((user as any).tenantId);
    if (t && t.status === 'active') brand = { name: t.branding?.displayName || t.name, slug: t.slug, panelUrl: panelUrl(t) };
  }
  cache.set(key, { brand, at: Date.now() });
  return brand;
};

/**
 * Lê o login (se houver) e roda o resto da requisição com a marca do escritório da conta.
 * Não bloqueia nada: sem login ou com token inválido, segue como Pequi.
 */
export const brandMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  let brand: Brand | null = null;
  try {
    const h = req.headers.authorization || '';
    if (h.startsWith('Bearer ')) {
      const decoded: any = jwt.verify(h.slice(7), process.env.JWT_SECRET as string);
      if (decoded?.id) brand = await brandForUser(decoded.id);
    }
  } catch {
    // sem marca
  }
  runWithBrand(brand, () => next());
};
