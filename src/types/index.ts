import { Request } from 'express';
import { Types } from 'mongoose';
import { Response, NextFunction } from 'express';

// User interface for authenticated requests
export interface IUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  subscriptionId?: Types.ObjectId;
}

// Request type that includes authenticated user
export interface AuthRequest extends Request {
  user?: IUser;
  file?: Express.Multer.File;
}

// Define Express handler return type to fix TypeScript errors
export type ExpressHandler = (
  req: Request | AuthRequest, 
  res: Response, 
  next?: NextFunction
) => Promise<void | Response<any, Record<string, any>>> | void | Response<any, Record<string, any>>;

// Import these so we don't need to import them in every file 