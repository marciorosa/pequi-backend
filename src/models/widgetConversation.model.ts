import mongoose, { Document, Schema } from 'mongoose';

/**
 * Conversa aberta pelo widget no site do escritório.
 * O visitante conversa sem conta; depois de algumas mensagens deixa o contato,
 * que fica disponível para o escritório.
 */
export interface IWidgetConversation extends Document {
  tenantId: mongoose.Types.ObjectId;
  visitorId: string;
  origin?: string;
  lead?: { name?: string; email?: string; phone?: string; capturedAt?: Date };
  messages: Array<{ role: 'user' | 'assistant'; content: string; at: Date }>;
  userMessageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const WidgetConversationSchema = new Schema<IWidgetConversation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    visitorId: { type: String, required: true },
    origin: { type: String },
    lead: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      capturedAt: { type: Date },
    },
    messages: [
      {
        _id: false,
        role: { type: String, enum: ['user', 'assistant'], required: true },
        content: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
    userMessageCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WidgetConversationSchema.index({ tenantId: 1, visitorId: 1 }, { unique: true });
WidgetConversationSchema.index({ tenantId: 1, updatedAt: -1 });

export default mongoose.model<IWidgetConversation>('WidgetConversation', WidgetConversationSchema);
