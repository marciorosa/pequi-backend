import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, IUser } from '../types';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/user.model';

dotenv.config();

/**
 * Middleware to validate JWT token and add user info to request
 */
export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token não informado ou em formato inválido' });
  }

  // Extract the token without the 'Bearer ' prefix
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'O token de autenticação é obrigatório' });
  }

  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);

    // Add user info to request
    req.user = {
      id: (decoded as any).id,
      email: (decoded as any).email,
      name: (decoded as any).name || '',
      role: (decoded as any).role || 'user',
      subscriptionId: (decoded as any).subscriptionId
    };

  } catch (error) {
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }

  // Conta bloqueada pela administração perde o acesso na hora, mesmo com o token válido.
  // Se o banco não responder, a requisição segue (a rota em si vai tratar a falha).
  try {
    const status = mongoose.connection.readyState === 1
      ? await User.findById(req.user!.id).select('blocked').lean()
      : null;
    if (status && (status as any).blocked) {
      return res.status(403).json({ message: 'Esta conta está bloqueada. Fale com o suporte do Pequi.', blocked: true });
    }
  } catch {
    // segue
  }

  next();
}; 