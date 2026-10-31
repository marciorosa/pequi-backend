import express from 'express';
import { getDocumentHistory, getDocument, createDocument, updateDocument, clearDocuments } from '../controllers/document.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Document history route
router.get('/history', authMiddleware, getDocumentHistory);

// Get document route
router.get('/:id', authMiddleware, getDocument);

// Create document route
router.post('/', authMiddleware, createDocument);

// Update document route
router.put('/:id', authMiddleware, updateDocument);

// Delete all documents route
router.delete('/', authMiddleware, clearDocuments);

export default router; 