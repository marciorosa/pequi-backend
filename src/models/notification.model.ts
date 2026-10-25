import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'system' | 'account' | 'document' | 'alert';
  title: string;
  message: string;
  read: boolean;
  relatedId?: string; // Optional reference to a document or other entity
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['system', 'account', 'document', 'alert'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  relatedId: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Index to improve query performance
NotificationSchema.index({ userId: 1, read: 1, type: 1 });
NotificationSchema.index({ createdAt: -1 });

export default mongoose.model<INotification>('Notification', NotificationSchema); 