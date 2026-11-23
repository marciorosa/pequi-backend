'use strict';

import * as docusign from 'docusign-esign';
import path from 'path';
import crypto from 'crypto';
import { ExternalServiceError, ValidationError } from '../utils/errors';

/**
 * Aceita a chave RSA do DocuSign como foi colada no painel da hospedagem:
 * com \\n literais, com quebras reais, numa linha só com espaços, entre aspas ou em base64.
 * Devolve o PEM com cabeçalho, corpo em linhas de 64 caracteres e rodapé.
 */
export const normalizePrivateKey = (raw?: string): string | undefined => {
    if (!raw) return undefined;
    let v = raw.trim().replace(/^['"]|['"]$/g, '').replace(/\\+r/g, '').replace(/\\+n/g, '\n').replace(/\r/g, '').trim();
    if (!v.includes('-----BEGIN')) {
        try {
            const decoded = Buffer.from(v, 'base64').toString('utf8');
            if (decoded.includes('-----BEGIN')) v = decoded.trim();
        } catch { /* não era base64 */ }
    }
    const m = v.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
    if (!m) {
        // Só o corpo da chave, sem cabeçalho: descobre se é PKCS#1 (RSA PRIVATE KEY) ou PKCS#8 (PRIVATE KEY)
        const body = v.replace(/\s+/g, '');
        if (!/^[A-Za-z0-9+/=]{100,}$/.test(body)) return v;
        const lines = (body.match(/.{1,64}/g) || []).join('\n');
        for (const label of ['RSA PRIVATE KEY', 'PRIVATE KEY']) {
            const pem = `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`;
            try { crypto.createPrivateKey(pem); return pem; } catch { /* tenta o próximo */ }
        }
        return v;
    }
    const body = m[2].replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [];
    return `-----BEGIN ${m[1]}-----\n${lines.join('\n')}\n-----END ${m[1]}-----\n`;
};

export class DocuSignService {
    private static apiClient = new docusign.ApiClient();

    /**
     * Initialize the API Client with JWT Authentication
     */
    private static async authenticate() {
        try {
            const privateKey = normalizePrivateKey(process.env.DOCUSIGN_RSA_PRIVATE_KEY);
            const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
            const userId = process.env.DOCUSIGN_USER_ID;
            const basePath = process.env.DOCUSIGN_BASE_PATH;

            if (!privateKey || !integrationKey || !userId) {
                throw new ValidationError('Configuração do DocuSign ausente: chave privada RSA, Integration Key ou User ID');
            }
            try {
                crypto.createPrivateKey(privateKey);
            } catch {
                throw new ValidationError(
                    `A chave RSA do DocuSign (DOCUSIGN_RSA_PRIVATE_KEY) não é uma chave privada válida: confira se foi colada inteira, ` +
                    `do -----BEGIN ao -----END, e se não é a chave pública (${privateKey.length} caracteres recebidos)`
                );
            }

            if (basePath) {
                this.apiClient.setBasePath(basePath);
            }

            // Scope for the token
            const scopes = [
                docusign.ApiClient.OAuth.Scope.SIGNATURE,
                docusign.ApiClient.OAuth.Scope.IMPERSONATION
            ];

            // expiresIn is 3600 seconds (1 hour)
            const results = await this.apiClient.requestJWTUserToken(
                integrationKey,
                userId,
                scopes,
                Buffer.from(privateKey),
                3600
            );

            this.apiClient.addDefaultHeader('Authorization', 'Bearer ' + results.body.access_token);
            return results.body.access_token;
        } catch (error) {
            throw new ExternalServiceError('DocuSign Auth', 'Falha ao autenticar no DocuSign', error);
        }
    }

    /**
     * Send a document for signature
     */
    static async sendEnvelope({
        fileBuffer,
        fileName,
        emailSubject,
        recipientEmail,
        recipientName,
        userId // Current app user ID to pass to webhook
    }: {
        fileBuffer: Buffer;
        fileName: string;
        emailSubject: string;
        recipientEmail: string;
        recipientName: string;
        userId: string;
    }) {
        try {
            await this.authenticate();

            const env = new docusign.EnvelopeDefinition();
            env.emailSubject = emailSubject;

            // Create the document
            const doc = new docusign.Document();
            const base64Doc = fileBuffer.toString('base64');
            doc.documentBase64 = base64Doc;
            doc.name = fileName;
            doc.fileExtension = path.extname(fileName).replace('.', '') || 'pdf';
            doc.documentId = '1';

            env.documents = [doc];

            // Create the signer
            const signer = docusign.Signer.constructFromObject({
                email: recipientEmail,
                name: recipientName,
                recipientId: '1',
                routingOrder: '1',
            });

            // Create a sign here tab
            const signHere = docusign.SignHere.constructFromObject({
                anchorString: '/sn1/',
                anchorYOffset: '10',
                anchorUnits: 'pixels',
                anchorXOffset: '20',
            });

            const signerTabs = docusign.Tabs.constructFromObject({
                signHereTabs: [signHere],
            });
            signer.tabs = signerTabs;

            // Manage recipients
            const recipients = docusign.Recipients.constructFromObject({
                signers: [signer],
            });
            env.recipients = recipients;

            // Webhook Configuration (Connect)
            const customField = docusign.TextCustomField.constructFromObject({
                name: 'userId',
                required: 'false',
                show: 'false',
                value: userId
            });
            env.customFields = docusign.CustomFields.constructFromObject({
                textCustomFields: [customField]
            });

            env.status = 'sent';

            const envelopesApi = new docusign.EnvelopesApi(this.apiClient);
            const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

            if (!accountId) {
                throw new ValidationError('O Account ID do DocuSign não foi configurado');
            }

            const results = await envelopesApi.createEnvelope(accountId, {
                envelopeDefinition: env,
            });

            return results;
        } catch (error: any) {
            throw new ExternalServiceError('DocuSign', 'Falha ao enviar o envelope', error);
        }
    }

    /**
     * Download a document from an envelope
     */
    static async getDocument(envelopeId: string, documentId: string = 'combined'): Promise<Buffer> {
        try {
            await this.authenticate();
            const envelopesApi = new docusign.EnvelopesApi(this.apiClient);
            const accountId = process.env.DOCUSIGN_ACCOUNT_ID;

            if (!accountId) {
                throw new ValidationError('O Account ID do DocuSign não foi configurado');
            }

            // This returns the document as a binary string (Buffer in Node context when using the SDK)
            const result = await envelopesApi.getDocument(accountId, envelopeId, documentId);

            // The SDK might return the results as a string or a buffer depending on the version/config
            return Buffer.from(result, 'binary');
        } catch (error: any) {
            throw new ExternalServiceError('DocuSign', 'Falha ao baixar o documento', error);
        }
    }
}
