'use strict';

import * as docusign from 'docusign-esign';
import path from 'path';
import { ExternalServiceError, ValidationError } from '../utils/errors';

export class DocuSignService {
    private static apiClient = new docusign.ApiClient();

    /**
     * Initialize the API Client with JWT Authentication
     */
    private static async authenticate() {
        try {
            const privateKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY?.replace(/\\n/g, '\n');
            const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
            const userId = process.env.DOCUSIGN_USER_ID;
            const basePath = process.env.DOCUSIGN_BASE_PATH;

            if (!privateKey || !integrationKey || !userId) {
                throw new ValidationError('DocuSign configuration missing: RSA Private Key, Integration Key, or User ID');
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
            throw new ExternalServiceError('DocuSign Auth', 'Failed to authenticate with DocuSign', error);
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
                throw new ValidationError('DocuSign Account ID is missing');
            }

            const results = await envelopesApi.createEnvelope(accountId, {
                envelopeDefinition: env,
            });

            return results;
        } catch (error: any) {
            throw new ExternalServiceError('DocuSign', 'Failed to send envelope', error);
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
                throw new ValidationError('DocuSign Account ID is missing');
            }

            // This returns the document as a binary string (Buffer in Node context when using the SDK)
            const result = await envelopesApi.getDocument(accountId, envelopeId, documentId);

            // The SDK might return the results as a string or a buffer depending on the version/config
            return Buffer.from(result, 'binary');
        } catch (error: any) {
            throw new ExternalServiceError('DocuSign', 'Failed to download document', error);
        }
    }
}
