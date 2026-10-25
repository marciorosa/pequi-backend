import { Router } from 'express';
import { register, login, getProfile, updateProfile, forgotPassword, resetPassword, changePassword } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { handleFileUpload } from '../middleware/file-upload.middleware';

const router = Router();

// Auth routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Protected routes (require authentication)
router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, handleFileUpload, updateProfile);
router.put('/change-password', authMiddleware, changePassword);

export default router; 