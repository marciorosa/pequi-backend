'use strict';

import { Request, Response, NextFunction } from 'express';
import User from '../models/user.model';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../types';
import crypto from 'crypto';
import emailService from '../services/email.service';
import Subscription from '../models/subscription.model';
import { s3Service } from '../services/s3.service';
import { AuthError, ValidationError, NotFoundError, AppError } from '../utils/errors';

dotenv.config();

/**
 * Validation helper for registration
 */
const validateRegistrationInput = (name: string, email: string, password: string) => {
  if (!name || !email || !password) {
    throw new ValidationError('Nome, e-mail e senha são obrigatórios');
  }

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Informe um e-mail válido');
  }

  if (password.length < 6) {
    throw new ValidationError('A senha deve ter pelo menos 6 caracteres');
  }
};

/**
 * Register user
 */
export const register = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { name, email, password } = req.body;

    validateRegistrationInput(name, email, password);


    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ValidationError('Já existe um usuário com este e-mail');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '30d' }
    );


    return res.status(201).json({
      message: 'Usuário cadastrado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
export const login = async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new ValidationError('E-mail e senha são obrigatórios');
    }


    const user = await User.findOne({ email });
    if (!user) {
      throw new AuthError('Credenciais inválidas');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthError('Credenciais inválidas');
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '30d' }
    );


    return res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user profile
 */
export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AuthError('Não autorizado');
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      throw new NotFoundError('Usuário');
    }

    let planTier = 'Free';
    let status = 'active';
    let startDate = new Date();
    let nextBillingDate: Date | null = null;
    let limits = { searchCount: 5, chatCount: 5, docsCount: 0, vaultFolderCount: 0, workflowCount: 0 };

    if (user.subscriptionId) {
      const sub = await Subscription.findById(user.subscriptionId);
      if (sub && sub.status === 'active') {
        planTier = 'Pro';
        status = sub.status;
        startDate = sub.currentPeriodStart;
        nextBillingDate = sub.currentPeriodEnd;
        limits = { searchCount: 50, chatCount: 50, docsCount: 50, vaultFolderCount: 50, workflowCount: 5 };
      }
    }

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company || '',
        role: user.role,
        phone: user.phone || '',
        image: user.image || ''
      },
      apiUsage: user.apiUsage || { searchCount: 0, chatCount: 0, docsCount: 0, vaultFolderCount: 0, workflowCount: 0 },
      subscription: {
        plan: planTier,
        status: status,
        startDate: startDate,
        nextBillingDate: nextBillingDate,
        limits: limits,
        features: [
          'Análise básica de documentos',
          'Assistência limitada por chat com IA',
          'Armazenamento de documentos (100 MB)',
          'Suporte por e-mail'
        ]
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update user profile
 */
export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AuthError('Não autorizado');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('Usuário');
    }

    const { fullName, email, company, role, phone } = req.body;

    if (fullName) user.name = fullName;
    if (email) user.email = email;
    if (company) user.company = company;
    if (role) user.role = role;
    if (phone) user.phone = phone;

    if (req.file) {
      const { s3Url } = await s3Service.uploadProfileImage(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        user._id.toString()
      );
      user.image = s3Url;
    }

    await user.save();

    return res.json({
      message: 'Perfil atualizado com sucesso',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        company: user.company || '',
        role: user.role,
        phone: user.phone || '',
        image: user.image || ''
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Forgot password
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('O e-mail é obrigatório');
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: 'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const tokenExpiration = new Date(Date.now() + 60 * 60 * 1000);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = tokenExpiration;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${email}`;
    await emailService.sendPasswordResetEmail(email, resetUrl);

    return res.status(200).json({
      message: 'Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reset password
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      throw new ValidationError('Todos os campos são obrigatórios');
    }

    const user = await User.findOne({
      email,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user || !user.resetPasswordToken) {
      throw new ValidationError('Token de redefinição inválido ou expirado');
    }

    const isValidToken = await bcrypt.compare(token, user.resetPasswordToken);
    if (!isValidToken) {
      throw new ValidationError('Token de redefinição inválido ou expirado');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.status(200).json({ message: 'Senha redefinida com sucesso' });
  } catch (error) {
    next(error);
  }
};

/**
 * Change password
 */
export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new AuthError('Não autorizado');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Informe a senha atual e a nova senha');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('Usuário');
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ValidationError('A senha atual está incorreta');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    next(error);
  }
};