import Workflow from '../models/workflow.model';
import VaultFolder from '../models/vault.model';
import { generateChatResponse, generateContentWithFile, formatResponseToHTML } from './gemini.service';
import { sendWorkflowEmail } from './email.service';
import { s3Service } from './s3.service';
import { DocuSignService } from './docusign.service';

interface ExecutionResult {
    nodeId: string;
    output: any;
}

export class WorkflowExecutionService {
    /**
     * Execute a workflow
     */
    static async execute(workflowId: string, options: { testFile?: any } = {}) {
        const workflow = await Workflow.findById(workflowId);
        if (!workflow) throw new Error('Fluxo de trabalho não encontrado');

        const nodes = workflow.nodes;
        const edges = workflow.edges;
        const results: Map<string, any> = new Map();

        // 1. Find the trigger node
        const triggerNode = nodes.find(n => n.type === 'workflowNode' && (n.data as any).nodeType === 'trigger');
        if (!triggerNode) {
            return;
        }

        let currentNode = triggerNode;
        let iterations = 0;
        const maxIterations = nodes.length + 5;

        while (currentNode && iterations < maxIterations) {
            iterations++;
            const { id, data } = currentNode;
            const subtype = data.subtype;
            const config = data.config || {};


            try {
                switch (subtype) {
                    case 'file_upload':
                    case 'document_signed':
                        let fileBuffer: Buffer | null = options.testFile?.buffer || null;
                        let fileName = options.testFile?.name || 'document.pdf';


                        results.set(id, {
                            fileName,
                            fileBuffer,
                            content: fileBuffer ? `[Documento carregado: ${fileName}]` : 'Erro: nenhum conteúdo de arquivo foi enviado'
                        });
                        break;

                    case 'summarize':
                        const prevOutput = this.getPreviousOutput(id, edges, results);
                        const level = config.level || 'balanced';
                        const summaryPrompt = `CRITICAL: Analyze ONLY the attached document. Provide a ${level} legal summary including parties, effective dates, and core obligations.`;

                        let summary: string;
                        if (prevOutput?.fileBuffer) {
                            summary = await generateContentWithFile(summaryPrompt, prevOutput.fileBuffer, prevOutput.fileName);
                        } else {
                            summary = await generateChatResponse(`${summaryPrompt}\n\n[CONTEXT]: ${prevOutput?.content || 'No content provided'}`, { languageLevel: 'professional' });
                        }

                        results.set(id, { summary, content: summary, fileBuffer: prevOutput?.fileBuffer, fileName: prevOutput?.fileName });
                        break;

                    case 'risk_analysis':
                        const inputForRisk = this.getPreviousOutput(id, edges, results);
                        const depth = config.depth || 'standard';
                        const riskPrompt = `CRITICAL: Analyze ONLY the attached document. Identify the 5 most significant legal risks and suggest missing clauses.`;

                        let risks: string;
                        if (inputForRisk?.fileBuffer) {
                            risks = await generateContentWithFile(riskPrompt, inputForRisk.fileBuffer, inputForRisk.fileName);
                        } else {
                            risks = await generateChatResponse(`${riskPrompt}\n\n[CONTEXT]: ${inputForRisk?.content || 'No content provided'}`, { languageLevel: 'professional' });
                        }

                        results.set(id, { risks, content: risks, fileBuffer: inputForRisk?.fileBuffer, fileName: inputForRisk?.fileName });
                        break;

                    case 'draft_reply':
                        const inputForDraft = this.getPreviousOutput(id, edges, results);
                        const tone = config.tone || 'formal';
                        const purpose = config.purpose || 'General inquiry response';
                        const draftPrompt = `CRITICAL: Based ONLY on the attached document, draft a ${tone} legal response/reply. Purpose: ${purpose}. Ensure the tone is professionally ${tone}.`;

                        let draft: string;
                        if (inputForDraft?.fileBuffer) {
                            draft = await generateContentWithFile(draftPrompt, inputForDraft.fileBuffer, inputForDraft.fileName);
                        } else {
                            draft = await generateChatResponse(`${draftPrompt}\n\n[CONTEXT]: ${inputForDraft?.content || 'No content provided'}`, { languageLevel: 'professional' });
                        }

                        results.set(id, { draft, content: draft, fileBuffer: inputForDraft?.fileBuffer, fileName: inputForDraft?.fileName });
                        break;

                    case 'save_vault':
                        const contentToSave = this.getPreviousOutput(id, edges, results);
                        if (contentToSave?.content) {
                            const userId = (workflow as any).userId;

                            try {
                                // Find or create an 'Automações' folder (also matches the legacy English name)
                                let folder = await VaultFolder.findOne({ userId, name: { $in: ['Automações', 'Automations'] } });
                                if (!folder) {
                                    folder = await VaultFolder.create({
                                        userId,
                                        name: 'Automações',
                                        description: 'Relatórios e minutas gerados automaticamente',
                                        color: '#1a1a1a',
                                        files: []
                                    });
                                }

                                const fileName = `Analise_${workflow.name}_${Date.now()}.html`;
                                const buffer = Buffer.from(contentToSave.content);

                                const { s3Key, s3Url } = await s3Service.uploadFile(
                                    buffer,
                                    fileName,
                                    'text/html',
                                    userId.toString(),
                                    folder._id.toString()
                                );

                                folder.files.push({
                                    name: fileName,
                                    originalName: fileName,
                                    size: buffer.length,
                                    mimeType: 'text/html',
                                    s3Key,
                                    s3Url,
                                    uploadedAt: new Date(),
                                    chatSessions: []
                                } as any);

                                await folder.save();
                                results.set(id, { status: 'saved', folder: folder.name, fileName });
                            } catch (vaultErr) {
                                results.set(id, { error: 'Falha ao salvar no Cofre' });
                            }
                        }
                        break;

                    case 'email_client':
                        const finalOutput = this.getPreviousOutput(id, edges, results);
                        const recipient = config.recipient;
                        if (recipient) {
                            const subject = config.subject || 'Pequi';

                            // Check if digital signature is requested
                            if (config.useDocuSign && finalOutput?.fileBuffer) {
                                try {
                                    await DocuSignService.sendEnvelope({
                                        fileBuffer: finalOutput.fileBuffer,
                                        fileName: finalOutput.fileName || 'DocumentoParaAssinatura.pdf',
                                        emailSubject: subject,
                                        recipientEmail: recipient,
                                        recipientName: recipient.split('@')[0], // Fallback name
                                        userId: (workflow as any).userId.toString()
                                    });
                                    results.set(id, { status: 'docusign_sent', recipient });
                                } catch (dsErr) {
                                    results.set(id, { error: 'Falha na solicitação ao DocuSign' });
                                }
                            } else {
                                // Default simple email
                                const emailContent = `
                                    <div style="font-family: inherit; color: #333;">
                                        ${finalOutput?.content || '<p style="color: red;">Atenção: nenhum dado de análise foi gerado nesta etapa do fluxo de trabalho.</p>'}
                                    </div>
                                `;
                                await sendWorkflowEmail(recipient, subject, emailContent);
                                results.set(id, { status: 'sent', recipient });
                            }
                        }
                        break;

                    default:
                        results.set(id, { status: 'skipped' });
                }
            } catch (err) {
                results.set(id, { error: 'Falha na execução', details: (err as Error).message });
            }

            // Find next node
            const outgoingEdge = edges.find(e => e.source === id);
            if (outgoingEdge) {
                currentNode = nodes.find(n => n.id === outgoingEdge.target) as any;
            } else {
                currentNode = null as any;
            }
        }

        return Array.from(results.entries());
    }

    private static getPreviousOutput(currentNodeId: string, edges: any[], results: Map<string, any>) {
        const incomingEdge = edges.find(e => e.target === currentNodeId);
        if (incomingEdge) {
            return results.get(incomingEdge.source);
        }
        return null;
    }
}
