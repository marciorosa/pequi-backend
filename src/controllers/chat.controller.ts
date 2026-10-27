import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import Chat, { IChat } from '../models/chat.model';
import mongoose from 'mongoose';
import { createNotification } from './notification.controller';

// Get all chats for a user
export const getUserChats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    // Fetch only essential data for the chat list (no messages)
    const chats = await Chat.find({ userId: req.user.id })
      .select('title createdAt updatedAt')
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      chats
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao carregar o histórico de conversas', 
      error: (error as Error).message 
    });
  }
};

// Get a single chat by ID
export const getChatById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const chatId = req.params.id;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'ID de conversa inválido' });
    }

    const chat = await Chat.findOne({ 
      _id: chatId,
      userId: req.user.id
    });

    if (!chat) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }

    res.json({
      success: true,
      chat
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao carregar a conversa', 
      error: (error as Error).message 
    });
  }
};

// Create a new chat
export const createChat = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const { title, messages } = req.body;

    // Create a new chat
    const chat = new Chat({
      userId: req.user.id,
      title: title || 'Nova conversa',
      messages: messages || []
    });

    await chat.save();
    
    // Create notification for the chat creation
    await createNotification(
      req.user.id,
      'account',
      'Nova conversa iniciada',
      `Sua conversa "${chat.title}" foi criada.`,
      chat._id instanceof mongoose.Types.ObjectId ? chat._id.toString() : String(chat._id)
    );

    res.status(201).json({
      success: true,
      chat
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao criar a conversa', 
      error: (error as Error).message 
    });
  }
};

// Update a chat (add messages, update title)
export const updateChat = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const chatId = req.params.id;
    const { messages, title } = req.body;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'ID de conversa inválido' });
    }

    // Find the chat
    const chat = await Chat.findOne({ 
      _id: chatId,
      userId: req.user.id
    });

    if (!chat) {
      return res.status(404).json({ message: 'Conversa não encontrada' });
    }

    // Check if new messages were added
    const hasNewMessages = messages && 
      Array.isArray(messages) && 
      messages.length > chat.messages.length;
    
    // Update the chat
    if (title) {
      chat.title = title;
    }

    if (messages) {
      chat.messages = messages;
    }

    await chat.save();

    // If there are new messages, create a notification
    if (hasNewMessages && messages) {
      // Get the newest message
      const newestMessage = messages[messages.length - 1];
      
      // If it's from AI, create a notification
      if (newestMessage && newestMessage.role === 'assistant') {
        await createNotification(
          req.user.id,
          'alert',
          'Nova resposta da IA',
          `Você recebeu uma nova resposta na conversa "${chat.title}".`,
          chat._id instanceof mongoose.Types.ObjectId ? chat._id.toString() : String(chat._id)
        );
      }
    }

    res.json({
      success: true,
      chat
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao atualizar a conversa', 
      error: (error as Error).message 
    });
  }
};

// Delete a chat
export const deleteChat = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Não autorizado' });
    }

    const chatId = req.params.id;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'ID de conversa inválido' });
    }

    const result = await Chat.deleteOne({ 
      _id: chatId, 
      userId: req.user.id 
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Conversa não encontrada ou já excluída' });
    }

    res.json({
      success: true,
      message: 'Conversa excluída com sucesso'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao excluir a conversa', 
      error: (error as Error).message 
    });
  }
}; 