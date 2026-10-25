import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Configure multer storage (Memory for S3)
const storage = multer.memoryStorage();

// Create multer upload instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    // Accept only certain file types
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF and PDF files are allowed.'));
    }
  }
});

// Middleware for handling file uploads (profile image, etc.)
export const handleFileUpload = upload.single('image'); 