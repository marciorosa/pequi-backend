'use strict';

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { ExternalServiceError } from '../utils/errors';

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
    },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME as string;

export const s3Service = {
    /**
     * Upload a file buffer to S3
     */
    uploadFile: async (
        fileBuffer: Buffer,
        originalName: string,
        mimeType: string,
        userId: string,
        folderId: string
    ): Promise<{ s3Key: string; s3Url: string }> => {
        try {
            const ext = path.extname(originalName);
            const uniqueName = `${uuidv4()}${ext}`;
            const s3Key = `vault/${userId}/${folderId}/${uniqueName}`;

            const command = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
                Body: fileBuffer,
                ContentType: mimeType,
            });

            await s3Client.send(command);

            const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

            return { s3Key, s3Url };
        } catch (error) {
            throw new ExternalServiceError('AWS S3', 'Failed to upload file', error);
        }
    },
    
    /**
     * Upload a profile image buffer to S3
     */
    uploadProfileImage: async (
      fileBuffer: Buffer,
      originalName: string,
      mimeType: string,
      userId: string
    ): Promise<{ s3Key: string; s3Url: string }> => {
      try {
        const ext = path.extname(originalName);
        const uniqueName = `profile-${userId}-${Date.now()}${ext}`;
        const s3Key = `profiles/${userId}/${uniqueName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: mimeType,
          // ACL: 'public-read' // Usually not needed if bucket policies or signed URLs are used
        });

        await s3Client.send(command);

        const s3Url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

        return { s3Key, s3Url };
      } catch (error) {
        throw new ExternalServiceError('AWS S3', 'Failed to upload profile image', error);
      }
    },

    /**
     * Generate a pre-signed download URL (valid for specified duration)
     */
    getSignedDownloadUrl: async (s3Key: string, expiresInSeconds = 3600): Promise<string> => {
        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
            });

            const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
            return signedUrl;
        } catch (error) {
            throw new ExternalServiceError('AWS S3', 'Failed to generate signed URL', error);
        }
    },

    /**
     * Download a file from S3 and return as base64 string
     */
    downloadFileAsBase64: async (s3Key: string): Promise<{ data: string; contentType: string }> => {
        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
            });

            const response = await s3Client.send(command);
            const stream = response.Body as any;

            const chunks: Uint8Array[] = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            return {
                data: buffer.toString('base64'),
                contentType: (response.ContentType as string) || 'application/octet-stream',
            };
        } catch (error) {
            throw new ExternalServiceError('AWS S3', 'Failed to download file', error);
        }
    },

    /**
     * Delete a file from S3
     */
    deleteFile: async (s3Key: string): Promise<void> => {
        try {
            const command = new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key,
            });

            await s3Client.send(command);
        } catch (error) {
            throw new ExternalServiceError('AWS S3', 'Failed to delete file', error);
        }
    },
};
