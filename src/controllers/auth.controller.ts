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
    throw new ValidationError('Name, email, and password are required');
  }

  const emailRegex = /^\S+@\S+\.\S+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Please enter a valid email');
  }

  if (password.length < 6) {
    throw new ValidationError('Password must be at least 6 characters');
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
      throw new ValidationError('User already exists');
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
      message: 'User registered successfully',
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
      throw new ValidationError('Email and password are required');
    }


    const user = await User.findOne({ email });
    if (!user) {
      throw new AuthError('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthError('Invalid credentials');
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '30d' }
    );


    return res.json({
      message: 'Login successful',
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
      throw new AuthError('Unauthorized');
    }

    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      throw new NotFoundError('User');
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
          'Basic document analysis',
          'Limited AI chat assistance',
          'Document storage (100 MB)',
          'Email support'
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
      throw new AuthError('Unauthorized');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User');
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
      message: 'Profile updated successfully',
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
      throw new ValidationError('Email is required');
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: 'If an account with that email exists, we have sent a password reset link'
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
      message: 'If an account with that email exists, we have sent a password reset link'
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
      throw new ValidationError('All fields are required');
    }

    const user = await User.findOne({
      email,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user || !user.resetPasswordToken) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const isValidToken = await bcrypt.compare(token, user.resetPasswordToken);
    if (!isValidToken) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.status(200).json({ message: 'Password has been reset successfully' });
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
      throw new AuthError('Unauthorized');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ValidationError('Both current and new passwords are required');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new NotFoundError('User');
    }

    // Compare current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: 'Password has been changed successfully' });
  } catch (error) {
    next(error);
  }
};