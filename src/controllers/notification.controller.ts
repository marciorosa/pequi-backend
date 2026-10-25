import { Request, Response } from 'express';
import { AuthRequest } from '../types';
import Notification from '../models/notification.model';
import mongoose from 'mongoose';

// Get all notifications for the user
export const getUserNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get query parameters
    const { type, limit = 50, offset = 0, read } = req.query;
    
    // Build query
    const query: any = { userId: req.user.id };
    
    // Filter by type if provided
    if (type && ['system', 'account', 'document', 'alert'].includes(type as string)) {
      query.type = type;
    }
    
    // Filter by read status if provided
    if (read !== undefined) {
      query.read = read === 'true';
    }

    // Get notifications
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit));
    
    // Get total count for pagination
    const total = await Notification.countDocuments(query);
    
    // Get unread count
    const unreadCount = await Notification.countDocuments({ 
      userId: req.user.id,
      read: false
    });

    res.json({
      success: true,
      notifications,
      meta: {
        total,
        unreadCount,
        offset: Number(offset),
        limit: Number(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving notifications', 
      error: (error as Error).message 
    });
  }
};

// Get notification by ID
export const getNotificationById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notificationId = req.params.id;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findOne({ 
      _id: notificationId,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving notification', 
      error: (error as Error).message 
    });
  }
};

// Mark a notification as read
export const markNotificationAsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notificationId = req.params.id;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findOneAndUpdate(
      { 
        _id: notificationId,
        userId: req.user.id
      },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error marking notification as read', 
      error: (error as Error).message 
    });
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await Notification.updateMany(
      { 
        userId: req.user.id,
        read: false
      },
      { read: true }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error marking all notifications as read', 
      error: (error as Error).message 
    });
  }
};

// Delete a notification
export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const notificationId = req.params.id;
    
    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      userId: req.user.id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error deleting notification', 
      error: (error as Error).message 
    });
  }
};

// Delete all notifications
export const deleteAllNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await Notification.deleteMany({ userId: req.user.id });

    res.json({
      success: true,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Error deleting all notifications', 
      error: (error as Error).message 
    });
  }
};

// Create a notification (internal function)
export const createNotification = async (
  userId: string,
  type: 'system' | 'account' | 'document' | 'alert',
  title: string,
  message: string,
  relatedId?: string
) => {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      relatedId,
      read: false
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    throw error;
  }
}; 