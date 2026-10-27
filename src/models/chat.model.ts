import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface IChat extends Document {
  title: string;
  userId: mongoose.Schema.Types.ObjectId;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const ChatSchema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  messages: [MessageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Auto-generate title from first message if not provided
ChatSchema.pre('save', function(next) {
  // Using a type assertion with unknown as an intermediate step
  const chat = this as unknown as IChat;
  
  // Auto-generate title if not provided and messages exist
  if ((!chat.title || chat.title === 'New Chat' || chat.title === 'Nova conversa') && chat.messages.length > 0) {
    const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
      // Truncate long messages and add ellipsis
      const content = firstUserMessage.content;
      chat.title = content.length > 30 ? content.substring(0, 30) + '...' : content;
    }
  }
  
  next();
});

const Chat = mongoose.model<IChat>('Chat', ChatSchema);

export default Chat; 