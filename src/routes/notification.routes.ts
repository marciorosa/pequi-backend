import express from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get all notifications for the user
router.get('/', notificationController.getUserNotifications);

// Get notification by ID
router.get('/:id', notificationController.getNotificationById);

// Mark notification as read
router.put('/:id/read', notificationController.markNotificationAsRead);

// Mark all notifications as read
router.put('/read-all', notificationController.markAllNotificationsAsRead);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

// Delete all notifications
router.delete('/', notificationController.deleteAllNotifications);

export default router; 