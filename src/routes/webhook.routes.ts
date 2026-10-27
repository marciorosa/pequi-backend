import { Router, Request, Response } from 'express';
import { s3Service } from '../services/s3.service';
import VaultFolder from '../models/vault.model';
import User from '../models/user.model';
import { sendWorkflowEmail } from '../services/email.service';
import { DocuSignService } from '../services/docusign.service';
import mongoose from 'mongoose';

const router = Router();

/**
 * POST /api/webhooks/docusign
 * Handles DocuSign Connect webhooks
 */
router.post('/docusign', async (req: Request, res: Response) => {
    try {
        const eventData = req.body;

        // DocuSign Connect JSON events usually have 'event' and 'data'
        const eventType = eventData.event;

        if (eventType === 'envelope-completed') {
            const envelopeSummary = eventData.data.envelopeSummary;
            const envelopeId = envelopeSummary.envelopeId;

            // Try different ways to get userId from DocuSign JSON payload
            let userId = eventData.data.customFields?.userId;
            if (!userId && envelopeSummary.customFields?.textCustomFields) {
                const uField = envelopeSummary.customFields.textCustomFields.find((f: any) => f.name === 'userId');
                userId = uField?.value;
            }


            // 1. Download the signed document from DocuSign
            const docs = envelopeSummary.envelopeDocuments || [];
            const signedDoc = docs.find((d: any) => d.name === 'Combined' || d.type === 'content');

            if (userId && mongoose.Types.ObjectId.isValid(userId)) {
                const user = await User.findById(userId);
                if (user) {
                    // Find or create 'Documentos Assinados' folder (also matches the legacy English name)
                    let folder = await VaultFolder.findOne({ userId, name: { $in: ['Documentos Assinados', 'Signed Documents'] } });
                    if (!folder) {
                        folder = await VaultFolder.create({
                            userId,
                            name: 'Documentos Assinados',
                            description: 'Documentos assinados via DocuSign',
                            color: '#10b981', // Green for signed
                            files: []
                        });
                    }

                    // Attempt to get PDF from payload, otherwise download it
                    let fileBuffer: Buffer;
                    if (signedDoc?.PDFBytes) {
                        fileBuffer = Buffer.from(signedDoc.PDFBytes, 'base64');
                    } else {
                        fileBuffer = await DocuSignService.getDocument(envelopeId, 'combined');
                    }

                    const fileName = `Assinado_${envelopeSummary.emailSubject || 'Documento'}_${Date.now()}.pdf`;

                    const { s3Key, s3Url } = await s3Service.uploadFile(
                        fileBuffer,
                        fileName,
                        'application/pdf',
                        userId.toString(),
                        folder._id.toString()
                    );

                    folder.files.push({
                        name: fileName,
                        originalName: fileName,
                        size: fileBuffer.length,
                        mimeType: 'application/pdf',
                        s3Key,
                        s3Url,
                        uploadedAt: new Date(),
                        chatSessions: []
                    } as any);

                    await folder.save();

                    // 2. Notify the Lawyer via Email
                    await sendWorkflowEmail(
                        user.email,
                        '🖋️ Documento assinado com sucesso',
                        `
                        <div style="font-family: sans-serif; color: #333;">
                            <h2 style="color: #10b981;">Contrato assinado!</h2>
                            <p>Olá, <strong>${user.name}</strong>,</p>
                            <p>Ótima notícia! O documento "<strong>${envelopeSummary.emailSubject}</strong>" foi assinado por todas as partes.</p>
                            <p>A versão final assinada foi salva automaticamente no seu <strong>Cofre Seguro</strong>, na pasta "${folder.name}".</p>
                            <br/>
                            <a href="${process.env.FRONTEND_URL}/dashboard/vault" style="background: #1a1a1a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver no Cofre</a>
                        </div>
                        `
                    );

                } else {
                }
            } else {
            }
        }

        res.status(200).json({ status: 'success' });
    } catch (error) {
        res.status(500).json({ status: 'error' });
    }
});

export default router;
