import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../types';
import LegalDocument, { ILegalDocument } from '../models/document.model';
import { createNotification } from './notification.controller';

const toDocumentResponse = (document: ILegalDocument) => ({
  id: document.id,
  title: document.title,
  content: document.content,
  documentType: document.documentType,
  templateStyle: document.templateStyle,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt
});

// Get document history
export const getDocumentHistory = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const documents = await LegalDocument.find({ userId: req.user.id })
      .select('-content')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      data: documents.map((document) => ({
        id: document.id,
        title: document.title,
        type: document.templateStyle ? 'Advanced Agreement' : 'Agreement',
        timestamp: document.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao carregar o histórico de documentos',
      error: (error as Error).message
    });
  }
};

// Get a single document
export const getDocument = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const documentId = req.params.id;
    const document = mongoose.isValidObjectId(documentId)
      ? await LegalDocument.findOne({ _id: documentId, userId: req.user.id })
      : null;

    if (!document) {
      return res.status(404).json({ message: 'Documento não encontrado' });
    }

    res.json({
      success: true,
      data: toDocumentResponse(document)
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao carregar o documento',
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

    const { title, content, documentType, templateStyle } = req.body;

    if (!title || !content || !documentType) {
      return res.status(400).json({ message: 'Título, conteúdo e tipo de documento são obrigatórios' });
    }

    const document = await LegalDocument.create({
      userId: req.user.id,
      title,
      content,
      documentType,
      templateStyle
    });

    // Create notification for the document creation
    await createNotification(
      req.user.id,
      'document',
      'Documento criado',
      `Seu documento "${title}" foi criado com sucesso.`,
      document.id
    );

    res.status(201).json({
      success: true,
      document: toDocumentResponse(document)
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

    const document = mongoose.isValidObjectId(documentId)
      ? await LegalDocument.findOneAndUpdate(
          { _id: documentId, userId: req.user.id },
          { $set: { ...(title && { title }), ...(content && { content }) } },
          { new: true }
        )
      : null;

    if (!document) {
      return res.status(404).json({ message: 'Documento não encontrado' });
    }

    // Create notification for the document update
    await createNotification(
      req.user.id,
      'document',
      'Documento atualizado',
      `Seu documento "${document.title}" foi atualizado com sucesso.`,
      document.id
    );

    res.json({
      success: true,
      message: 'Documento atualizado com sucesso',
      document: toDocumentResponse(document)
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao atualizar o documento',
      error: (error as Error).message
    });
  }
};

// Delete all of the user's documents
export const clearDocuments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    await LegalDocument.deleteMany({ userId: req.user.id });

    res.json({
      success: true,
      message: 'Documentos excluídos com sucesso'
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao excluir os documentos',
      error: (error as Error).message
    });
  }
};
