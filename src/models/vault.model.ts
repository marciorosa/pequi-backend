import mongoose, { Document, Schema } from 'mongoose';

// Chat message
export interface IChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

// Saved chat session
export interface IChatSession {
    _id: mongoose.Types.ObjectId;
    title: string;
    messages: IChatMessage[];
    createdAt: Date;
}

// File interface
export interface IVaultFile {
    _id: mongoose.Types.ObjectId;
    name: string;
    originalName: string;
    size: number;
    mimeType: string;
    s3Key: string;
    s3Url: string;
    uploadedAt: Date;
    chatSessions: IChatSession[];
}

// Folder interface
export interface IVaultFolder extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    files: IVaultFile[];
    isLocked: boolean;
    passwordHash?: string;
    color: string;
    createdAt: Date;
    updatedAt: Date;
}

const ChatMessageSchema = new Schema<IChatMessage>({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
}, { _id: false });

const ChatSessionSchema = new Schema<IChatSession>({
    title: { type: String, required: true },
    messages: [ChatMessageSchema],
    createdAt: { type: Date, default: Date.now },
});

const VaultFileSchema = new Schema<IVaultFile>({
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    s3Key: { type: String, required: true },
    s3Url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    chatSessions: { type: [ChatSessionSchema], default: [] },
});

const VaultFolderSchema = new Schema<IVaultFolder>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        name: {
            type: String,
            required: [true, 'O nome da pasta é obrigatório'],
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        files: [VaultFileSchema],
        isLocked: {
            type: Boolean,
            default: false
        },
        passwordHash: {
            type: String
        },
        color: {
            type: String,
            default: '#1a1a1a'
        }
    },
    {
        timestamps: true
    }
);

// Indexes
VaultFolderSchema.index({ userId: 1 });

const VaultFolder = mongoose.model<IVaultFolder>('VaultFolder', VaultFolderSchema);
export default VaultFolder;
