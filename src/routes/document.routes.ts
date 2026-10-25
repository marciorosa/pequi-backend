import express from 'express';
import { getDocumentHistory, createDocument, updateDocument } from '../controllers/document.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Document history route
router.get('/history', authMiddleware, getDocumentHistory);

// Create document route
router.post('/', authMiddleware, createDocument);

// Update document route
router.put('/:id', authMiddleware, updateDocument);

export default router; 