import { Router } from 'express';
import { 
  getUserChats, 
  getChatById, 
  createChat, 
  updateChat, 
  deleteChat 
} from '../controllers/chat.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// Chat routes - all require authentication
router.get('/', authMiddleware, getUserChats);
router.get('/:id', authMiddleware, getChatById);
router.post('/', authMiddleware, createChat);
router.put('/:id', authMiddleware, updateChat);
router.delete('/:id', authMiddleware, deleteChat);

export default router; 