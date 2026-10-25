import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import VaultFolder from '../models/vault.model';
import Workflow from '../models/workflow.model';
import { s3Service } from '../services/s3.service';
import { generateChatResponse } from '../services/gemini.service';

// ── Folders ──────────────────────────────────────────────────────────────────

/** GET /api/vault/folders */
export const getFolders = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const folders = await VaultFolder.find({ userId }).select('-passwordHash').sort({ createdAt: -1 });
        res.json({ folders });
    } catch (err) {
        res.status(500).json({ message: 'Failed to retrieve folders' });
    }
};

/** POST /api/vault/folders */
export const createFolder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { name, description, color } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ message: 'Folder name is required' });
        }

        const folder = await VaultFolder.create({
            userId,
            name: name.trim(),
            description: description?.trim(),
            color: color || '#1a1a1a',
        });

        // Return without passwordHash
        const folderObj = folder.toObject() as any;
        delete folderObj.passwordHash;

        res.status(201).json({ folder: folderObj });
    } catch (err) {
        res.status(500).json({ message: 'Failed to create folder' });
    }
};

/** PUT /api/vault/folders/:id */
export const updateFolder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { name, description, color } = req.body;

        const folder = await VaultFolder.findOne({ _id: id, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        if (name?.trim()) folder.name = name.trim();
        if (description !== undefined) folder.description = description.trim();
        if (color) folder.color = color;

        await folder.save();

        const folderObj = folder.toObject() as any;
        delete folderObj.passwordHash;
        res.json({ folder: folderObj });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update folder' });
    }
};

/** DELETE /api/vault/folders/:id */
export const deleteFolder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;

        const folder = await VaultFolder.findOne({ _id: id, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        // Delete all files from S3
        const deletePromises = folder.files.map((file) => s3Service.deleteFile(file.s3Key).catch(() => { }));
        await Promise.all(deletePromises);

        await folder.deleteOne();
        res.json({ message: 'Folder deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete folder' });
    }
};

// ── Folder Lock ───────────────────────────────────────────────────────────────

/** POST /api/vault/folders/:id/lock */
export const lockFolder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { password } = req.body;

        if (!password || password.length < 4) {
            return res.status(400).json({ message: 'Password must be at least 4 characters' });
        }

        const folder = await VaultFolder.findOne({ _id: id, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const hash = await bcrypt.hash(password, 10);
        folder.isLocked = true;
        folder.passwordHash = hash;
        await folder.save();

        res.json({ message: 'Folder locked successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to lock folder' });
    }
};

/** POST /api/vault/folders/:id/unlock */
export const unlockFolder = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { password } = req.body;

        const folder = await VaultFolder.findOne({ _id: id, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });
        if (!folder.isLocked) return res.json({ message: 'Folder is not locked' });
        if (!folder.passwordHash) return res.status(400).json({ message: 'No password set for this folder' });

        const match = await bcrypt.compare(password || '', folder.passwordHash);
        if (!match) return res.status(401).json({ message: 'Incorrect password' });

        res.json({ message: 'Access granted' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to unlock folder' });
    }
};

/** POST /api/vault/folders/:id/remove-lock */
export const removeLock = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id } = req.params;
        const { password } = req.body;

        const folder = await VaultFolder.findOne({ _id: id, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        if (folder.isLocked && folder.passwordHash) {
            const match = await bcrypt.compare(password || '', folder.passwordHash);
            if (!match) return res.status(401).json({ message: 'Incorrect password' });
        }

        folder.isLocked = false;
        folder.passwordHash = undefined;
        await folder.save();

        res.json({ message: 'Lock removed successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to remove lock' });
    }
};

// ── Files ─────────────────────────────────────────────────────────────────────

/** POST /api/vault/folders/:id/files  (multipart/form-data) */
export const uploadFiles = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId } = req.params;

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'No files provided' });
        }

        const uploaded = [];
        for (const file of files) {
            const { s3Key, s3Url } = await s3Service.uploadFile(
                file.buffer,
                file.originalname,
                file.mimetype,
                userId,
                folderId
            );

            const vaultFile = {
                _id: new mongoose.Types.ObjectId(),
                name: file.originalname,
                originalName: file.originalname,
                size: file.size,
                mimeType: file.mimetype,
                s3Key,
                s3Url,
                uploadedAt: new Date(),
            };

            folder.files.push(vaultFile as any);
            uploaded.push(vaultFile);
        }

        await folder.save();

        const folderObj = folder.toObject() as any;
        delete folderObj.passwordHash;
        res.status(201).json({ files: uploaded, folder: folderObj });
    } catch (err) {
        res.status(500).json({ message: 'Failed to upload files' });
    }
};

/** DELETE /api/vault/folders/:id/files/:fileId */
export const deleteFile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId, fileId } = req.params;

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const fileIndex = folder.files.findIndex((f) => f._id.toString() === fileId);
        if (fileIndex === -1) return res.status(404).json({ message: 'File not found' });

        const [removedFile] = folder.files.splice(fileIndex, 1);
        await s3Service.deleteFile(removedFile.s3Key).catch(() => { });
        await folder.save();

        res.json({ message: 'File deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to delete file' });
    }
};

/** GET /api/vault/folders/:id/files/:fileId/download */
export const getDownloadUrl = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId, fileId } = req.params;

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const file = folder.files.find((f) => f._id.toString() === fileId);
        if (!file) return res.status(404).json({ message: 'File not found' });

        const url = await s3Service.getSignedDownloadUrl(file.s3Key);
        res.json({ url, fileName: file.originalName });
    } catch (err) {
        res.status(500).json({ message: 'Failed to generate download URL' });
    }
};

/** POST /api/vault/folders/:id/files/:fileId/chat
 *  Body: { message: string, conversationHistory: [{role, content}][], isFirstMessage?: boolean }
 *  On first message fetches file from S3, generates a summary + answers the question.
 *  On subsequent messages uses only the conversation history (no file re-download).
 */
export const chatWithFile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId, fileId } = req.params;
        const { message, conversationHistory = [], isFirstMessage = false } = req.body;

        if (!message) return res.status(400).json({ message: 'message is required' });

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const file = folder.files.find((f) => f._id.toString() === fileId);
        if (!file) return res.status(404).json({ message: 'File not found' });

        let aiResponse: string;

        if (isFirstMessage) {
            // Download file from S3 and send to Gemini as inline data
            const { data, contentType } = await s3Service.downloadFileAsBase64(file.s3Key);
            const firstPrompt = `You are a legal AI assistant. The user has uploaded a file named "${file.originalName}" to their secure vault.

First, provide a concise summary of this document (2-3 paragraphs covering: document type, key parties/dates, and main purpose).

Then answer the user's initial question:
${message}

Format your response with the summary under a ## Summary heading, followed by ## Answer for the question response.`;

            aiResponse = await generateChatResponse(firstPrompt, {
                context: { inlineData: { data, mimeType: contentType } },
            });
        } else {
            // Continue conversation using history
            aiResponse = await generateChatResponse(message, {
                chatHistory: conversationHistory,
            });
        }

        res.json({ response: aiResponse });
    } catch (err: any) {
        res.status(500).json({ message: 'Failed to chat with file', error: err.message });
    }
};

/** POST /api/vault/folders/:id/files/:fileId/save-chat
 *  Body: { title: string, messages: [{role, content, timestamp}][] }
 */
export const saveChatSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId, fileId } = req.params;
        const { title, messages } = req.body;

        if (!title || !messages?.length) {
            return res.status(400).json({ message: 'title and messages are required' });
        }

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const file = folder.files.find((f) => f._id.toString() === fileId);
        if (!file) return res.status(404).json({ message: 'File not found' });

        const session = {
            _id: new mongoose.Types.ObjectId(),
            title,
            messages,
            createdAt: new Date(),
        };

        file.chatSessions.push(session as any);
        await folder.save();

        res.status(201).json({ message: 'Chat session saved', session });
    } catch (err: any) {
        res.status(500).json({ message: 'Failed to save chat session', error: err.message });
    }
};

/** GET /api/vault/folders/:id/files/:fileId/chat-sessions */
export const getChatSessions = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { id: folderId, fileId } = req.params;

        const folder = await VaultFolder.findOne({ _id: folderId, userId });
        if (!folder) return res.status(404).json({ message: 'Folder not found' });

        const file = folder.files.find((f) => f._id.toString() === fileId);
        if (!file) return res.status(404).json({ message: 'File not found' });

        res.json({ sessions: file.chatSessions });
    } catch (err: any) {
        res.status(500).json({ message: 'Failed to get chat sessions', error: err.message });
    }
};
