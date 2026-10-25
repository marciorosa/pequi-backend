import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { checkFeatureLimit } from '../middleware/subscription.middleware';
import {
    getFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    lockFolder,
    unlockFolder,
    removeLock,
    uploadFiles,
    deleteFile,
    getDownloadUrl,
    chatWithFile,
    saveChatSession,
    getChatSessions,
} from '../controllers/vault.controller';

const router = Router();

// Multer: store files in memory (max 50 MB per file, 10 files at once)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});

// All vault routes are protected
router.use(authMiddleware as any);

// Global interceptor for non-pro users accessing the vault
router.use(checkFeatureLimit('vaultFolderCount', false));

// Folder routes
router.get('/folders', getFolders as any);
router.post('/folders', checkFeatureLimit('vaultFolderCount', true), createFolder as any);
router.put('/folders/:id', updateFolder as any);
router.delete('/folders/:id', deleteFolder as any);

// Lock / Unlock
router.post('/folders/:id/lock', lockFolder as any);
router.post('/folders/:id/unlock', unlockFolder as any);
router.post('/folders/:id/remove-lock', removeLock as any);

// File routes
router.post('/folders/:id/files', upload.array('files', 10), uploadFiles as any);
router.delete('/folders/:id/files/:fileId', deleteFile as any);
router.get('/folders/:id/files/:fileId/download', getDownloadUrl as any);

// Chat-with-file routes
router.post('/folders/:id/files/:fileId/chat', checkFeatureLimit('chatCount', true), chatWithFile as any);
router.post('/folders/:id/files/:fileId/save-chat', saveChatSession as any);
router.get('/folders/:id/files/:fileId/chat-sessions', getChatSessions as any);

export default router;
