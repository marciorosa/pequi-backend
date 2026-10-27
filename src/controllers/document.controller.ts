import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import { createNotification } from './notification.controller';

// Get document history
export const getDocumentHistory = async (req: AuthRequest, res: Response) => {
  try {
    // For now, just return an empty array
    // In a production app, you would fetch this from a database
    res.json({
      success: true,
      data: []
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao carregar o histórico de documentos', 
      error: (error as Error).message 
    });
  }
};

// Create a new document
export const createDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const { title, content, documentType } = req.body;
    
    if (!title || !content || !documentType) {
      return res.status(400).json({ message: 'Título, conteúdo e tipo de documento são obrigatórios' });
    }
    
    // Here, you would typically save the document to your database
    // For now, we'll just simulate a successful creation
    const documentId = `doc_${Date.now()}`;
    
    // Create notification for the document creation
    await createNotification(
      req.user.id,
      'document',
      'Documento criado',
      `Seu documento "${title}" foi criado com sucesso.`,
      documentId
    );
    
    res.status(201).json({
      success: true,
      document: {
        id: documentId,
        title,
        documentType,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao criar o documento', 
      error: (error as Error).message 
    });
  }
};

// Update a document
export const updateDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }
    
    const documentId = req.params.id;
    const { title, content } = req.body;
    
    if (!title && !content) {
      return res.status(400).json({ message: 'Informe pelo menos um campo para atualizar' });
    }
    
    // Here, you would update the document in your database
    // For now, we'll just simulate a successful update
    
    // Create notification for the document update
    await createNotification(
      req.user.id,
      'document',
      'Documento atualizado',
      `Seu documento "${title || 'Sem título'}" foi atualizado com sucesso.`,
      documentId
    );
    
    res.json({
      success: true,
      message: 'Documento atualizado com sucesso'
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao atualizar o documento', 
      error: (error as Error).message 
    });
  }
}; 