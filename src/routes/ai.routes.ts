import { Router } from 'express';
import {
  generateAssistantResponse,
  analyzeDocument,
  searchLegalDatabase,
  chatWithAssistant,
  compareDocuments,
  createAgreement,
  translateDocument,
  createDocument,
  createLimpaNome
} from '../controllers/ai.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkFeatureLimit, checkLawyerAccess } from '../middleware/subscription.middleware';

const router = Router();

// AI routes
router.post('/assistant', authMiddleware, checkLawyerAccess as any, checkFeatureLimit('chatCount'), generateAssistantResponse as any);
router.post('/document-analysis', authMiddleware, checkLawyerAccess as any, checkFeatureLimit('docsCount'), analyzeDocument as any);
router.get('/search', authMiddleware, checkFeatureLimit('searchCount'), searchLegalDatabase as any);
router.post('/chat', authMiddleware, checkLawyerAccess as any, checkFeatureLimit('chatCount'), chatWithAssistant as any);
router.post('/document-comparison', authMiddleware, checkFeatureLimit('docsCount'), compareDocuments as any);
router.post('/create-agreement', authMiddleware, checkFeatureLimit('docsCount'), createAgreement as any);
router.post('/document-translation', authMiddleware, checkFeatureLimit('docsCount'), translateDocument as any);

// Register createDocument route
router.post('/create-document', authMiddleware, checkFeatureLimit('docsCount'), createDocument as any);

// Serviço Limpa Nome (Pesquisa Inteligente): gera uma peça, então conta como operação de documento
router.post('/limpa-nome', authMiddleware, checkFeatureLimit('docsCount'), createLimpaNome as any);

export default router; 