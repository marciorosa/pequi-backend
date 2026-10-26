import { Request, Response, NextFunction } from 'express';
import 'express'; // Garante que o namespace global do Express seja carregado
import { Types } from 'mongoose';

export interface IUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  subscriptionId?: Types.ObjectId;
}

export interface AuthRequest extends Request {
  user?: IUser;
  file?: Express.Multer.File;
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

export type ExpressHandler = (
  req: Request | AuthRequest, 
  res: Response, 
  next?: NextFunction
) => Promise<void | Response<any, Record<any, any>>> | void | Response<any, Record<any, any>>;