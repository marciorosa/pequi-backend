import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, IUser } from '../types';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Middleware to validate JWT token and add user info to request
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided or invalid token format' });
  }

  // Extract the token without the 'Bearer ' prefix
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token is required' });
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

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}; 