import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import User from '../models/user.model';
import { isAdminEmail } from '../config/plans';

/**
 * Só deixa passar administradores. A permissão é lida do banco a cada requisição
 * (e não do token), para que remover um administrador valha na hora.
 * Administrador = conta com role "admin" ou o e-mail da variável ADMIN_EMAIL.
 */
export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user?.id ? await User.findById(req.user.id).select('email role blocked').lean() : null;
    const ok = user && !(user as any).blocked && ((user as any).role === 'admin' || isAdminEmail((user as any).email));
    if (!ok) {
      return res.status(403).json({ message: 'Acesso restrito à administração do Pequi.' });
    }
    req.user = { ...req.user!, email: (user as any).email, role: 'admin' };
    next();
  } catch (error) {
    res.status(500).json({ message: 'Não foi possível verificar a permissão de administrador.' });
  }
};
